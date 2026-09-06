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

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SUBSCRIPTION_RECONCILE_CRON` | `0 3 * * *` | When the repair pass runs. |
| `SUBSCRIPTION_RECONCILE_BATCH_SIZE` | `500` | Rows examined per pass. |

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
