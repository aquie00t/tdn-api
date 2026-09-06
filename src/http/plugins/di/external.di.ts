import { asClass, asFunction } from "awilix";
import { EmailService } from "@infrastructure/external/email.service";
import {
    ExpoPushService,
    NoopPushService,
} from "@infrastructure/external/push/expo-push.service";
import { GithubAuthService } from "@infrastructure/external/github-auth.service";
import { GoogleAuthService } from "@infrastructure/external/google-auth.service";
import { S3StorageService } from "@infrastructure/external/s3-storage.service";
import { DeepLTranslationService } from "@infrastructure/external/deepl-translation.service";
import { HeuristicLanguageDetectionService } from "@infrastructure/external/heuristic-language-detection.service";
import { SightengineModerationService } from "@infrastructure/external/moderation/sightengine-moderation.service";
import { NoopModerationService } from "@infrastructure/external/moderation/noop-moderation.service";

export const externalModule = {
    // --- Services ---
    storageService: asClass(S3StorageService).singleton(),
    /**
     * Push delivery. Disabled by default: a deployment with no Expo project
     * registers devices and sends nothing, rather than logging a failed HTTP
     * call for every notification.
     */
    pushService: asFunction((config, logger) => {
        if (!config.PUSH_ENABLED) return new NoopPushService();

        return new ExpoPushService(
            { accessToken: config.EXPO_ACCESS_TOKEN },
            logger,
        );
    }).singleton(),

    emailService: asFunction((config, logger) => {
        return new EmailService(
            {
                apiKey: config.RESEND_API_KEY,
                from: config.EMAIL_FROM,
                digestBatchSize: config.DAILY_DIGEST_BATCH_SIZE,
                digestBatchPauseMs: config.DAILY_DIGEST_BATCH_PAUSE_MS,
            },
            logger,
        );
    }).singleton(),

    githubAuthService: asFunction((config) => {
        return new GithubAuthService({
            clientId: config.GITHUB_CLIENT_ID,
            clientSecret: config.GITHUB_CLIENT_SECRET,
            callbackUrl: config.GITHUB_CALLBACK_URL,
        });
    }).singleton(),

    googleAuthService: asFunction((config) => {
        return new GoogleAuthService({
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
            callbackUrl: config.GOOGLE_CALLBACK_URL,
        });
    }).singleton(),

    translationService: asFunction((config) => {
        return new DeepLTranslationService({ apiKey: config.DEEPL_API_KEY });
    }).singleton(),

    languageDetectionService: asClass(
        HeuristicLanguageDetectionService,
    ).singleton(),

    /**
     * Automated content moderation for uploaded media.
     *
     * The stand-in is chosen only when moderation is explicitly turned off -
     * the test environment, and local setups without credentials. It is never
     * a fallback for a provider that is down: an upload that could not be
     * checked is refused rather than waved through.
     */
    mediaModerationService: asFunction((config, logger) => {
        if (!config.MODERATION_ENABLED) return new NoopModerationService();

        return new SightengineModerationService(
            {
                apiUser: config.SIGHTENGINE_API_USER,
                apiSecret: config.SIGHTENGINE_API_SECRET,
                thresholds: {
                    reject: config.MODERATION_REJECT_THRESHOLD,
                    sensitive: config.MODERATION_SENSITIVE_THRESHOLD,
                },
                timeoutMs: config.MODERATION_REQUEST_TIMEOUT_MS,
            },
            logger,
        );
    }).singleton(),
};
