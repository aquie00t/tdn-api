# Blocking

Blocking an account hides the two of you from each other. It is one row, but
its effect is symmetric: neither side sees the other's posts, profile counts,
comments, notifications or messages, and neither can follow or write to the
other.

Nothing is deleted. Lifting a block restores everything except the follows,
which are torn down on the way in and do not come back.

All endpoints live under `/api/v1` and return the standard `{ data, meta }`
envelope.

## Contents

- [Endpoints](#endpoints)
- [What a block hides](#what-a-block-hides)
- [What the client is told](#what-the-client-is-told)
- [Direct messages](#direct-messages)
- [Follows](#follows)
- [Errors](#errors)
- [Not supported](#not-supported)

---

## Endpoints

| Method | Path | Rate limit | Description |
| --- | --- | --- | --- |
| `POST` | `/blocks` | SENSITIVE (5/min) | Block an account |
| `DELETE` | `/blocks` | SENSITIVE (5/min) | Lift your block |
| `GET` | `/blocks` | STANDARD (60/min) | The accounts you have blocked |

All three require authentication.

### `POST /blocks`

```jsonc
// request
{ "targetId": "8f3c…" }

// 200
{
  "data": { "isBlocked": true },
  "meta": { "timestamp": "2026-09-07T09:00:00.000Z" }
}
```

Idempotent: blocking an account already blocked answers 200 with the same body.

Blocking also **unfollows in both directions**, in the same transaction as the
block itself.

### `DELETE /blocks`

Same body, answers `{ "isBlocked": false }`. Idempotent: lifting a block that
is not there succeeds.

Only your own block is lifted. If the other account blocked you independently,
that row stands and you stay invisible to each other.

### `GET /blocks`

```jsonc
// GET /blocks?limit=20&offset=0
{
  "data": [
    {
      "userId": "8f3c…",
      "username": "someone",
      "fullName": "Some One",
      "avatarUrl": "https://cdn…/avatar.png",
      "bio": null
    }
  ],
  "meta": { "limit": 20, "offset": 0, "count": 1, "total": 1 }
}
```

Newest block first. This is the **only** way back to a block: the account is
invisible everywhere else, so without this list there would be no route to the
unblock button.

It lists only blocks *you* wrote. There is no endpoint for "who blocked me" —
that would hand out a list of who dislikes you.

## What a block hides

Symmetric. Both directions of each row apply to both people.

| Surface | Effect |
| --- | --- |
| Feed (`GET /posts`) | Their posts are absent, and the reported total excludes them |
| Post detail (`GET /posts/:id`) | `404` |
| Post quotes (`GET /posts/:id/quotes`) | `404` for a blocked author's post; blocked authors' quotes are dropped from the list |
| User timeline (`GET /profiles/:username/posts`) | Empty page |
| Profile (`GET /profiles/:username`) | Served, with flags; `postCount` and `articleCount` are `0` |
| Likes (`POST /posts/:id/like`) | `404` |
| Comments (`POST /posts/:id/comments`, `POST /articles/:slug/comments`) | `404` |
| Follow (`POST /follows`) | `403` |
| Conversations | See [Direct messages](#direct-messages) |
| Notifications | Never delivered in either direction, including mentions |

A **guest** sees none of this — blocking is per-viewer, and a signed-out visitor
has nobody hidden from them.

Writing a blocked account's `@handle` still records the mention (the relation is
a fact about the text), it simply does not notify them.

## What the client is told

A profile is still served to a blocked viewer, deliberately. Answering `404`
would leave them unable to tell a block from a deleted account, so they assume
something is broken and keep trying.

```jsonc
// GET /profiles/someone, as the blocked user
{
  "data": {
    "username": "someone",
    "isBlocked": false,    // you blocked them
    "isBlockedBy": true,   // they blocked you
    "isFollowing": false,
    "postCount": 0,
    "articleCount": 0
    // …
  }
}
```

| `isBlocked` | `isBlockedBy` | Render |
| --- | --- | --- |
| `false` | `false` | Normal profile |
| `true` | `false` | "You blocked @handle", with an unblock button |
| `false` | `true` | "@handle blocked you" — no follow, no message |
| `true` | `true` | Treat as `isBlocked`: the unblock button is the useful one |

Both are `false` for a guest and when viewing your own profile.

## Direct messages

The one place the block is **not** announced. Those endpoints already fold every
rejection into one shape so they cannot be used to confirm that two particular
people are talking, and a block that named itself there would undo that — and
would also tell the blocked user which of their threads went quiet.

| Action | Answer |
| --- | --- |
| `POST /conversations` | `400`, the same error a bot or deleted account gets |
| `GET /conversations` | The thread is absent from both inboxes |
| `GET /conversations/:id/messages` | `404` |
| `POST /conversations/:id/messages` | `404` |
| `PATCH /conversations/:id/read` | `404` |
| `PATCH /conversations/:id/accept`, `/decline` | `404` |
| `GET /conversations/unread-count` | The thread is not counted |

The conversation row, its status, its read counters and every message survive.
Lifting the block brings the thread back exactly as it was, history included.

## Follows

Blocking removes the follow in **both** directions, atomically with the block.

Unblocking does not restore them. Following again is an ordinary
`POST /follows`.

While a block stands, `POST /follows` answers **403** in either direction — this
is the one gate that names the block, because a follow that quietly does nothing
reads as a bug and leaves the user tapping the button again.

## Errors

RFC 7807, as everywhere else.

| Status | Title | When |
| --- | --- | --- |
| `400` | `Bad Request` | Blocking or unblocking yourself |
| `400` | `Bad Request` | Opening a conversation with a blocked account |
| `403` | `Forbidden` | Following, or being followed by, a blocked account |
| `404` | `Not Found` | Blocking an account that does not exist or is being deleted |
| `404` | `Not Found` | Reading or interacting with blocked content |
| `401` | `Unauthorized` | No token |

## Not supported

- Blocking a bot account is allowed but pointless — bots do not read.
- There is no "who blocked me" list.
- There is no mute. Blocking is the only tool, and it is symmetric.
- A block does not close the other side's WebSocket. Nothing they can do through
  it survives the checks above, and the socket drops on its own.
