# Content reporting

Users report a post or a comment; the report is stored; an operator reads it
and acts by hand. There is no admin panel and no endpoint that changes a
report's status, exactly as with an account ban — this document carries the
statements instead.

Nothing is hidden automatically, at any threshold. A report informs a person;
it does not act on its own. Any rule that took content down on a count is a
rule a group of accounts can point at anything they disagree with.

## The endpoint

`POST /api/v1/reports` — authenticated, rate limited to 5/min (`SENSITIVE`).

```json
{
    "targetKind": "POST",
    "targetId": "0f6a…",
    "reason": "SPAM",
    "details": "links to a phishing page"
}
```

| Field        | Required | Notes                                                        |
| ------------ | -------- | ------------------------------------------------------------ |
| `targetKind` | yes      | `POST` or `COMMENT`                                            |
| `targetId`   | yes      | UUID of the post or comment                                    |
| `reason`     | yes      | One of the nine below                                          |
| `details`    | no       | Free text, 1–500 characters                                    |

Reasons: `SPAM`, `HARASSMENT`, `HATE`, `SEXUAL`, `VIOLENCE`, `SELF_HARM`,
`MISINFORMATION`, `ILLEGAL`, `OTHER`.

The answer is always the same:

```json
{ "data": { "received": true }, "meta": { "timestamp": "…" } }
```

It says nothing about how many others reported the same thing, whether a
threshold was crossed, or what happened next — the endpoint must not be usable
as a way of measuring moderation from outside. Reporting the same content twice
answers identically; the second call is a no-op.

Errors: `404` when the content does not exist, `400` when somebody reports
their own content, `401` unauthenticated, `429` over the rate limit.

There is deliberately **no read endpoint**. Serving the queue would turn the
moderation backlog into a public list of what an account has been accused of.

### What is not reportable

Accounts and direct messages. An account is dealt with by blocking it. A
message is not public content, and reporting one would mean handing its
plaintext to an operator — the encryption at rest exists to prevent exactly
that.

## What a report stores

The row carries a **copy** of what was reported: the author's id, the text, and
the storage keys of any attachments, all resolved at report time.

That is the central decision of the feature. The quickest response available to
a reported account is to delete the post, and a queue that empties itself when
that happens is not a moderation record. So `target_id` is a plain column
rather than a foreign key, and the snapshot is what an operator reads. Deleting
the content leaves the report standing.

A comment also stores `target_parent_id` — the post it was written under — so
the email can link somewhere useful. It is null for a comment on an article: an
article is addressed by slug, and a post id column cannot describe one.

`@@unique(reporter_id, target_kind, target_id)` allows one row per person per
target. That makes a repeat report idempotent, and it is also what makes the
escalation threshold mean anything: the alert counts rows, so it counts people
by construction.

## What reaches the operator

Two emails, both to `MODERATION_ALERT_EMAIL`. Leave that empty — the default —
and neither is sent; reports are still filed and still queue up, they just wait
for somebody to read the table.

**The escalation alert** fires the moment one piece of content has been
reported by `REPORT_ALERT_THRESHOLD` separate people (default 3). Once per
piece of content, not once per report after the third. It is the only report
mail that interrupts: an address that pings on every single report is one
people stop reading, which costs more than a slow response to the reports that
matter.

**The morning summary** (`REPORT_DIGEST_CRON`, default 08:00
`Europe/Istanbul`) lists everything still open, most-reported first. It is the
current queue rather than the last day's arrivals — a window anchored to the
previous send loses whatever it covered if that email never arrives, and a
backlog is the last place to build in a silent gap. An item leaves the email by
being dealt with, not by ageing out. An empty queue sends no email.

Several instances run the same schedule, so `report_digest_deliveries` holds
one row per day and the insert is the claim, the same guard the daily digest
uses per user. The claim is taken last, once there is something to send.

Everything a user wrote — the reported text and the reporter's own words — is
escaped before it is rendered. This is the one email where two different
people's untrusted text lands in the same document, and it goes to the person
holding the database credentials.

## Acting on a report

All by hand. The column names are snake_case in this table.

Read the open queue, worst first:

```sql
SELECT r.target_kind,
       r.target_id,
       count(*)                       AS reporters,
       array_agg(DISTINCT r.reason)   AS reasons,
       min(r.created_at)              AS first_reported,
       u.username                     AS author,
       min(r.content_snapshot)        AS snapshot
FROM reports r
JOIN users u ON u.id = r.target_author_id
WHERE r.status = 'PENDING'
GROUP BY r.target_kind, r.target_id, u.username
ORDER BY reporters DESC, first_reported ASC;
```

Read one target in full, including what each reporter wrote:

```sql
SELECT r.created_at, r.reason, r.details, u.username AS reporter
FROM reports r
JOIN users u ON u.id = r.reporter_id
WHERE r.target_kind = 'POST' AND r.target_id = '…'
ORDER BY r.created_at;
```

Repeat offenders — accounts collecting reports across many pieces of content:

```sql
SELECT u.username,
       count(DISTINCT (r.target_kind, r.target_id)) AS items,
       count(*)                                     AS reports
FROM reports r
JOIN users u ON u.id = r.target_author_id
WHERE r.created_at > now() - interval '30 days'
GROUP BY u.username
HAVING count(*) >= 5
ORDER BY reports DESC;
```

Close a target, once it has been dealt with — `ACTIONED` when something was
done about the content, `DISMISSED` when the reports did not hold up,
`REVIEWED` when it was looked at and left as it is:

```sql
UPDATE reports
SET status = 'ACTIONED', reviewed_at = now()
WHERE target_kind = 'POST' AND target_id = '…' AND status = 'PENDING';
```

Only `PENDING` rows appear in the morning summary, so closing them is what
takes an item out of the email.

Removing the content itself, and suspending an account, are the existing manual
operations — see the ban statement in `CLAUDE.md`. Neither is done by this
feature.

## Retention

`REPORT_PURGE_CRON` (default 05:00 container time) drops reports older than
`REPORT_RETENTION_DAYS` (default 180), whatever their status. A report holds a
copy of what somebody wrote, which is why it is useful to an operator and also
why it is not kept forever. A report still `PENDING` when it expires has been
in every morning summary since it was filed; keeping it longer would not make
anybody read it.

## Settings

| Variable                    | Default            | What it does                                                      |
| --------------------------- | ------------------ | ----------------------------------------------------------------- |
| `MODERATION_ALERT_EMAIL`    | _(empty)_          | Where moderation mail goes. Empty turns both emails off.           |
| `REPORT_ALERT_THRESHOLD`    | `3`                | Separate people needed before the operator is interrupted. Min 2.  |
| `REPORT_DIGEST_ENABLED`     | `false`            | Whether the morning summary runs.                                  |
| `REPORT_DIGEST_CRON`        | `0 8 * * *`        | When it runs.                                                      |
| `REPORT_DIGEST_TIMEZONE`    | `Europe/Istanbul`  | Timezone that schedule and its calendar day are read in.           |
| `REPORT_DIGEST_MAX_REPORTS` | `50`               | Most reports one summary covers; the total is reported beside it.  |
| `REPORT_RETENTION_DAYS`     | `180`              | How long a report is kept.                                         |
| `REPORT_PURGE_CRON`         | `0 5 * * *`        | When the retention sweep runs.                                     |
