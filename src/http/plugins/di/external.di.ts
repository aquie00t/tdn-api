import { asClass, asFunction } from "awilix";
import { EmailService } from "@infrastructure/external/email.service";
import { GithubAuthService } from "@infrastructure/external/github-auth.service";
import { GoogleAuthService } from "@infrastructure/external/google-auth.service";
import { S3StorageService } from "@infrastructure/external/s3-storage.service";
import { DeepLTranslationService } from "@infrastructure/external/deepl-translation.service";
import { HeuristicLanguageDetectionService } from "@infrastructure/external/heuristic-language-detection.service";

export const externalModule = {
    // --- Services ---
    storageService: asClass(S3StorageService).singleton(),
    emailService: asFunction((config, logger) => {
        return new EmailService(
            {
                apiKey: config.RESEND_API_KEY,
                from: config.EMAIL_FROM,
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
};
