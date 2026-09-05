import { Type, type Static } from "@sinclair/typebox";

export const EnvSchema = Type.Object({
    PORT: Type.Number({ default: 3000 }),
    NODE_ENV: Type.Union([
        Type.Literal("development"),
        Type.Literal("test"),
        Type.Literal("production"),
    ]),
    DATABASE_URL: Type.String(),
    ACCESS_TOKEN_SECRET_KEY: Type.String(),
    // Message text at rest. No default on purpose: a service that booted
    // without it would either refuse every message or, worse, write plaintext
    // that later reads back as a decryption failure. Generate with
    // `openssl rand -base64 32`; rotating it orphans every row written under
    // the old one, so it is not something to regenerate casually.
    MESSAGE_ENCRYPTION_KEY: Type.String(),
    COOKIE_SECRET: Type.String(),

    // --- Authentication & Tokens ---
    ACCESS_TOKEN_EXPIRES_IN: Type.Number({ default: 900 }),
    REFRESH_TOKEN_EXPIRES_IN: Type.Number({ default: 90000 }),
    OTP_EXPIRY_SECONDS: Type.Number({ default: 600 }),

    REFRESH_TOKEN_PURGE_CRON: Type.String({ default: "0 */6 * * *" }),
    REFRESH_TOKEN_PURGE_GRACE_PERIOD_DAYS: Type.Number({ default: 24 }),

    EMAIL_FROM: Type.String({ default: "email" }),

    // --- Others ---
    CORS_ORIGIN: Type.String({ default: "http://localhost:3000" }),

    // Github Configration
    GITHUB_CLIENT_ID: Type.String(),
    GITHUB_CLIENT_SECRET: Type.String(),
    GITHUB_CALLBACK_URL: Type.String({
        default: "http://localhost:8080/api/v1/oauth/github/callback",
    }),

    //Google Configration
    GOOGLE_CLIENT_ID: Type.String(),
    GOOGLE_CLIENT_SECRET: Type.String(),
    GOOGLE_CALLBACK_URL: Type.String({
        default: "http://localhost:8080/api/v1/oauth/google/callback",
    }),

    // User Purge Cleanup Configration
    USER_PURGE_GRACE_PERIOD_DAYS: Type.Number({ default: 30 }),
    USER_PURGE_CRON: Type.String({ default: "0 3 * * *" }),

    // R2 Configration
    R2_BUCKET_NAME: Type.String({ default: "tdn" }),
    R2_ACCESS_KEY_ID: Type.String({ default: "r2_access_key_id " }),
    R2_SECRET_ACCESS_KEY: Type.String({ default: "r2_secret_Access_key" }),

    R2_ENDPOINT: Type.String({
        default:
            "https://d84c58bc43f6c50f8799a4b8485f5b35.r2.cloudflarestorage.com",
    }),
    R2_PUBLIC_URL: Type.String({
        default: "https://pub-2e6c13927ac24d548fd5b783e3cdaeb5.r2.dev",
    }),

    REDIS_URL: Type.String(),
    NOTIFICATION_PURGE_CRON: Type.String({ default: "0 3 * * *" }),
    NOTIFICATION_PURGE_GRACE_PERIOD_DAYS: Type.Number({ default: 30 }),
    // How long direct message history is kept. Past this the message and its
    // attachments are destroyed - by us as well as by the user, so shortening
    // it is not something to do quietly.
    MESSAGE_RETENTION_CRON: Type.String({ default: "0 4 * * *" }),
    MESSAGE_RETENTION_DAYS: Type.Number({ default: 365, minimum: 1 }),

    RESEND_API_KEY: Type.String({ default: "resend_api_key" }),

    // DeepL Translation
    DEEPL_API_KEY: Type.String({ default: "deepl_api_key" }),

    // Frontend URL for OAuth redirects
    FRONTEND_URL: Type.String({ default: "http://localhost:5173" }),
    API_URL: Type.String({ default: "http://localhost:8080" }),

    // --- Media moderation ---
    // Turned off in the test environment and in local setups without provider
    // credentials, where a stand-in approves everything. It is never a
    // fallback: a failed provider call refuses the upload rather than
    // switching this off.
    MODERATION_ENABLED: Type.Boolean({ default: false }),
    SIGHTENGINE_API_USER: Type.String({ default: "" }),
    SIGHTENGINE_API_SECRET: Type.String({ default: "" }),
    // Both thresholds are a starting guess. Raw provider scores are stored on
    // every asset precisely so these can be retuned against real traffic.
    MODERATION_REJECT_THRESHOLD: Type.Number({
        default: 0.75,
        minimum: 0,
        maximum: 1,
    }),
    MODERATION_SENSITIVE_THRESHOLD: Type.Number({
        default: 0.4,
        minimum: 0,
        maximum: 1,
    }),
    // Bounds how long an image upload can be held open waiting on the
    // provider. Past this the upload fails closed.
    MODERATION_REQUEST_TIMEOUT_MS: Type.Number({ default: 15000, minimum: 1 }),

    // Runs every minute: what it clears is a user waiting to see their own
    // post, and a video that takes an hour to appear reads as a broken upload.
    MEDIA_MODERATION_CRON: Type.String({ default: "* * * * *" }),
    MEDIA_MODERATION_BATCH_SIZE: Type.Number({ default: 10, minimum: 1 }),
    // A file that cannot be checked after this many tries is refused rather
    // than left pending forever, so the author learns to upload it again.
    MEDIA_MODERATION_MAX_ATTEMPTS: Type.Number({ default: 3, minimum: 1 }),
    // How long a worker's claim on an asset is honoured. A process killed
    // mid-scan - a redeploy, an OOM - leaves the asset claimed, and without a
    // lease the post carrying it would withhold its media forever. Comfortably
    // longer than a scan so a slow one is not stolen from the worker doing it.
    MEDIA_MODERATION_LEASE_SECONDS: Type.Number({ default: 600, minimum: 1 }),

    // --- Feed ranking ---
    // The right values here are an empirical question, so they are configured
    // rather than compiled in: the mix can be retuned without a deploy.
    //
    // With the defaults a post in the viewer's language starts at 4x the score
    // of one they cannot read, which roughly 36 hours of freshness - two
    // half-lives - is needed to overcome.
    FEED_WEIGHT_LANGUAGE: Type.Number({ default: 3 }),
    FEED_WEIGHT_SOCIAL: Type.Number({ default: 2 }),
    // Sits just under the language weight: what a reader is into should shape
    // their feed strongly, but not enough on its own to serve them a language
    // they cannot read.
    FEED_WEIGHT_AFFINITY: Type.Number({ default: 2.5 }),
    FEED_WEIGHT_ENGAGEMENT: Type.Number({ default: 0.6 }),
    FEED_HALF_LIFE_HOURS: Type.Number({ default: 18, minimum: 1 }),
    FEED_MAX_POSTS_PER_AUTHOR: Type.Number({ default: 3, minimum: 1 }),
    // A ceiling on content the reader cannot read, not a target: it applies
    // only while there is content in their own language to spend the other
    // slots on. When there is none the feed serves what exists rather than
    // running dry.
    FEED_FOREIGN_LANGUAGE_QUOTA: Type.Number({
        default: 0.2,
        minimum: 0,
        maximum: 1,
    }),
    // Share of slots given to a post that did not win on score. Without it the
    // feed can only narrow: affinity is learned from what a reader interacted
    // with, and they can only interact with what they were shown.
    FEED_EXPLORATION_RATE: Type.Number({
        default: 0.1,
        minimum: 0,
        maximum: 1,
    }),
    FEED_CANDIDATE_POOL_SIZE: Type.Number({ default: 300, minimum: 1 }),
    FEED_CANDIDATE_WINDOW_DAYS: Type.Number({ default: 7, minimum: 1 }),

    // --- User interest profiles ---
    // Rebuilt nightly. Interests move over weeks, so a profile that is a day
    // stale ranks a feed indistinguishably from a fresh one.
    USER_INTEREST_REBUILD_CRON: Type.String({ default: "0 4 * * *" }),
    USER_INTEREST_WINDOW_DAYS: Type.Number({ default: 30, minimum: 1 }),
    USER_INTEREST_HALF_LIFE_DAYS: Type.Number({ default: 10, minimum: 1 }),
    USER_INTEREST_MAX: Type.Number({ default: 40, minimum: 1 }),
    // Below this a normalised interest is a stray like on something the reader
    // never went back to, and keeping it would hand unrelated posts a small
    // bonus forever.
    USER_INTEREST_MIN_WEIGHT: Type.Number({
        default: 0.05,
        minimum: 0,
        maximum: 1,
    }),
    // Cap per interaction type, so one prolific account cannot make the
    // nightly job unbounded.
    USER_INTEREST_SIGNAL_LIMIT: Type.Number({ default: 500, minimum: 1 }),

    // --- Daily digest ---
    // One email a morning to anyone with something waiting: notifications they
    // have not read, and posts from the last day matching their interests.
    // Interest profiles are rebuilt at 04:00, so 09:00 reads a fresh one.
    DAILY_DIGEST_ENABLED: Type.Boolean({ default: false }),
    DAILY_DIGEST_CRON: Type.String({ default: "0 9 * * *" }),
    // The only scheduler in the codebase that pins a timezone. The others run
    // in the container's local time, which is fine for a purge and wrong for
    // something that has to land at breakfast.
    DAILY_DIGEST_TIMEZONE: Type.String({ default: "Europe/Istanbul" }),
    // How far back a first-ever digest reaches, and the ceiling for someone
    // who has not received one in a while - without it, a user returning after
    // three months is mailed three months of notifications.
    DAILY_DIGEST_WINDOW_HOURS: Type.Number({ default: 24, minimum: 1 }),
    DAILY_DIGEST_MAX_WINDOW_DAYS: Type.Number({ default: 7, minimum: 1 }),
    // Recipients per page of the audience sweep, and the largest batch the
    // provider accepts in one request.
    DAILY_DIGEST_USER_PAGE_SIZE: Type.Number({ default: 200, minimum: 1 }),
    DAILY_DIGEST_BATCH_SIZE: Type.Number({
        default: 100,
        minimum: 1,
        maximum: 100,
    }),
    DAILY_DIGEST_BATCH_PAUSE_MS: Type.Number({ default: 600, minimum: 0 }),
    // Most items each section shows, and the shared pool every recipient is
    // ranked against.
    DAILY_DIGEST_MAX_NOTIFICATIONS: Type.Number({ default: 8, minimum: 1 }),
    DAILY_DIGEST_MAX_POSTS: Type.Number({ default: 5, minimum: 1 }),
    DAILY_DIGEST_CANDIDATE_POOL_SIZE: Type.Number({ default: 300, minimum: 1 }),

    // --- Content reports ---
    // Where moderation mail goes. Empty - the default - turns both the
    // escalation alert and the morning summary off without touching anything
    // else: reports are still filed and still queue up, they just wait for
    // somebody to read the table.
    MODERATION_ALERT_EMAIL: Type.String({ default: "" }),
    // Separate people who must report one piece of content before the operator
    // is interrupted. Never one: a single report is a claim, and a threshold is
    // what stops one account summoning an email about anybody it dislikes.
    REPORT_ALERT_THRESHOLD: Type.Number({ default: 3, minimum: 2 }),
    // The morning summary of everything still open. Pinned to a timezone for
    // the reason the daily digest is - it has to land at breakfast - and set an
    // hour earlier so the queue is read before the day's traffic arrives.
    REPORT_DIGEST_ENABLED: Type.Boolean({ default: false }),
    REPORT_DIGEST_CRON: Type.String({ default: "0 8 * * *" }),
    REPORT_DIGEST_TIMEZONE: Type.String({ default: "Europe/Istanbul" }),
    // Most reports one summary covers. The count of everything open is
    // reported beside the contents, so a truncated morning says so.
    REPORT_DIGEST_MAX_REPORTS: Type.Number({ default: 50, minimum: 1 }),
    // A report holds a copy of what somebody wrote, which is why it is useful
    // and why it is not kept forever. Age is the only criterion.
    REPORT_RETENTION_DAYS: Type.Number({ default: 180, minimum: 1 }),
    REPORT_PURGE_CRON: Type.String({ default: "0 5 * * *" }),

    // How long after a rotation a retired refresh token is still accepted as a
    // retry rather than treated as a stolen one. Mobile clients lose the
    // *response* to a refresh regularly - a dropped connection is enough - and
    // without this window that retry signs the user out of every device.
    REFRESH_ROTATION_GRACE_SECONDS: Type.Number({ default: 30, minimum: 0 }),

    // Largest single upload accepted, in megabytes. The parser buffers what it
    // reads and the instance is small, so this is a ceiling for the occasional
    // large file rather than a target - clients compress first.
    MEDIA_MAX_FILE_SIZE_MB: Type.Number({ default: 10, minimum: 1 }),

    // Where an OAuth flow may return to, beyond the web app's own page.
    // Comma-separated and matched *exactly* - no prefix test, no host
    // comparison. The target receives the exchange code, so a loose match here
    // hands whoever owns the address a session, which is how open redirects
    // stop being cosmetic.
    OAUTH_REDIRECT_ALLOWLIST: Type.String({ default: "" }),
    // The same, for the app's own scheme (e.g. tdn://oauth-success). A flow
    // returning to one of these delivers its refresh token in the exchange
    // response body rather than in a cookie - which is why the two lists are
    // separate rather than one list with a rule about schemes.
    OAUTH_NATIVE_REDIRECT_ALLOWLIST: Type.String({ default: "" }),

    // --- Mobile clients ---
    // A web client is whatever was served this morning; an app version lives on
    // phones for months. These let the API tell a build that it is too old to
    // be talked to, which is the only thing that makes a breaking change safe
    // once there is an app in a store.
    //
    // Build numbers, not semantic versions: that is what the stores increment
    // and what the client can report without parsing anything. Zero means "no
    // floor", which is the state until the first release.
    MOBILE_MIN_SUPPORTED_BUILD: Type.Number({ default: 0, minimum: 0 }),
    MOBILE_LATEST_BUILD: Type.Number({ default: 0, minimum: 0 }),
    MOBILE_STORE_URL_ANDROID: Type.String({ default: "" }),

    // Set to true to bypass rate limiting (e.g. in test environments)
    DISABLE_RATE_LIMIT: Type.Boolean({ default: false }),
});

export type EnvConfig = Static<typeof EnvSchema>;
