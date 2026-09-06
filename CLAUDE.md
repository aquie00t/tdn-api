# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TDN-API — the Fastify + Prisma/PostgreSQL + Redis backend for The Developer Network. All user content lives in a single `Post` model discriminated by `type` (`post`, `job`, `news`, `update`). Auth is JWT access (15 min) + refresh token (30 min, httpOnly signed cookie), with GitHub/Google OAuth.

## Commands

Package manager is **pnpm** (`engine-strict=true`, Node from `.nvmrc`).

```bash
pnpm dev                  # tsx watch, NODE_ENV=development
pnpm build                # tsc -p tsconfig.build.json && tsc-alias (aliases are rewritten post-compile)
pnpm start                # node dist/index.js, NODE_ENV=production

pnpm lint                 # eslint src/**/*.ts    (tests/ and prisma/ are ignored by eslint)
pnpm format:check         # prettier check — CI fails on unformatted files
pnpm test:unit            # fast, no external services
pnpm test:integration     # needs Postgres; resets the test DB
pnpm test:e2e             # needs Postgres + Redis; resets the test DB
pnpm test                 # everything via vitest.config.ts (rarely what you want)

pnpm db:generate          # prisma generate → src/generated/prisma (gitignored; run after clone/schema change)
pnpm db:studio
pnpm prisma migrate dev --name <name>   # prisma.config.ts loads .env.$NODE_ENV (default development)
```

Run a single test file or case:

```bash
pnpm vitest run --config vitest.unit.config.ts tests/unit/core/use-cases/auth/login-usecase.test.ts
pnpm vitest run --config vitest.e2e.config.ts tests/e2e/post/create.test.ts -t "creates a post"
```

Env files are per-`NODE_ENV`: `.env.development`, `.env.test`, `.env.production` (loaded by `@fastify/env` in `src/http/plugins/env.plugin.ts` and by `prisma.config.ts`). `.env.example` lists every key. `DISABLE_RATE_LIMIT=true` in test envs.

Integration and E2E global setups run `pnpm prisma migrate reset --force` against `.env.test` and seed fixtures — never point `.env.test` at a database you care about. E2E additionally seeds a bot user (`tests/e2e/test-constants.ts`).

## Architecture

Strict Clean Architecture / DDD. Dependencies point inward only; violations are the main thing to check in review.

```
src/core/domain/       Entities (private props + getters), enums, prop interfaces. ZERO external imports — no Prisma, no Fastify.
src/core/ports/        Interfaces only: repositories/ and services/ (CachePort, StoragePort, EmailPort, RealtimePort, TransactionPort, …).
src/core/use-cases/    Business logic. One folder per feature: *.usecase.ts, *.input.ts, *.output.ts, index.ts. Depends only on ports.
src/core/errors/       CustomError subclasses grouped by domain, each carrying a statusCode. Re-exported from @core/errors.
src/infrastructure/    Port implementations: persistence/ (Prisma repos + mappers), security/, external/ (Resend, OAuth, S3/R2, DeepL), realtime/, jobs/.
src/http/              Fastify only: routes/ (TypeBox schemas + rate limit), controllers/ (thin), plugins/, decorators/, types/schemas/ (TypeBox DTOs).
```

Path aliases (`tsconfig.json`, resolved at build time by `tsc-alias`): `@core/*`, `@infrastructure/*`, `@plugins/*`, `@custom/*`, `@routes/*`, `@controllers/*`, `@decorators/*`, `@hooks/*`, `@typings/*`, `@generated/*`.

### Bootstrap order

`src/index.ts` → `App` (`src/app.ts`). Order in `App` matters: env plugin + `await server.after()` first (everything downstream reads `fastify.config`), then core plugins, then `errorHandler` → `prisma` → `dependencyInjection`, another `after()`, then the cron purge plugins, decorators, and finally routes under `/api/v1/*`. `App.init()` returns a ready instance without listening — that's what E2E tests use via `server.inject()`.

### Dependency injection (awilix)

`src/http/plugins/dependency-injection.plugin.ts` registers `fastify.prisma`, `fastify.log`, `fastify.config`, `fastify.jwt`, `fastify` itself as values, then spreads the modules in `src/http/plugins/di/*.di.ts`. Injection mode is **CLASSIC** — resolution is by constructor *parameter name*, so renaming a constructor parameter silently breaks wiring. Use `asClass(X).singleton()`; use `asFunction` only when a dependency is a plain config value (e.g. `config.OTP_EXPIRY_SECONDS`).

