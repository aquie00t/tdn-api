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

`RateLimitPolicies` in `src/http/plugins/rate-limit.plugin.ts`: `STRICT` (3/15 min, `continueExceeding`) for login/register, `SENSITIVE` (5/min) for password reset, verification, and write/social actions, `STANDARD` (60/min) for authenticated reads, `PUBLIC` (100/min). Global default is 100/min. Requests with `Authorization: Bot <token>` are allow-listed after a sha256 lookup against `user.botToken`.

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

Message media rides the same pipeline as post media through its own `MediaChannel.MESSAGE_MEDIA` (`POST /messages/media`) and `MediaOwnerKind.MESSAGE`; `SendMessageUseCase` resolves every submitted URL via `resolveAttachableMedia`, exactly as `CreatePostUseCase` does. A rejected video reaches its sender as a `message:media_rejected` realtime event instead of a `Notification` row — the notification target can only point at public content.

Chat events are namespaced in `src/core/domain/constants/chat-events.constants.ts` and travel the existing Redis `realtime_events` channel; `RealtimeEventPayload` is a union of the notification and chat payload shapes.

### Realtime and background jobs

`FastifyRealtimeService` publishes to the Redis `realtime_events` channel; each instance subscribes and fans out to locally connected sockets via `WebSocketManager` — so notifications work across multiple processes. Never write to sockets directly from a use-case; go through `RealtimePort`.

Purge jobs (`src/infrastructure/jobs/**`, wired by `src/http/plugins/custom/*-purge.plugin.ts`) run under `node-cron` on `Europe/Istanbul` schedules from env cron expressions. Users are soft-deleted (`deletedAt`) and recoverable until `USER_PURGE_GRACE_PERIOD_DAYS` elapses, after which the purge job hard-deletes them.

### Prisma

Split schema: `prisma/schema.prisma` only holds the generator (output `src/generated/prisma`) and datasource; models live in `prisma/models/*.prisma` — edit those, not the aggregate. The client is created with the `@prisma/adapter-pg` driver adapter in `src/infrastructure/persistence/database/database.client.ts`. Multi-step writes go through `TransactionPort` (`transaction.service.ts`), not raw `prisma.$transaction` inside a use-case.

## Conventions

- TypeScript strict; `@typescript-eslint/no-floating-promises`, `require-await`, and `eqeqeq` are errors — prefix intentional fire-and-forget with `void`. `no-explicit-any`, `no-console`, and explicit return types are warnings but the codebase keeps them clean.
- `consistent-type-imports` with separate `import type { … }` statements.
- Prettier: 4-space indent, double quotes, trailing commas. `husky` + `lint-staged` runs eslint --fix and prettier on commit.
- Conventional Commits (`feat:`, `fix:`, `chore:`, …) — `semantic-release` cuts releases and the CHANGELOG from `main`. Branches: `feature/…`, `fix/…`, `chore/…`, `docs/…`.
- Public classes and methods carry JSDoc in this codebase; match that density when adding to a file that has it.
- Do not do full-file refactors without asking; propose targeted changes.

`docs/QA.md` records the testing strategy and current coverage targets (unit coverage is scoped to domain, use-cases, mappers, security, realtime; integration coverage to Prisma repositories).
