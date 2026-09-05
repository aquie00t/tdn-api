# Push notifications

The realtime socket only exists while the app is in the foreground — both
mobile platforms close it the moment the app is backgrounded. Push is the
second transport, and the only one that reaches a phone nobody is looking at.

Delivery goes through **Expo**, which owns the FCM credentials (and the APNs
ones when iOS arrives). Everything below is behind `PushPort`, so replacing
Expo with FCM directly is a sibling adapter, not a rewrite.

## Registering a device

`POST /api/v1/devices` — authenticated, 5/min.

```json
{
    "token": "ExponentPushToken[…]",
    "platform": "ANDROID",
    "appVersion": "42",
    "locale": "tr-TR"
}
```

Call it **at every launch**, not only the first. The platform can reissue a
token at any time, and re-registering is also what keeps the row from being
swept as abandoned.

`DELETE /api/v1/devices` with `{ "token": "…" }` retires one. **Call it before
discarding the session on sign-out** — a signed-out phone that is still
registered keeps receiving the previous user's notifications. It is scoped to
the owner: knowing a token is not enough to silence somebody else's phone.

Both answer `{ "data": { "registered": true|false }, "meta": { … } }` and
nothing more. Whether a row was written, moved or already matched is not
something a client can act on, and "this token belongs to somebody else" is not
something it should learn.

`token` is unique across the table rather than per user. A phone handed to
somebody else, or an account switched inside the app, produces the *same* token
under a new user — so a registration **moves** the row.

## What gets sent

Every notification in the API follows the same two steps: store the row, emit
`new-notification` on the realtime channel. `PushNotifyingRealtimeService`
wraps that emit and pushes behind it, which is why a notification added later
is delivered to phones without anybody remembering to wire it up.

The copy lives in `push-copy.ts`, in Turkish and English, chosen from the
**device's** locale rather than the profile's feed languages — a notification
is read on a lock screen that is already in one language.

The payload carries ids and a type, and nothing else:

```json
{ "type": "COMMENT", "postId": "…", "commentId": "…" }
```

**Direct messages are not pushed at all.** Message text is encrypted at rest;
putting even a truncated preview in a push payload would route it through
Google's servers and undo that. Chat events travel the same realtime channel
under their own event names and the decorator ignores them by name.

## Dead tokens

Two mechanisms, because one is not enough:

- Expo reports a token it knows to be dead (`DeviceNotRegistered`) in the
  ticket for that message. Those rows are deleted as they are reported.
- A phone that was reset, lost or simply abandoned reports nothing, so
  `DEVICE_PURGE_CRON` (06:00 container time) drops registrations not seen for
  `DEVICE_RETENTION_DAYS` (90). Since the app re-registers at every launch, age
  is a sound signal here.

Not yet done: Expo's *receipts*, which catch tokens that fail later at FCM
rather than at ticket time. The retention sweep covers the same ground more
slowly; receipts are on the roadmap.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PUSH_ENABLED` | `false` | Off swaps in a service that sends nothing. Devices still register. |
| `EXPO_ACCESS_TOKEN` | _(empty)_ | Required only if the Expo project has push security enabled. |
| `DEVICE_RETENTION_DAYS` | `90` | How long an unseen device is kept. |
| `DEVICE_PURGE_CRON` | `0 6 * * *` | When the sweep runs. |

## App-side notes

- Android 13+ needs a runtime notification permission. When it is asked for
  decides whether most users enable push or most refuse.
- The badge count comes from the unread notification count and is sent with
  every message.
- Tapping a notification should route from `data.type` plus whichever ids are
  present — the same destinations the email digest links to.