Adding a service/use-case/controller means three edits: the class, its `*.di.ts` registration, and (for controllers and shared services) the `Cradle` interface in `src/http/types/fastify-awilix.d.ts`. Routes pull collaborators via `const { xController } = fastify.diContainer.cradle;` and bind methods: `controller.method.bind(controller)`.

### Request flow

Route (TypeBox schema + `config.rateLimit` + `onRequest: [fastify.authenticate]`) → controller (extract `request.user.id` and validated body/params, no logic) → use-case (ports only) → Prisma repository. Mappers in `src/infrastructure/persistence/mappers/` are three-way: `toDomain()`, `toPrismaCreate()`, `toResponse()` (strips sensitive fields, rewrites media keys onto `R2_PUBLIC_URL`).

Success responses are always `{ data, meta: { timestamp } }`. Errors are thrown from use-cases (never swallowed) and rendered as RFC 7807 by `src/http/plugins/custom/error-handler.plugin.ts`; anything extending `CustomError` maps to its own `statusCode`, everything else becomes a generic 500 with the real error logged.

Auth decorators: `fastify.authenticate` (required) and `fastify.optionalAuthenticate` (populates `request.user` when a token is present — used by public feed endpoints to compute `isLiked`/`isBookmarked`).

### Native clients

One API, two clients. There is no separate mobile endpoint set; the difference is which **channel** a session is delivered on.

**The channel rule:** a request is answered on the channel it arrived on. `/auth/refresh` and `/auth/logout` read the refresh token from the signed cookie *or* the request body, and refresh answers on whichever one carried it — so a browser, which always reaches us through the cookie, can never be answered with a refresh token in the body. That is the whole of the web's protection here and it is not conditional on anything the caller claims. Login has no incoming channel to mirror, so it takes `client: "web" | "native"` (absent means web); `native` returns `refreshToken`/`refreshTokenExpiresAt` in the body and sets no cookie. The flag grants nothing to an attacker — it only lets somebody who already has the password receive the token differently. **The OAuth exchange takes no such flag** — and must not. The channel is recorded on the exchange code when the flow *starts*, from the redirect target it was started for, and read back in `OAuthExchangeUseCase`. Whoever calls the exchange endpoint chooses nothing: a browser holding a code it can see in its own URL would otherwise trade it for a thirty-day refresh token instead of a fifteen-minute access token.

`GET /oauth/{github,google}?redirect=…` picks that target from an **exact-match** allow-list (`OAUTH_REDIRECT_ALLOWLIST` for browsers, `OAUTH_NATIVE_REDIRECT_ALLOWLIST` for the app's scheme; absent means the web app's own page). No prefix test, no host comparison — the target receives the exchange code, so a loose match hands a session to whoever owns the address. An unknown target is a 400, not a quiet fallback.

The target is stored against a random `state` (`BeginOAuthUseCase`, 10-minute TTL in the cache) and spent by the callback (`ConsumeOAuthStateUseCase`, single use). That closes something that was open before this existed: with no `state`, an attacker could start a flow with their own account and have a victim's browser finish it, leaving them signed in as the attacker. A callback with no usable state completes nothing and is answered on the default web target with `?error=invalid_state` — every exit from a callback is a redirect, because there is no client left to read a problem document.

**Rotation has a grace window.** Reuse detection is strict — presenting a retired token revokes every session — which is right on the web and hazardous on a phone, where a refresh whose *response* is lost leaves the client retrying with a token already retired. `RefreshToken.revokedAt` and `replacedById` let `RefreshUseCase.resolveRetry` tell the two apart: inside `REFRESH_ROTATION_GRACE_SECONDS` (30), with a successor that is still untouched, it is a retry — the successor is retired in turn and a fresh pair issued. Tokens are stored hashed, so the lost response cannot be replayed; the retry gets new tokens, not the old ones. Outside the window, or with a successor that has been used, it is the alarm it always was.

