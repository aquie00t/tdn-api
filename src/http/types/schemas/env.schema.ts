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

    // --- Feed ranking ---
    // The right values here are an empirical question, so they are configured
    // rather than compiled in: the mix can be retuned without a deploy.
    //
    // With the defaults a post in the viewer's language starts at 4x the score
    // of one they cannot read, which roughly 36 hours of freshness - two
    // half-lives - is needed to overcome.
    FEED_WEIGHT_LANGUAGE: Type.Number({ default: 3 }),
    FEED_WEIGHT_SOCIAL: Type.Number({ default: 2 }),
    FEED_WEIGHT_ENGAGEMENT: Type.Number({ default: 0.6 }),
    FEED_HALF_LIFE_HOURS: Type.Number({ default: 18, minimum: 1 }),
    FEED_MAX_POSTS_PER_AUTHOR: Type.Number({ default: 3, minimum: 1 }),
    FEED_FOREIGN_LANGUAGE_QUOTA: Type.Number({
        default: 0.25,
        minimum: 0,
        maximum: 1,
    }),
    FEED_CANDIDATE_POOL_SIZE: Type.Number({ default: 300, minimum: 1 }),
    FEED_CANDIDATE_WINDOW_DAYS: Type.Number({ default: 7, minimum: 1 }),

    // Set to true to bypass rate limiting (e.g. in test environments)
    DISABLE_RATE_LIMIT: Type.Boolean({ default: false }),
});

export type EnvConfig = Static<typeof EnvSchema>;
