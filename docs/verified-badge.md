# Verified badge

A monthly paid subscription that puts a tick beside an account. There is no
other way to get one: no official badge, no manual grant, no notability
committee. Somebody pays, or there is no tick.

This document describes the part of the feature that is the same whichever
store or gateway is billing. The store adapter — purchases, notifications,
cancellations — is separate, and lands with Google Play Billing.

## What the client sees

Every read that shows a person carries `isVerified`: posts, comments, articles,
notifications, profiles, search results, follower lists, suggestions and
conversation participants. It is a boolean, computed at read time.

`GET /api/v1/billing/subscription` — authenticated, and only ever about the
caller:

```json
{
    "data": {
        "isVerified": true,
        "verifiedUntil": "2026-12-01T00:00:00.000Z",
        "status": "ACTIVE",
        "currentPeriodEnd": "2026-12-01T00:00:00.000Z",
        "cancelAtPeriodEnd": false
    },
    "meta": { "timestamp": "…" }
}
```

An account that has never subscribed gets `status: null` and the rest empty.
There is no endpoint that asks about somebody else — whether a person pays is
not other people's business, and the part that *is* public already travels on
every profile.

No receipts, amounts or payment methods appear anywhere. The store keeps those
and shows them to the user itself; copying them would mean owning a second,
permanently stale ledger.

## How the badge is decided

`users.verifiedUntil` is a **date**, denormalised onto the user row.

It is denormalised because roughly a dozen queries show an author and none of
them should join a billing table to render a tick. It is a date rather than a
boolean because that makes it **expire on its own**: if a provider notification
is lost, the badge disappears at the end of the period the user paid for. A
boolean would stay on for good, and the failure would be invisible.

Only `SyncSubscriptionUseCase` writes it, from `Subscription.entitlementUntil()`
— the one place a billing state becomes a badge:

| Status | Badge |
| --- | --- |
| `ACTIVE` | until `currentPeriodEnd` |
| `IN_GRACE` | until `currentPeriodEnd` |
| `PENDING` | none — nothing has been paid yet |
| `CANCELED` | none |
| `REVOKED` | none |

`IN_GRACE` keeps the badge on purpose: the provider is still retrying a failed
payment, and the user has paid for the period they are in. Removing it the
moment a card is declined punishes an expired card rather than a decision to
stop paying.

## How state gets in

One door: `SyncSubscriptionUseCase`. Every adapter arrives there with the
provider's **absolute state** — what is true now — rather than a change to
apply. That is what makes a redelivered notification harmless: applying it
twice lands in the same place.

Two things it refuses:

- **A purchase already claimed by another account.** `provider_subscription_id`
  is unique, and a subscription belonging to somebody else is refused rather
  than moved. The alternative is a shared receipt granting the badge to
  whoever presents it last.
- **An event older than the one already applied.** Store notifications are not
  ordered. Without `last_event_at`, a renewal delivered after the cancellation
  that superseded it would reinstate a subscription that is over.

`billing_events` records what was processed. It is an audit trail, not the
replay guard — the guard is that every write is absolute.

## Ban and deletion

The platform promises that a suspended or deleted account stops being charged.
Only the provider can keep that promise, so both paths ask it to and clear the
badge either way — a provider outage must not leave a banned account verified
for another day.

- **Deletion** is a code path: `SoftDeleteUserUseCase` revokes immediately,
  before the confirmation email. Immediately rather than at period end, because
  the account is going away regardless.
- **A ban is not.** It is applied by hand in SQL — there is no endpoint and no
  admin panel — so nothing in the code hears about it. The nightly reconcile is
  the only thing that will ever notice, and this promise rests on it running.

Recovering a soft-deleted account within the grace period does **not** bring the
subscription back; the user resubscribes. Say so in the deletion screen.

## The nightly reconcile

`SUBSCRIPTION_RECONCILE_CRON` (03:00 container time) does three things in one
pass over live subscriptions:

1. Revokes anything belonging to a banned or soft-deleted account.
2. Retries cancellations the provider refused earlier.
3. Re-reads the provider and re-applies what it says, repairing missed
   notifications.