**Rate limiting keys on the account** for authenticated traffic and on the IP for everything else (`rateLimitKeyFor`), because carrier NAT puts thousands of subscribers behind one address. The bearer token is verified inside the key generator rather than read from `request.user`: `@fastify/rate-limit` installs a global `onRequest` hook that runs *before* a route's `onRequest: [authenticate]`, so `request.user` is still empty there. `STRICT` overrides that with its own IP key, because it guards login and registration: with no proven account, a caller could attach a token of its own and be handed a fresh bucket per account it holds. Keeping registration on the IP key is what stops it collecting them.

`GET /meta/client` reports the build floor (`MOBILE_MIN_SUPPORTED_BUILD`, zero meaning none) so a published app can be told it is too old. A web bundle is replaced every morning; an app version lives on phones for months, and without this there is no safe way to make a breaking change.

### Retried writes

A client that loses the *response* to a request cannot know whether the request landed, and on a mobile network that is routine. `Idempotency-Key` makes the retry safe: the claim is a single `SET NX EX` through `CachePort.setIfAbsent`, so the store decides the race rather than the API reading and then writing.

Opt-in per route (`config: { idempotency: true }`) on the seven writes where a duplicate is real damage — posts, both comment endpoints, articles, messages and the two upload endpoints. Everything else is already repeatable: likes, follows and bookmarks are idempotent, a report has a unique constraint, a device registration is an upsert.

The record key carries the **account** (`idem:v1:<userId>:<method>:<route>:<key>`) because a key is a value the client invents and two people can pick the same one. It also carries a fingerprint of the body, so a key reused with a different request is a 409 rather than a wrong answer replayed. Only 2xx responses are stored — a 4xx is deterministic and a 5xx must stay retryable, so neither spends the key.

**It fails open:** an unreachable Redis logs and lets the request through, because this is a safety net over a write that already works and a hard dependency would turn a cache blip into "nobody can post". An endpoint that moves money should revisit that trade rather than inherit it.

`docs/idempotency.md` is the client-facing contract.

### Rate limiting

`RateLimitPolicies` in `src/http/plugins/rate-limit.plugin.ts`: `STRICT` (3/15 min, `continueExceeding`) for login/register, `SENSITIVE` (5/min) for password reset, verification, and write/social actions, `STANDARD` (60/min) for authenticated reads, `PUBLIC` (100/min). Global default is 100/min. Requests with `Authorization: Bot <token>` are allow-listed after a sha256 lookup against `user.botToken` — suspended bots (`bannedAt`) are excluded from that lookup.

### Account suspension

`User.bannedAt` suspends an account. There is no endpoint and no admin panel: a ban is applied by hand against the database (`UPDATE "users" SET "bannedAt" = now() WHERE username = '…'` — the quotes matter, the column is camelCase like the rest of that table).

Because of that, the check has to read the row. `assertAccountActive` (`src/http/hooks/assert-account-active.ts`) runs from **both** auth hooks after the token verifies: one primary-key lookup selecting one column, paid only by requests that carry a token, so guest traffic on public endpoints is unchanged. A JWT is good for 15 minutes and proves who signed in, not that they are still allowed in — reading the row is what makes a ban immediate instead of eventual. The same lookup also rejects a token whose account no longer exists, which the purge job could previously leave live. The bot path folds `bannedAt: null` into the lookup it already does, and the WebSocket handshake repeats the check before `wsManager.addClient`.

There is no event to hang "close their socket" on, so `assertAccountActive` does it opportunistically: the banned client's next HTTP request both 403s and drops the socket. Best effort — `WebSocketManager` is an in-process map, so a socket held by another instance survives until it drops on its own; a banned user can act through none of it either way.

`AccountBannedError` is **403**, not 401: a 401 makes the client refresh, fail, and dump the user at the login screen with no explanation. The same check sits beside every existing `isDeleted()` call (login, refresh, both OAuth logins, the token flows) and is tested **before** it, so a suspended account is never handed the recovery token a pending deletion would earn it.

### Media moderation

Every upload endpoint — `POST /media` (post *and* comment media), `POST /articles/cover`, `PATCH /me/avatar`, `PATCH /me/banner` — goes through `UploadModeratedMediaUseCase` (`src/core/use-cases/media/upload-moderated-media/`). It sniffs the format from the file's magic bytes (`src/core/use-cases/shared/media/detect-media-type.ts`; the client's MIME type and filename are never trusted), then splits:

