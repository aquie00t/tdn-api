import type { LoggerPort } from "@core/ports/services/logger.port";
import type {
    MediaModerationPort,
    MediaModerationResult,
} from "@core/ports/services/media-moderation.port";
import {
    flattenSightengineFrames,
    flattenSightengineScores,
} from "./sightengine-response";
import { scoreToVerdict, type ModerationThresholds } from "./score-to-verdict";

/** Identifies this provider in stored results. */
const PROVIDER = "sightengine";

/** Base URL of the Sightengine REST API. */
const API_BASE = "https://api.sightengine.com/1.0";

/**
 * The models asked for on every call.
 *
 * `nudity-2.1` supersedes the older nudity model and reports graded classes
 * rather than a single number, which is what makes a "blur this" verdict
 * possible at all.
 */
const MODELS = "nudity-2.1,gore-2.0,violence,weapon,self-harm,offensive";

/**
 * Credentials and tuning for the Sightengine client.
 */
export interface SightengineConfig {
    apiUser: string;
    apiSecret: string;
    thresholds: ModerationThresholds;
    timeoutMs: number;
}

/**
 * Sightengine implementation of the media moderation port.
 *
 * One provider covers both stills and video, and video can be handed over as a
 * URL, which is the reason it was chosen over the alternatives: the platform
 * stores media in Cloudflare R2, and the providers that only accept video from
 * their own cloud's object storage would have meant copying every upload into
 * a second bucket purely to have it looked at.
 */
export class SightengineModerationService implements MediaModerationPort {
    /**
     * Creates a new instance of SightengineModerationService.
     *
     * @param config - Credentials, thresholds and the request timeout
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly config: SightengineConfig,
        private readonly logger: LoggerPort,
    ) {
        // Fails the boot rather than every upload. Without this a deploy that
        // forgot the secrets comes up healthy and answers 503 to each image
        // for as long as nobody notices - the failure is correct but silent,
        // and it looks like the provider is down rather than unconfigured.
        if (!config.apiUser || !config.apiSecret) {
            throw new Error(
                "MODERATION_ENABLED is true but SIGHTENGINE_API_USER / " +
                    "SIGHTENGINE_API_SECRET are not set.",
            );
        }
    }

    /**
     * Scans a still image by uploading its bytes.
     *
     * @param buffer - The image bytes
     * @param mimeType - The MIME type detected from those bytes
     * @returns The provider's verdict
     *
     * @throws Error - When the provider is unreachable or answers with a failure
     */
    async moderateImage(
        buffer: Buffer,
        mimeType: string,
    ): Promise<MediaModerationResult> {
        const form = new FormData();

        // Copied into a plain Uint8Array: a Node Buffer can sit on a
        // SharedArrayBuffer, which BlobPart does not accept.
        form.append(
            "media",
            new Blob([new Uint8Array(buffer)], { type: mimeType }),
            "upload",
        );
        form.append("models", MODELS);
        form.append("api_user", this.config.apiUser);
        form.append("api_secret", this.config.apiSecret);

        const payload = await this.send(API_BASE + "/check.json", form);

        return this.toResult(flattenSightengineScores(payload));
    }

    /**
     * Scans a stored video by URL.
     *
     * Uses the synchronous endpoint rather than the callback one: a webhook
     * would need a publicly reachable, signature-verified route on this API
     * purely to receive a result the background worker is already waiting for.
     * The worker is not holding a request open, so it can afford to block.
     *
     * @param publicUrl - Publicly reachable URL of the stored video
     * @returns The provider's verdict
     *
     * @throws Error - When the provider is unreachable or answers with a failure
     */
    async moderateVideo(publicUrl: string): Promise<MediaModerationResult> {
        const form = new FormData();

        form.append("stream_url", publicUrl);
        form.append("models", MODELS);
        form.append("api_user", this.config.apiUser);
        form.append("api_secret", this.config.apiSecret);

        const payload = await this.send(
            API_BASE + "/video/check-sync.json",
            form,
        );

        const data = payload.data as { frames?: unknown } | undefined;
        const frames = Array.isArray(data?.frames)
            ? (data.frames as Record<string, unknown>[])
            : [];

        if (frames.length === 0) {
            throw new Error("Sightengine returned no frames for the video.");
        }

        return this.toResult(flattenSightengineFrames(frames));
    }

    /**
     * Posts a form to the provider and returns the decoded body.
     *
     * A non-2xx response, a `status: "failure"` body and a timeout are all
     * raised as errors rather than being folded into a clean verdict. The
     * callers fail closed on an error, and a provider that answered "I could
     * not look at this" must not be mistaken for one that answered "this is
     * fine".
     *
     * @param url - The endpoint to call
     * @param form - The multipart body
     * @returns The decoded response body
     *
     * @throws Error - When the call fails or the provider reports a failure
     */
    private async send(
        url: string,
        form: FormData,
    ): Promise<Record<string, unknown>> {
        const response = await fetch(url, {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(
                "Sightengine responded with HTTP " + response.status + ".",
            );
        }

        const payload = (await response.json()) as Record<string, unknown>;

        if (payload.status === "failure") {
            const error = payload.error as { message?: string } | undefined;

            throw new Error(
                "Sightengine reported a failure: " +
                    (error?.message ?? "unknown error"),
            );
        }

        return payload;
    }

    /**
     * Applies the thresholds and logs anything that was not clean.
     *
     * @param scores - The flattened class scores
     * @returns The port-level result
     */
    private toResult(scores: Record<string, number>): MediaModerationResult {
        const { verdict, categories } = scoreToVerdict(
            scores,
            this.config.thresholds,
        );

        if (categories.length > 0) {
            this.logger.warn(
                {
                    context: "MediaModeration",
                    provider: PROVIDER,
                    verdict,
                    categories,
                },
                "Moderation flagged a file.",
            );
        }

        return { verdict, categories, scores, provider: PROVIDER };
    }
}
