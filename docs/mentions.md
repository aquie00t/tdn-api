# Mentions

Naming an account with `@handle` in a body links to it, records the link, and
tells the person they were named.

All endpoints live under `/api/v1` and return the standard `{ data, meta }`
envelope. Nothing here is a new endpoint: mentions ride along with the writes
that already exist.

## Contents

- [Where mentions work](#where-mentions-work)
- [How a handle is read](#how-a-handle-is-read)
- [The mentions object](#the-mentions-object)
- [Notifications](#notifications)
- [Realtime events](#realtime-events)
- [Errors](#errors)
- [Autocomplete](#autocomplete)
- [Not supported](#not-supported)

---

## Where mentions work

| Content | Written by | Resolved from | Notifies on |
| --- | --- | --- | --- |
| Post | `POST /posts` | `content` | create |
| Comment | `POST /posts/:postId/comments`, `POST /articles/:slug/comments` | `content` | create |
| Article | `POST /articles`, `PATCH /articles/:id` | `body` | publish, and later edits |

Mentions are resolved **once, at write time**, and stored as a relation to the
account rather than as the text that was typed. Renaming an account therefore
keeps every historical mention pointing at it, and the response always carries
the account's current handle.

Posts and comments cannot be edited, so their mentions never change after
creation. An article can be edited, and its mentions are re-resolved from the
body whenever `body` is part of the request.

Direct messages do not resolve mentions.

## How a handle is read

A handle is `@` followed by the username character set — letters, digits, `.`
and `_` — and must be 3 to 30 characters long, exactly as at registration.

- Matching **ignores letter case**: `@Ada` resolves the account `ada`.
- A trailing `.` or `_` is treated as punctuation: `@ada.` resolves `ada`, while
  `@ada.b` resolves `ada.b`.
- An `@` glued to a preceding word, path or another `@` is **not** a mention, so
  `ada@example.com`, `docs/@v2` and `@@here` resolve nothing.
- The same handle written several times counts **once**.
- A handle matching no account — a typo, or a deleted one — is **silently
  dropped**. The write still succeeds.

At most **10** distinct handles may appear in one body. See
[Errors](#errors).

## The mentions object

Post, comment and article responses all carry a `mentions` array, alongside
`tags`:

```json
{
  "data": {
    "id": "0f2c…",
    "content": "good point @ada",
    "tags": [{ "name": "typescript" }],
    "mentions": [{ "id": "9b41…", "username": "ada" }]
  },
  "meta": { "timestamp": "2026-09-04T10:00:00.000Z" }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | The mentioned account. Use it to link to the profile. |
| `username` | string | The account's **current** handle, without `@`. May differ from the text in the body if the account was renamed. |

The array is always present; it is `[]` when the body names nobody. It is not
ordered by position in the text.

Rendering the `@handle` inside the body remains the client's job — the API
returns the body unchanged and tells you which handles in it are real.

## Notifications

Being named raises a notification of type `MENTION` on
`GET /notifications`, with the deep-link fields filled the same way a `COMMENT`
notification fills them:

| Mentioned in | `postId` | `commentId` | `articleId` | `referenceId` |
| --- | --- | --- | --- | --- |
| A post | the post | — | — | the post |
| A comment on a post | the post | the comment | — | the comment |
| A comment on an article | — | the comment | the article | the comment |
| An article | — | — | the article | the article |

Three rules govern who actually gets one:

1. **Never yourself.** Naming your own handle raises nothing.
2. **Once per person, per body.** Being named three times in one post is one
   notification.
3. **One notification per person, per post.** A single write never produces two
   rows for the same person. Where more than one would apply, the more specific
   one wins:

   `QUOTE` > `MENTION` > `NEW_POST`

   | Who they are | What they get |
   | --- | --- |
   | Author of the post being quoted | `QUOTE`, never also `MENTION` or `NEW_POST` |
   | Author of the post or comment being answered | `COMMENT` / `COMMENT_REPLY`, never also `MENTION` |
   | A follower the post names | `MENTION`, never also `NEW_POST` |
   | A follower the post does not name | `NEW_POST` |

   The last row pair only arises on the bot-authored post types, which are the
   only ones that notify followers at all.

Article mentions are quiet until the article is readable: creating a draft that
names someone raises nothing. Publishing notifies everyone the article names,
and a later edit notifies only the people it **newly** names.

Notifications are written after the content is committed, so a read issued
immediately after a successful write may not see one yet.

## Realtime events

A mention pushes the existing `new-notification` event over the WebSocket
channel, with `type: "MENTION"`:

```json
{
  "event": "new-notification",
  "payload": {
    "type": "MENTION",
    "issuerId": "1c9a…",
    "postId": "0f2c…",
    "commentId": "77bd…",
    "referenceId": "77bd…"
  }
}
```

`articleId` and `articleSlug` are present instead when the mention is in an
article or in a comment on one.

## Errors

| Status | Title | When |
| --- | --- | --- |
| 400 | `MentionLimitExceededError` | The body names more than 10 distinct handles. |

The write is rejected outright — no post, comment or article is created. The
limit counts the handles **written**, not the ones that resolve to real
accounts, so the answer does not change based on who happens to exist.

## Autocomplete

There is no dedicated mention-search endpoint. Use the existing profile search:

```
GET /profiles/search?q=ad
```

It matches usernames and full names case-insensitively and works with or
without a token.

## Not supported

- Mentions in direct messages.
- Mentioning a group, role, or everyone (`@here`, `@channel`).
- Notifying someone by editing a post or comment — neither can be edited.
- Opting out of being mentioned.
