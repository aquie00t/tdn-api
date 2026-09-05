# Direct messaging

One-to-one private conversations with text and media, delivered live over the
existing WebSocket channel.

All endpoints live under `/api/v1`, require `Authorization: Bearer <accessToken>`,
and return the standard `{ data, meta }` envelope. There is no unauthenticated
read path.

## Contents

- [Conversation lifecycle](#conversation-lifecycle)
- [Blocked participants](#blocked-participants)
- [Encryption](#encryption)
- [Endpoints](#endpoints)
- [Objects](#objects)
- [Pagination](#pagination)
- [Media](#media)
- [Realtime events](#realtime-events)
- [Errors](#errors)
- [Rate limits](#rate-limits)
- [Not supported](#not-supported)

---

## Conversation lifecycle

A conversation holds exactly two participants and is identified by the pair, not
by who opened it. Opening a conversation is idempotent: the same two users
always resolve to the same thread.

A conversation starts in one of two states:

| Opened by | Initial status |
| --- | --- |
| Someone the recipient follows | `ACCEPTED` |
| Anyone else | `PENDING` |

A `PENDING` conversation is a **message request**. It is listed in a separate
tab, it does not raise the unread badge, and only the initiator may write to it
until the recipient accepts. This is what keeps an open inbox from being usable
as a broadcast channel.

```
                    POST /conversations
                            │
              ┌─────────────┴─────────────┐
   recipient follows                  otherwise
      initiator                           │
          │                               ▼
          │                          ┌─────────┐
          │                          │ PENDING │  initiator may write
          │                          └────┬────┘  recipient sees a request
          │                               │
          │                 ┌─────────────┴─────────────┐
          │            PATCH /accept              PATCH /decline
          │                 │                           │
          ▼                 ▼                           ▼
     ┌──────────┐     ┌──────────┐               ┌──────────┐
     │ ACCEPTED │◄────┤ ACCEPTED │               │ DECLINED │
     └──────────┘     └──────────┘               └──────────┘
     both may write                              nobody may write
```

`DECLINED` is terminal. Reopening is not possible: a later `POST /conversations`
for the same pair returns the declined conversation unchanged, with
`canSend: false`.

Every conversation object carries `isRequest` and `canSend`, already resolved
for the authenticated reader. Clients should render from those fields rather
than re-deriving the rules above.

---

## Blocked participants

A block between the two participants takes the conversation **out of both
inboxes**, in whichever direction the block was written. See
[blocking.md](./blocking.md) for the feature itself.

| Action | Answer while blocked |
| --- | --- |
| `POST /conversations` | `400 InvalidRecipientError` |
| `GET /conversations` | The thread is absent, from both sides |
| `GET /conversations/:id/messages` | `404 ConversationNotFoundError` |
| `POST /conversations/:id/messages` | `404 ConversationNotFoundError` |
| `PATCH /conversations/:id/read` | `404 ConversationNotFoundError` |
| `PATCH /conversations/:id/accept`, `/decline` | `404 ConversationNotFoundError` |
| `GET /conversations/unread-count` | The thread is not counted |

`404`, not `403`, and `InvalidRecipientError` rather than a block-specific
error. These endpoints already answer every rejection with one shape so thread
membership cannot be probed; an error naming the block would undo that, and
would also tell the blocked user exactly which of their threads went quiet.

Nothing is deleted. The row, its status, its read counters and every message
survive, and lifting the block restores the thread with its full history.

Blocking does **not** move the conversation to `DECLINED`. Declining is a
decision about one request; blocking is about the account, and it is reversible.

---

## Encryption

Message text is encrypted at rest. `messages.content` and the denormalised
`conversations.last_message_preview` hold AES-256-GCM ciphertext; the API
encrypts on the way in and decrypts on the way out, so **none of this is
visible in the API contract** — clients send and receive plain text exactly as
before.

What that protects: a database dump, a backup file, somebody browsing rows
through a console, a leaked connection string.

What it does not protect: anyone who reaches the running service, because the
key is there with it. The server can read every message, and does so on every
read.

**This is not end-to-end encryption**, which is still out of scope — see
[Not supported](#not-supported). The rows carry an `enc_version` so both can
exist side by side later: `0` plaintext, written before this shipped, `1`
server-key, `2` reserved for client-encrypted text the server passes through
untouched.

---

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/conversations?status=&limit=&cursor=` | `200` |
| `POST` | `/conversations` | `201` created · `200` already existed |
| `GET` | `/conversations/unread-count` | `200` |
| `GET` | `/conversations/:id/messages?limit=&cursor=` | `200` |
| `POST` | `/conversations/:id/messages` | `201` |
| `PATCH` | `/conversations/:id/read` | `204` |
| `PATCH` | `/conversations/:id/accept` | `200` |
| `PATCH` | `/conversations/:id/decline` | `200` |
| `POST` | `/messages/media` | `200` |
| `DELETE` | `/messages/:id` | `204` |

### `POST /conversations`

```json
{ "recipientId": "8f14e45f-ceea-467a-9b0e-1a2b3c4d5e6f" }
```

Returns `201` when this request opened the conversation and `200` when one
already existed. The distinction matters for clients that surface a
"conversation started" affordance: a `200` response may describe a thread that
has existed for weeks, possibly a declined one.

Conversations cannot be opened with the authenticated user themselves, with a
bot account, or with an account pending deletion. All three return the same
`400 InvalidRecipientError`.

### `GET /conversations`

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `status` | `ACCEPTED` \| `PENDING` | `ACCEPTED` | Backs the conversation list and the request tab respectively. `DECLINED` is never listed. |
| `limit` | integer, 1–50 | `20` | |
| `cursor` | string | — | See [Pagination](#pagination). |

### `GET /conversations/unread-count`

```json
{ "data": { "count": 3 }, "meta": { "timestamp": "..." } }
```

Counts unread messages across `ACCEPTED` conversations only. Unanswered requests
are excluded by design, so this value cannot be used for a request-tab badge —
derive that from the length of the `?status=PENDING` listing.

### `GET /conversations/:id/messages`

| Parameter | Type | Default |
| --- | --- | --- |
| `limit` | integer, 1–100 | `30` |
| `cursor` | string | — |

```json
{
  "data": {
    "conversation": { "...": "conversation object" },
    "messages": [ "...newest first" ]
  },
  "meta": { "timestamp": "...", "nextCursor": "..." }
}
```

The first page carries the conversation itself, so opening a thread is a single
request. Messages are ordered newest first; paging walks backwards through
history.

Requesting a conversation the authenticated user does not participate in returns
`404`, not `403`.

### `POST /conversations/:id/messages`

```json
{ "content": "hello", "mediaUrls": ["https://cdn.example/messages/…/a.jpg"] }
```

Both fields are optional, but a message carrying neither text nor media is
rejected with `400 EmptyMessageError`. `content` is limited to 4000 characters
and `mediaUrls` to 4 entries.

In a `PENDING` conversation only the initiator may post; the recipient receives
`403 MessageNotSendableError` until they accept. Nobody may post to a `DECLINED`
conversation.

### `PATCH /conversations/:id/read`

Clears the caller's unread count and moves their read watermark. The other
participant receives a `message:read` event.

Reading a `PENDING` conversation emits no event: opening a request does not
signal receipt to the sender.

### `DELETE /messages/:id`

Withdraws a message. Only its sender may do so. The row is retained as a
tombstone — see `isDeleted` below.

---

## Objects

### Conversation

```jsonc
{
  "id": "uuid",
  "status": "ACCEPTED",              // PENDING | ACCEPTED | DECLINED
  "isRequest": false,                // the reader owns the accept/decline decision
  "canSend": true,                   // the reader may post here
  "participant": {                   // always the other party, resolved per reader
    "id": "uuid",
    "username": "ayse",
    "fullName": "Ayşe Y.",           // optional
    "avatarUrl": "https://…"         // always an absolute URL
  },
  "unreadCount": 3,                  // unread by the reader
  "lastMessagePreview": "…",         // null while the thread is empty
  "lastMessageAt": "2026-09-03T12:00:00.000Z",   // null while the thread is empty
  "otherLastReadAt": "2026-09-03T11:59:00.000Z", // null if never opened
  "createdAt": "2026-09-01T09:00:00.000Z"
}
```

`otherLastReadAt` is when the other participant last opened the thread. A sent
message is "seen" when its `createdAt` precedes that timestamp.

### Message

```jsonc
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderId": "uuid",
  "content": "hello",
  "mediaUrls": ["https://…"],   // absolute URLs; empty unless cleared
  "isSensitive": false,
  "mediaPending": false,
  "mediaRejected": false,
  "isDeleted": false,
  "isMine": true,
  "createdAt": "2026-09-03T12:00:00.000Z"
}
```

Four states affect rendering independently:

| Field | Meaning | Expected rendering |
| --- | --- | --- |
| `mediaPending` | An attached video is stored but not yet cleared. `mediaUrls` is empty; the text is served normally. | Placeholder in place of the media |
| `mediaRejected` | Moderation refused the attachments; the files are gone. The message remains. | "Media removed" notice |
| `isDeleted` | The sender withdrew the message. `content` is empty. | Tombstone — the row is not removed from the thread |
| `isSensitive` | Borderline content. | Blur behind a tap |

A withdrawn message keeps its position because the other participant may have
replied to it; removing the row would leave that reply without context.

`mediaPending` typically resolves within a minute and clears on the next read of
the thread.

---

## Pagination

Listings are cursor-paginated. `meta.nextCursor` is an **opaque** string: it
should be echoed back verbatim and never parsed, constructed, or interpreted.

```
GET /api/v1/conversations?status=ACCEPTED&limit=20&cursor=<meta.nextCursor>
```

`nextCursor` is `null` at the end of a listing. There are no page numbers and no
total count — both would be stale by the next request, since a conversation list
reorders whenever a message arrives.

A cursor that cannot be decoded is not an error; the first page is returned.

---

## Media

Message attachments use a dedicated upload endpoint. The upload channel is fixed
when the bytes arrive, so a file uploaded for a conversation cannot be attached
to a post, and a file uploaded through `POST /media` cannot be attached to a
message — the latter returns `400 MediaNotOwnedError`.

**Step 1 — upload**

```
POST /api/v1/messages/media
Content-Type: multipart/form-data

→ { "data": { "mediaUrls": ["https://cdn.example/messages/…/a.jpg"] },
    "meta": { "timestamp": "…" } }
```

At most 4 files per request, 5 MB each. Images and video are accepted.

**Step 2 — attach**

Pass the returned URLs verbatim in the message body's `mediaUrls`. URLs the
caller did not obtain from this endpoint are rejected.

### Upload errors

The endpoint runs the same moderation pipeline as other uploads. Images are
scanned within the request, so a refused image never receives a URL. Video is
stored unscanned and resolved by a background worker, which is why a message
carrying video is created with `mediaPending: true`.

| Status | `title` | Retryable |
| --- | --- | --- |
| `422` | `MediaRejectedError` | No |
| `503` | `ModerationUnavailableError` | Yes |
| `415` | `InvalidMediaTypeError` | No |
| `413` | `PayloadTooLargeError` | No |
| `400` | `MediaLimitExceededError` | No |
| `400` | `NoMediaProvidedError` | No |

Media type is determined from the file's magic bytes; the `Content-Type` header
and filename are ignored. Accepted formats: JPEG, PNG, GIF, WEBP, AVIF, MP4,
M4V, MOV, WEBM, 3GP and 3G2.

Verdicts are tiered. Explicit sexual content, gore, self-harm and hate imagery
are rejected. Suggestive content, weapons and depicted violence are published
with `isSensitive: true` rather than removed.

---

## Realtime events

Direct messages are delivered over the existing notification socket. Clients
should not open a second connection.

```
GET /api/v1/realtime/ws        (WebSocket upgrade)
```

The client must send an auth frame within 10 seconds or the connection closes
with code `1008`:

```json
{ "event": "auth", "token": "<accessToken>" }
```

The server replies `{ "event": "auth_success" }`. Every subsequent frame uses the
envelope `{ "event": "<name>", "payload": { … } }`.

| Event | Payload | Delivered to |
| --- | --- | --- |
| `message:new` | `conversationId`, `messageId`, `senderId`, `preview`, `hasMedia`, `createdAt` | Recipient, accepted conversations |
| `conversation:request` | same as above | Recipient, pending conversations |
| `message:read` | `conversationId`, `senderId`, `readAt` | The other participant |
| `message:deleted` | `conversationId`, `messageId`, `senderId` | The other participant |
| `message:media_rejected` | `conversationId`, `messageId`, `senderId` | The sender only |

`conversation:request` is distinct from `message:new`: a message opening a
request must not raise the unread badge.

`message:media_rejected` is not delivered to the recipient. The read path
withholds unscanned media, so from their side the file never existed.

---

## Errors

Errors follow RFC 7807. The `title` field is the stable discriminator; `detail`
is English prose and subject to change.

```json
{
  "type": "about:blank",
  "title": "MessageNotSendableError",
  "status": 403,
  "detail": "You cannot send messages in this conversation.",
  "instance": "/api/v1/conversations/…/messages"
}
```

| Status | `title` | Cause |
| --- | --- | --- |
| `404` | `ConversationNotFoundError` | No such conversation, **or** the caller is not a participant |
| `403` | `MessageNotSendableError` | Declined conversation, or a request the caller has not accepted |
| `400` | `EmptyMessageError` | Neither text nor media |
| `400` | `InvalidRecipientError` | Recipient is the caller, a bot, pending deletion, or blocked in either direction |
| `400` | `MediaNotOwnedError` | Media not uploaded by the caller, from the wrong channel, or already claimed |
| `429` | `TooManyRequestsError` | Rate limit exceeded |

A conversation the caller does not participate in returns `404` rather than
`403`, so that thread membership cannot be probed. A conversation hidden by a
block answers the same way, for the same reason.

---

## Rate limits

| Operations | Limit |
| --- | --- |
| Writes — send, open, accept/decline, upload, delete | 5 / minute |
| Reads — listings, thread, unread count, mark read | 60 / minute |

---

## Not supported

Deliberately out of scope in this version:

- Group conversations
- End-to-end encryption — message text is encrypted at rest, but the server
  holds the key and can read it. See [Encryption](#encryption).
- Message editing
- Typing indicators
- End-to-end encryption
- Per-message read state; read state is tracked per conversation