A provider that answers "I do not know this subscription" is left alone. That
is not the same as "it ended", and guessing between them is how a paying user
loses a badge; the expiry already on the row retires it if it really is over.

## Google Play

Two endpoints, and a deliberate split between what the client is trusted for
and what it is not.

**`POST /api/v1/billing/play/purchases`** — authenticated. The app calls it
right after Play reports a successful purchase, with the `purchaseToken` the
billing library produced and the product id.

```json
{ "purchaseToken": "…", "productId": "verified_monthly" }
```

This call is the **only** place the link between a purchase and an account is
ever learned: Google's notifications name a token and a product and nothing
else. It grants nothing on the client's word — the token goes straight to
Google for verification and what comes back is what gets stored, so a
fabricated token buys a row that says `PENDING` and no badge. A purchase Google
cannot confirm right now is still linked, as `PENDING`, because without the row
nothing would ever connect that token to that account again; the nightly
reconcile finishes it.

**`POST /api/v1/billing/play/notifications`** — where Pub/Sub pushes Google's
notifications. No session, guarded by a shared secret on the URL
(`?token=…`, `PLAY_NOTIFICATIONS_TOKEN`). **Empty means the endpoint is
closed**, which is the right default for an unauthenticated route that writes
billing state.

The notification is treated as a **nudge, never as state**. It says a purchase
changed; what it changed to is then read from the Play Developer API, and that
answer is what gets stored. Notifications arrive out of order and are
redelivered, so believing their contents would mean reinstating subscriptions
that have ended.

It answers `204` for everything it understood — including a redelivery and a
purchase no account claims yet, since Pub/Sub retries anything that is not a
2xx and retrying either of those achieves nothing. A genuine failure escapes as
a 5xx, which is exactly the answer that makes Google try again.

Google's state maps onto ours in one place, `mapPlayState`. `ACTIVE` and
`IN_GRACE_PERIOD` entitle; `PAUSED`, `ON_HOLD`, `CANCELED` and `EXPIRED` do
not — none of them are being paid for — and a state we do not recognise reads
as *not* entitling, because Google adds values over time and the safe reading
of "I do not know this" is that the badge is off.

### Not done yet

`GooglePlayBillingService` — the `BillingPort` implementation that actually
calls the Play Developer API to verify a purchase and to cancel one. Until it
exists `NoopBillingService` stands in, so purchases link as `PENDING` and no
badge is granted. It needs the Play Console work: a subscription product, a
service account with "View financial data" and "Manage orders and
subscriptions", and the Pub/Sub topic.

Verifying the OIDC token Google can attach to a push is the stronger
alternative to the shared secret, and belongs with that same work.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SUBSCRIPTION_RECONCILE_CRON` | `0 3 * * *` | When the repair pass runs. |
| `SUBSCRIPTION_RECONCILE_BATCH_SIZE` | `500` | Rows examined per pass. |
| `PLAY_NOTIFICATIONS_TOKEN` | _(empty)_ | Shared secret on the push URL. Empty closes the endpoint. |

There is no provider yet. `NoopBillingService` stands in, and it deliberately
never reports a subscription as active — a stub that granted entitlements would
be a way to get a paid badge for free on any environment that forgot to
configure a store.

## Reading the state by hand

Who currently has a badge:

```sql
SELECT u.username, u."verifiedUntil", s.status, s.current_period_end
FROM users u
JOIN subscriptions s ON s.user_id = u.id
WHERE u."verifiedUntil" > now()
ORDER BY u."verifiedUntil";
```

Badges that are about to lapse, and whether the provider intends to renew:

```sql
SELECT u.username, s.status, s.cancel_at_period_end, s.current_period_end
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.current_period_end BETWEEN now() AND now() + interval '7 days'
ORDER BY s.current_period_end;
```

What a subscription has been told, most recent first:

```sql
SELECT type, processed_at
FROM billing_events
WHERE provider_subscription_id = '…'
ORDER BY processed_at DESC;
```
