import { MediaModerationStatus } from "@core/domain/enums";
import type {
    MediaModerationPort,
    MediaModerationResult,
} from "@core/ports/services/media-moderation.port";

/** Identifies this stand-in in stored results. */
const PROVIDER = "noop";

/**
 * A moderation port that approves everything.
 *
 * Selected when `MODERATION_ENABLED` is false, which is the case in the test
 * environment and in any local setup without provider credentials. Tests must
 * not depend on a third-party service being reachable, and a developer running
 * the API on a laptop should not have to hold an API key to upload a picture.
 *
 * It is deliberately not a fallback: production selects this only if someone
 * explicitly turned moderation off, never because a call failed. A failed call
 * refuses the upload instead.
 */
export class NoopModerationService implements MediaModerationPort {
    /**
     * Approves the image without looking at it.
     *
     * @returns A clean verdict
     */
    moderateImage(): Promise<MediaModerationResult> {
        return Promise.resolve(this.approve());
    }

    /**
     * Approves the video without looking at it.
     *
     * @returns A clean verdict
     */
    moderateVideo(): Promise<MediaModerationResult> {
        return Promise.resolve(this.approve());
    }

    /**
     * Builds the clean verdict shared by both methods.
     *
     * @returns A result carrying no scores and no categories
     */
    private approve(): MediaModerationResult {
        return {
            verdict: MediaModerationStatus.APPROVED,
            categories: [],
            scores: {},
            provider: PROVIDER,
        };
    }
}