- **Images** are scanned before a byte reaches R2, so a refused file never gets a URL. A provider error fails the upload closed (`ModerationUnavailableError`, 503).
- **Videos** are stored as `PENDING` and scanned by the `media-moderation` cron worker, because the provider has to fetch and sample them.

Each stored file gets a `MediaAsset` row. **That row is what makes an uploaded key trustworthy:** `CreatePostUseCase` and `CreateCommentUseCase` resolve every submitted `mediaUrls` entry back to an asset via `resolveAttachableMedia` and reject it (`MediaNotOwnedError`, 400) unless this author uploaded it, through the matching `MediaChannel`, and moderation did not reject it. Without that check the pipeline is decorative — the request body accepts arbitrary URLs.

Verdicts are tiered: explicit sexual content, gore, self-harm and hate imagery are rejected; suggestive content, weapons and depicted violence only set `isSensitive` so the client blurs them (this platform is full of game screenshots). Thresholds and the class-to-tier map live in `src/infrastructure/external/moderation/score-to-verdict.ts`, and raw provider scores are stored on every asset so they can be retuned.

Posts, comments and articles carry denormalised `isSensitive` / `mediaStatus` columns; the mappers withhold `mediaUrls` while `mediaStatus !== APPROVED` but still serve the text. `MODERATION_ENABLED=false` (test and local) swaps in `NoopModerationService`, which approves everything — it is never a fallback for a provider that is down.

### Direct messaging

One-to-one only. `Conversation` stores its participant pair **ordered** (`userAId < userBId`), which is the only thing making the unique constraint on the pair mean anything — `Conversation.orderPair` does the sorting and `PrismaConversationRepository.create` is an upsert, so two people writing to each other at once join one thread instead of racing. Nothing outside `conversation.entity.ts` and its mapper reads the A/B columns: every question is answered per-viewer (`otherParticipantId`, `unreadFor`, `canSend`, `isRequestFor`).

A conversation opened by somebody the recipient does not follow starts `PENDING`: it goes to a requests tab, only the initiator may write, and it emits `conversation:request` rather than `message:new` so it raises no unread badge. `getTotalUnreadCount` sums `ACCEPTED` conversations only. Declining sets `DECLINED` and keeps the row — deleting it would let the refused account open a fresh request immediately.

