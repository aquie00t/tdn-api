# Retrying a write safely

A client that loses the *response* to a request cannot know whether the request
itself landed. On a mobile network that happens routinely, and retrying is the
only thing the client can do. Without help, that retry is a second post, a
second comment, a second uploaded file.

Send an `Idempotency-Key` header and the retry is answered from the first
attempt instead of running again.

## Using it

```http
POST /api/v1/posts
Authorization: Bearer …
Idempotency-Key: 4f1c0f2a-6d2f-4f0b-9d4e-2a1b3c4d5e6f
Content-Type: application/json

{ "content": "…" }
```

Generate a fresh key per user action — a UUID is ideal — and **reuse the same
key for every retry of that action**. A new key means a new action.

The replayed response is byte-for-byte the first one, with the same status
code, plus:

```http
Idempotent-Replay: true
```

Keys live for **24 hours**. A key sent to a route that does not support it is
ignored, and a request with no key behaves exactly as it always has — which is
why the web client needs no changes.

### Which endpoints

Only the writes where a duplicate is real damage:

| Endpoint | |
| --- | --- |
| `POST /posts` | |
| `POST /posts/:postId/comments` | |
| `POST /articles` | |
| `POST /articles/:articleId/comments` | |
| `POST /conversations/:id/messages` | |
| `POST /media` | uploads cost storage and moderation |
| `POST /messages/media` | |

Everything else is already safe to repeat: a like, a follow and a bookmark are
idempotent by nature, a report is protected by a unique constraint, and a
device registration is an upsert.

### Errors

**409 with `A request with this Idempotency-Key is still in progress.`** — the
first attempt has not finished. A `Retry-After` header comes with it. This is
the answer to sending the retry too eagerly, not an error to give up on.

**409 with `This Idempotency-Key was already used with a different request.`** —
the key has been seen with a different body. Almost always a client bug: a key
being reused across actions. Answering it with the earlier result would hide
the bug behind a wrong response.

A request that fails does **not** spend its key. A 4xx is deterministic — the
retry will be told the same thing by the handler — and a 5xx must stay
retryable, or a transient failure would block the action for a day.

## How it works

The record lives in Redis under `idem:v1:<userId>:<method>:<route>:<key>`. The
account is part of the key: a key is a value the client invents, two people can
easily pick the same one, and a shared bucket would hand one of them the
other's response.

The claim is a single `SET NX EX`, so the store decides the race rather than
the API reading and then writing. Winning the claim runs the handler; losing it
means reading the record and either replaying it or reporting a conflict.

The record also holds a fingerprint of the request body, which is what makes
the mismatch case detectable.

### Two things it does not promise

**Uploads are guarded by the key alone.** A multipart body is a stream that has
not been read when the claim is made, so there is nothing to fingerprint. Two
genuinely different uploads sent under one key would be treated as a repeat.
Use a fresh key per upload, as you would anyway.

**It fails open.** If Redis is unreachable the request proceeds without
protection and the failure is logged. This is a safety net over a write that
already works, and making it a hard dependency would turn a cache blip into
"nobody can post anything". If a future endpoint moves money, that endpoint
should reconsider — the trade is not universal.
