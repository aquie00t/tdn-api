# Daily digest

One email a morning to anyone with something waiting.

Everything in the app that pulls someone back — a mention, a reply, a release
in a topic they follow — lives inside the app. Somebody who does not open it
never learns any of it happened. The digest is the one outward signal.

## Contents

- [What the email contains](#what-the-email-contains)
- [Who receives one](#who-receives-one)
- [The window](#the-window)
- [Language](#language)
- [Unsubscribing](#unsubscribing)
- [Not sending twice](#not-sending-twice)
- [Configuration](#configuration)
- [Turning it on](#turning-it-on)

---

## What the email contains

Two sections, in order:

1. **Notifications you missed** — unread notifications since the last digest,
   newest first, at most `DAILY_DIGEST_MAX_NOTIFICATIONS`. Each line names who
   caused it and links to what it points at.
2. **From your topics** — posts from the last day, ranked against the reader's
   interest profile, at most `DAILY_DIGEST_MAX_POSTS`.

**A digest with both sections empty is never sent.** An email that says nothing
happened is the fastest way to teach somebody to filter the sender.

The second section reuses the feed's own ranker. Interest profiles are rebuilt
nightly at 04:00 (`USER_INTEREST_REBUILD_CRON`), so the 09:00 digest reads a
profile a few hours old. A reader the platform has learnt nothing about yet
gets no special handling and no empty section: every affinity term scores zero
and the order falls back to freshness and engagement, which is a reasonable
"today's highlights".

Who the reader follows is deliberately **not** part of the ranking. That is the
feed's question; this email is about topics.

## Who receives one

Five conditions, all decided in the audience query:

| Condition | Why |
| --- | --- |
| `isEmailVerified` | Never mail an address nobody proved they own |
| `deletedAt IS NULL` | The account is gone, even if recoverable |
| `bannedAt IS NULL` | A suspended account is not one to re-engage |
| `isBot = false` | Bots author the news, they do not read it |
| `digestOptOutAt IS NULL` | They asked not to receive this |

A partial index on exactly these five backs the sweep; without it, selecting
the audience is a sequential scan of the whole user table every morning.

> **Known gap:** changing an email address does not currently reset
> `isEmailVerified`, so a digest can reach an address that was never confirmed.
> That predates this feature and is tracked separately.

## The window

`since` is **the last digest actually sent to that reader**, not a fixed 24
hours. A morning where somebody had nothing waiting is skipped without a
delivery row, so the next digest still covers the day it passed over.

Floored at `DAILY_DIGEST_MAX_WINDOW_DAYS`: somebody returning after three
months gets the last week, not three months in one page. A reader who has never
received one starts at `DAILY_DIGEST_WINDOW_HOURS`.

Notifications are filtered on **unread**, so a reader who opened the app and
caught up gets nothing about what they already saw.

## Language

Taken from `Profile.languages`, first entry, normalised to a supported code,
falling back to the platform default (`tr`). Copy for both languages lives in
`src/infrastructure/external/email/digest-copy.ts` as a plain table — including
one line per `NotificationType`.

Adding a language means adding a column to that table and to
`SUPPORTED_LANGUAGES`.

## Unsubscribing

```
GET|POST /api/v1/emails/unsubscribe?u=<userId>&t=<signature>
```

Public, no session, no expiry. The signature is an HMAC-SHA256 of the user id
under the app's signing key, with a `digest-unsubscribe:` prefix so it can
never be replayed as any other kind of token. A digest is read whenever the
inbox is, which may be weeks later, so an expiring link would be a broken one.

- **GET** is a person clicking the link. It answers with a small HTML page
  confirming the change and offering an undo, so an accidental click is one
  click to reverse.
- **POST** with no body is a mail client's own unsubscribe button. RFC 8058
  one-click requires it, and Gmail will not show that button without it. Every
  digest carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers.

The alternative people reach for when they cannot find an unsubscribe button is
the spam button, and that one costs the whole sending domain.

## Not sending twice

Several API instances run the same 09:00 schedule and nothing coordinates them.
A `digest_deliveries` row — unique on `(user_id, digest_on)` — is written
**before** the email goes out, and a uniqueness violation means another
instance already claimed that reader.

The claim is taken last, only once there is something worth sending, so an
empty morning does not consume the slot.

The trade is deliberate: a process that dies between the claim and the send
costs that reader one morning. A duplicate costs every reader their trust.

Batches also carry an `idempotencyKey`, so a retried request at the provider
cannot deliver the same batch a second time.

## Configuration

| Key | Default | What it does |
| --- | --- | --- |
| `DAILY_DIGEST_ENABLED` | `false` | Master switch. The scheduler is not started at all when false |
| `DAILY_DIGEST_CRON` | `0 9 * * *` | When the run starts |
| `DAILY_DIGEST_TIMEZONE` | `Europe/Istanbul` | The clock that cron expression is read on, and the calendar day a claim belongs to |
| `DAILY_DIGEST_WINDOW_HOURS` | `24` | How far back a first-ever digest reaches |
| `DAILY_DIGEST_MAX_WINDOW_DAYS` | `7` | Ceiling on the window for a returning reader |
| `DAILY_DIGEST_USER_PAGE_SIZE` | `200` | Recipients per page of the sweep |
| `DAILY_DIGEST_BATCH_SIZE` | `100` | Emails per provider request; 100 is the provider's own limit |
| `DAILY_DIGEST_BATCH_PAUSE_MS` | `600` | Pause between requests, to stay under the provider's rate limit |
| `DAILY_DIGEST_MAX_NOTIFICATIONS` | `8` | Longest the first section gets |
| `DAILY_DIGEST_MAX_POSTS` | `5` | Longest the second section gets |
| `DAILY_DIGEST_CANDIDATE_POOL_SIZE` | `300` | Posts fetched once per run and ranked per reader |

Links in the email are built from `FRONTEND_URL`; the unsubscribe link from
`API_URL`. The front-end paths the email points at are all in one file,
`src/core/use-cases/digest/send-daily-digest/digest-links.ts` — if the web app
moves a route, it moves there.

## Turning it on

`DAILY_DIGEST_ENABLED` defaults to **false**, including in production, on
purpose. Nobody has a delivery record on the first run, so the first morning it
is enabled every eligible account receives one.

Recommended order:

1. Deploy with it disabled and run the migration.
2. Count the audience: `SELECT count(*) FROM users WHERE "deletedAt" IS NULL
   AND "bannedAt" IS NULL AND "digestOptOutAt" IS NULL AND "isBot" = false AND
   "isEmailVerified" = true;`
3. Check that number against the sending plan's daily quota.
4. Enable it.

Watch the provider's dashboard for the first week: the run reports what the
provider *accepted*, which is not the same as delivered. Bounce and complaint
handling is not built yet.