Per-side read state (`userXUnread`, `userXLastReadAt`) lives on the conversation, written in exactly two places: `applyNewMessage` (inside the message's transaction) and `markRead`. Messages are soft-deleted so the thread keeps its shape, and the mapper withholds a withdrawn message's text.

The inbox and threads page on a **keyset cursor** (`src/core/use-cases/shared/pagination/keyset-cursor.ts`), which carries the timestamp *and* the row id — an `orderBy` tiebreaker cannot help, since ordering never decides which rows a page contains, and rows sharing a timestamp to the millisecond are routine here. Conversations sort on `lastActivityAt`, never on the nullable `lastMessageAt`: Postgres puts NULLs first in a DESC order, so empty threads would pin above active ones and no cursor could resume from inside that block.

Message media rides the same pipeline as post media through its own `MediaChannel.MESSAGE_MEDIA` (`POST /messages/media`) and `MediaOwnerKind.MESSAGE`; `SendMessageUseCase` resolves every submitted URL via `resolveAttachableMedia`, exactly as `CreatePostUseCase` does. A rejected video reaches its sender as a `message:media_rejected` realtime event instead of a `Notification` row — the notification target can only point at public content.

Chat events are namespaced in `src/core/domain/constants/chat-events.constants.ts` and travel the existing Redis `realtime_events` channel; `RealtimeEventPayload` is a union of the notification and chat payload shapes.

Message text is **encrypted at rest**: `messages.content` and the denormalised `conversations.lastMessagePreview` hold AES-256-GCM ciphertext under `MESSAGE_ENCRYPTION_KEY` (required, no default — the service will not boot without it). Encryption lives in `PrismaMessageRepository` and `PrismaConversationRepository`, deliberately not in the mappers and not in the domain: what a row looks like at rest is a persistence concern, and `Message.content` stays plaintext everywhere above those classes, `Message.preview()` included. The shared version logic is `src/infrastructure/persistence/encryption/encrypted-column.ts` — `encVersion` / `previewEncVersion` are `0` plaintext (pre-encryption rows, read as-is), `1` server-key, `2` client-encrypted and passed through untouched, which is the seam end-to-end encryption would use. The version is a column rather than a string prefix because a plaintext message starting with that prefix would be mistaken for ciphertext. There is no backfill: the rows that predated encryption were test data and were dropped rather than migrated, so version `0` should not appear in production. The read path still handles it and should stay — it is what let the migration deploy ahead of any data work, and it is what a rollback would land on. Rotating the key orphans every row written under the old one; there is no re-encrypting backfill.

Two promises the feature makes are kept in code rather than in the mapper. **Withdrawing a message destroys it**: `PrismaMessageRepository.softDelete` blanks the text — as `encrypt("")`, because a bare `""` in a column marked as ciphertext is too short to decrypt — and clears `mediaUrls`, while `DeleteMessageUseCase` removes the objects from R2 first (the row is what names them) and detaches the `MediaAsset` rows. The tombstone survives so a reply still has something to answer. Previously this wrote only `deletedAt`, so "delete" meant "hide from the API". **History expires**: `MessageRetentionScheduler` runs `PurgeExpiredMessagesUseCase` nightly (`MESSAGE_RETENTION_DAYS`, default 365), deleting messages and their storage objects in batches — media before rows, always — and then clearing the previews and unread counters of emptied threads via `clearExpiredPreviews`. The conversation row itself stays; `lastActivityAt` is deliberately untouched so a cleanup job cannot reshuffle an inbox.

`docs/direct-messaging.md` is the client-facing contract for this feature — endpoints, response objects, realtime events and error titles. Keep it in step with the schemas when the surface changes.

### Blocking

`Block` (`prisma/models/block.prisma`) is stored **directionally** — unlike `Conversation`, which orders its pair so `(a,b)` and `(b,a)` collapse into one row. Direction is the question here: a profile has to say whether *you* blocked *them* (`isBlocked`, offers an unblock button) or the reverse (`isBlockedBy`, a wall), and those render differently.

The effect is symmetric anyway, and that is the whole design: **`IBlockRepository.getInvisibleUserIds(viewerId)` unions both directions**, and every listing read takes that one set — feed candidates and their count, `findByIds` hydration, the inbox, the unread badge, a user's timeline. Pairwise gates use `existsBetween` instead. `assertNotBlocked` and `assertConversationVisible` (`src/core/use-cases/shared/blocking/`) hold the two repeated shapes.

Two things are easy to get wrong here:

- **`authorId` collides.** `followingIds`, a pinned `authorId` and the blocked-author exclusion all write the same Prisma key, and the last spread wins. `PrismaPostRepository.authorFilter` merges them into one condition; a `followedOnly` feed is exactly the case a naive spread would silently drop the exclusion in.
- **The feed's ranked snapshot outlives a block** by up to `SCROLL_SNAPSHOT_TTL_SECONDS`. Rather than invalidate it, `excludeAuthorIds` is applied *again* at `findByIds` hydration, so a stale snapshot heals itself and the short page is filled by the top-up path that already exists.

Blocking is announced where the client needs a screen (`UserBlockedError`, **403**, on follow — a silent no-op reads as a bug) and hidden where announcing it would leak (DM answers `InvalidRecipientError`/`ConversationNotFoundError`, the same shapes those endpoints already use so thread membership cannot be probed). `BlockUserUseCase` writes the block and both unfollows in one transaction — which is why `TransactionContext` carries `followUserRepository` and `blockRepository`. Nothing else is touched: a hidden conversation keeps its status, counters and history, and unblocking restores it whole.

`docs/blocking.md` is the client-facing contract.

### Content reporting

`POST /reports` files one person's report of a **post or comment** — nothing else. An account is dealt with by blocking it, and a direct message is not public content, so reporting one would mean handing its plaintext to an operator. There is no read endpoint and no status endpoint: serving the queue would publish what an account has been accused of, and a report is closed by hand, exactly like a ban.

The row carries a **copy** of what was reported — `targetAuthorId`, `contentSnapshot`, `mediaKeys`, all resolved at write time — and `targetId` is a plain column rather than a foreign key. That is the whole design: the quickest response available to a reported account is to delete the post, and a cascade would let them empty the queue. A reported comment also stores `targetParentId` so the email can link to the post it lives under; null for a comment on an article, which is addressed by slug.

`@@unique(reporterId, targetKind, targetId)` makes a repeat report idempotent (`create` returns null on P2002, the use case answers `created: false`, the endpoint answers the same `received: true` either way) and is what makes the threshold meaningful: the alert counts rows, so it counts people.

Two emails go to `MODERATION_ALERT_EMAIL`, and an empty address turns both off without affecting anything else. The **escalation alert** fires once, when `REPORT_ALERT_THRESHOLD` (3) separate people have reported the same content — compared with `===` so it does not repeat on every later report. The **morning summary** (`ReportDigestScheduler`, its own pinned timezone like the daily digest) lists the whole open queue rather than the last day's arrivals: a window anchored to the previous send loses what it covered whenever that email fails. An empty queue sends nothing. `ReportDigestDelivery` is the per-day claim, the same multi-instance guard `DigestDelivery` provides per user, taken last once there is something to send.

`groupReports` (`src/core/use-cases/shared/reports/group-reports.ts`) is the pure presentation logic both emails share — collect by target, tally reasons, take the excerpt from the *earliest* report. Nothing is ever hidden automatically at any count; reports inform a person, and a rule that took content down on a count is one a group can point at anything it dislikes.

`docs/reporting.md` is the operator-facing description — the endpoint, the emails, and the SQL for reading and closing the queue.

### Mentions

`@handle` in a post, comment or article body resolves to real accounts at **write time** and is stored as a relation, never as the text that was typed — so a rename keeps historical mentions pointing at the right account and the response always serves the current handle. Reads carry `mentions: [{ id, username }]` beside `tags`.

Parsing is a pure helper, `src/core/use-cases/shared/mentions/extract-mentions.ts` — deliberately *not* the pattern post hashtags follow, which are regex-extracted inside `PrismaPostRepository.create` and therefore invisible to the use-case layer. `resolveMentions` (same folder) turns handles into accounts via `IUserRepository.findManyByUsernames`, which tries an index-backed exact `in` first and only falls back to `mode: "insensitive"` for what is left. An unresolvable handle is dropped silently; more than `MAX_MENTIONS` (10) distinct handles in one body is a `MentionLimitExceededError` (400) raised on the *written* handles, before any lookup.

`NotifyMentionedUsersUseCase` (`src/core/use-cases/notification/notify-mentioned-users/`) is the single fan-out, called fire-and-forget after the write commits, the way `NotifyNewPostUseCase` is. It enforces the suppression rules in one place: never the issuer, once per person, never for someone in `excludeUserIds` — which each caller fills with whoever that same action already notified (the post author being commented on, the quoted author) — and never across a block, which it resolves itself because that rule is global rather than per-caller. `NotifyNewPostUseCase` takes the same `excludeUserIds` field, and `CreatePostUseCase` fills it with the mentioned ids plus the quoted author, so one post is one notification per person: **QUOTE > MENTION > NEW_POST**, more specific wins. Both exclusion inputs are already resolved before either fan-out is dispatched, so neither has to wait on the other. Articles are quiet while they are drafts: `PublishArticleUseCase` notifies everyone the body names, and `UpdateArticleUseCase` notifies only the *newly* named.

`docs/mentions.md` is the client-facing contract — handle grammar, the `mentions` object, notification targets and error titles.

### Daily digest

One email a morning (`DAILY_DIGEST_CRON`, default 09:00 `Europe/Istanbul`) to every verified, active, subscribed account with something waiting: unread notifications, and posts from the last day matching their interests. Both sections empty means **no email** — nothing teaches people to filter a digest faster than one that says nothing happened.

`SendDailyDigestUseCase` (`src/core/use-cases/digest/send-daily-digest/`) fetches the candidate pool **once per run** via `IPostRepository.findFeedCandidates` — the only repository method taking a date range — then ranks it per recipient with the feed's own `indexInterests` + `scoreCandidate`. That ranker is pure, so one query serves thousands of rankings, and `followingIds` is deliberately empty: the digest is about topics, the feed is about follows. A user with no interest profile needs no fallback — every affinity term scores zero and the order degrades to freshness and engagement.

**`DigestDelivery` is the whole multi-instance guard.** Several instances run the same schedule and nothing coordinates them, so the claim is the write: a unique `(userId, digestOn)` row inserted *before* the send, with a P2002 meaning somebody else got there first. The claim is taken last, only once there is something to send, so a skipped morning does not burn the slot. That same table carries the window — `since` is the last delivery, floored at `DAILY_DIGEST_MAX_WINDOW_DAYS` — so a skipped day is not lost and a returning user is not mailed three months at once.

Sending goes through `EmailPort.sendDailyDigests`, which unlike the three transactional methods **reports what happened**: `resend.batch.send` in chunks of `DAILY_DIGEST_BATCH_SIZE` with `batchValidation: "permissive"` (so one bad address does not sink ninety-nine good ones) and a per-chunk `idempotencyKey`. Copy is bilingual from `Profile.languages` (`digest-copy.ts`), and everything a user wrote goes through `escapeHtml` — the transactional emails only ever interpolated an OTP, so nothing needed it before.

Unsubscribing is a signed link, no session: an HMAC of the user id under `ACCESS_TOKEN_SECRET_KEY` with a `digest-unsubscribe:` domain separator, never expiring. `GET|POST /api/v1/emails/unsubscribe` serves an HTML page with an undo link; the POST exists because RFC 8058 one-click is what makes Gmail show its own unsubscribe button, and the alternative people reach for is the spam button.

`docs/daily-digest.md` is the operator-facing description — what goes in the email, who receives it, and every knob.

### Push notifications

A socket only exists while the app is in the foreground, so notifications reach a backgrounded phone through **Expo push** instead. Every notification in the codebase follows the same two lines — store the row, emit `new-notification` — so `PushNotifyingRealtimeService` wraps that emit rather than touching a dozen use cases: it is registered *as* `realtimeService`, delegates to the socket transport, and dispatches `SendPushNotificationUseCase` fire-and-forget behind it. A notification added later is delivered to phones without anybody wiring it up.

`DeviceToken.token` is unique across the table, not per user: a shared phone or a switched account produces the same token under a new user, so registration **moves** the row instead of leaving one person's notifications on another's screen. `POST`/`DELETE /devices` register and retire; the delete is scoped to the owner, since a push token is not a secret.

Copy lives in `push-copy.ts` (tr/en), chosen from the **device's** locale rather than the profile's feed languages. The payload carries ids and a type only — and **direct messages are never pushed**: their text is encrypted at rest, and a preview in a push payload would route it through Google's servers. Chat events share the realtime channel and the decorator ignores them by event name.

Dead tokens go two ways: Expo reports `DeviceNotRegistered` in a ticket and those rows are deleted at once, while a phone that was simply abandoned is caught by `DEVICE_PURGE_CRON` against `lastSeenAt` (the app re-registers at every launch, so age means something here). `PUSH_ENABLED=false` swaps in `NoopPushService` — devices still register, nothing is delivered.

`docs/push-notifications.md` is the client-facing contract.
### Verified badge

A monthly paid subscription, and the only way to get a tick — no official badge, no manual grant. This half is provider-agnostic; the store adapter lands separately.

**`User.verifiedUntil` is a date, denormalised onto the user row.** Denormalised because roughly a dozen queries show an author and none should join a billing table to render a tick; a *date* because that makes it expire on its own — a lost provider notification then costs the badge at the end of the period the user paid for, where a boolean would leave it on for good. `isVerified` is computed at read time by the shared `isVerified()` helper, and only `SyncSubscriptionUseCase` ever writes the column, from `Subscription.entitlementUntil()` — the single place a billing state becomes a badge. `ACTIVE` and `IN_GRACE` entitle (the user paid for the period they are in; a declined card is not a decision to stop paying), everything else does not.

**One door in.** Every adapter reaches `SyncSubscriptionUseCase` with the provider's *absolute* state rather than a change, so a redelivered notification is harmless. It refuses two things: a `providerSubscriptionId` already claimed by another account (unique column — a shared receipt must not grant the badge to whoever presents it last) and an event older than `lastEventAt` (store notifications are unordered, and a late renewal would otherwise reinstate a cancelled subscription). `BillingEvent` is an audit trail, not the replay guard.

**Ban and deletion stop the billing.** `SoftDeleteUserUseCase` revokes immediately — awaited, not fire-and-forget, because it is a promise about somebody's money. A ban has no code path to hook, so the nightly `SubscriptionReconcileScheduler` is the only thing that notices one; it also retries refused cancellations and re-applies what the provider says, repairing missed notifications. A provider that cannot say is left alone: "I do not know this subscription" is not "it ended".

`NoopBillingService` stands in until there is a store, and deliberately never reports a subscription as active — a stub that granted entitlements would be free badges on any misconfigured environment.

**Google Play** enters through two endpoints. `POST /billing/play/purchases` is authenticated and is the *only* place the link between a purchase and an account is learned — Google's notifications name a token and a product and nothing else. It trusts the client for nothing: the token is verified with Google and what comes back is stored, so a purchase that cannot be confirmed links as `PENDING` with no badge. `POST /billing/play/notifications` takes the Pub/Sub push, guarded by a shared secret on the URL (`PLAY_NOTIFICATIONS_TOKEN`, empty = closed). A notification is a **nudge, never state**: it says a purchase changed, and the state is then read from Google, because deliveries are unordered and redelivered. It answers 204 for anything it understood — a redelivery, or a purchase no account claims — since Pub/Sub retries every non-2xx and retrying those achieves nothing. `mapPlayState` is the single place Google's vocabulary becomes ours, and an unrecognised state reads as *not* entitling.

`GooglePlayBillingService` does not exist yet: `NoopBillingService` stands in until the Play Console side is configured.

`docs/verified-badge.md` is the contract and the operator's SQL.

### Realtime and background jobs

`FastifyRealtimeService` publishes to the Redis `realtime_events` channel; each instance subscribes and fans out to locally connected sockets via `WebSocketManager` — so notifications work across multiple processes. Never write to sockets directly from a use-case; go through `RealtimePort`.

Purge jobs (`src/infrastructure/jobs/**`, wired by `src/http/plugins/custom/*-purge.plugin.ts`) run under `node-cron` from env cron expressions. They pass **no timezone**, so they fire on the container's local clock — fine for a purge, and the reason the daily digest is the one scheduler that pins one. Users are soft-deleted (`deletedAt`) and recoverable until `USER_PURGE_GRACE_PERIOD_DAYS` elapses, after which the purge job hard-deletes them.

### Prisma

Split schema: `prisma/schema.prisma` only holds the generator (output `src/generated/prisma`) and datasource; models live in `prisma/models/*.prisma` — edit those, not the aggregate. The client is created with the `@prisma/adapter-pg` driver adapter in `src/infrastructure/persistence/database/database.client.ts`. Multi-step writes go through `TransactionPort` (`transaction.service.ts`), not raw `prisma.$transaction` inside a use-case.

`schema.prisma` declares **no datasource url** — it comes from `prisma.config.ts`, which is why that file is copied into the runtime image alongside `prisma/`, and why `prisma` and `dotenv` are runtime rather than dev dependencies. Production migrations run as Render's **pre-deploy command** (`preDeployCommand: pnpm db:deploy` in `render.yaml`), not from CI: Render builds from the commit, so anything gated behind CI and semantic-release lands after the deploy it was supposed to precede. The `migrate` job in `release.yml` is a backstop that also keeps the GHCR image from outrunning the schema. A failing pre-deploy cancels the deploy, so the old code keeps serving.

## Conventions

- TypeScript strict; `@typescript-eslint/no-floating-promises`, `require-await`, and `eqeqeq` are errors — prefix intentional fire-and-forget with `void`. `no-explicit-any`, `no-console`, and explicit return types are warnings but the codebase keeps them clean.
- `consistent-type-imports` with separate `import type { … }` statements.
- Prettier: 4-space indent, double quotes, trailing commas. `husky` + `lint-staged` runs eslint --fix and prettier on commit.
- Conventional Commits (`feat:`, `fix:`, `chore:`, …) — `semantic-release` cuts releases and the CHANGELOG from `main`. Branches: `feature/…`, `fix/…`, `chore/…`, `docs/…`.
- Public classes and methods carry JSDoc in this codebase; match that density when adding to a file that has it.
- Do not do full-file refactors without asking; propose targeted changes.

`docs/QA.md` records the testing strategy and current coverage targets (unit coverage is scoped to domain, use-cases, mappers, security, realtime; integration coverage to Prisma repositories).
