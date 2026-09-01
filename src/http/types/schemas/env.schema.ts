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

    // Set to true to bypass rate limiting (e.g. in test environments)
    DISABLE_RATE_LIMIT: Type.Boolean({ default: false }),
});

export type EnvConfig = Static<typeof EnvSchema>;
