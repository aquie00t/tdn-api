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

`docs/direct-messaging.md` is the client-facing contract for this feature — endpoints, response objects, realtime events and error titles. Keep it in step with the schemas when the surface changes.

### Blocking

`Block` (`prisma/models/block.prisma`) is stored **directionally** — unlike `Conversation`, which orders its pair so `(a,b)` and `(b,a)` collapse into one row. Direction is the question here: a profile has to say whether *you* blocked *them* (`isBlocked`, offers an unblock button) or the reverse (`isBlockedBy`, a wall), and those render differently.

The effect is symmetric anyway, and that is the whole design: **`IBlockRepository.getInvisibleUserIds(viewerId)` unions both directions**, and every listing read takes that one set — feed candidates and their count, `findByIds` hydration, the inbox, the unread badge, a user's timeline. Pairwise gates use `existsBetween` instead. `assertNotBlocked` and `assertConversationVisible` (`src/core/use-cases/shared/blocking/`) hold the two repeated shapes.

Two things are easy to get wrong here:

- **`authorId` collides.** `followingIds`, a pinned `authorId` and the blocked-author exclusion all write the same Prisma key, and the last spread wins. `PrismaPostRepository.authorFilter` merges them into one condition; a `followedOnly` feed is exactly the case a naive spread would silently drop the exclusion in.
- **The feed's ranked snapshot outlives a block** by up to `SCROLL_SNAPSHOT_TTL_SECONDS`. Rather than invalidate it, `excludeAuthorIds` is applied *again* at `findByIds` hydration, so a stale snapshot heals itself and the short page is filled by the top-up path that already exists.

Blocking is announced where the client needs a screen (`UserBlockedError`, **403**, on follow — a silent no-op reads as a bug) and hidden where announcing it would leak (DM answers `InvalidRecipientError`/`ConversationNotFoundError`, the same shapes those endpoints already use so thread membership cannot be probed). `BlockUserUseCase` writes the block and both unfollows in one transaction — which is why `TransactionContext` carries `followUserRepository` and `blockRepository`. Nothing else is touched: a hidden conversation keeps its status, counters and history, and unblocking restores it whole.

`docs/blocking.md` is the client-facing contract.

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
