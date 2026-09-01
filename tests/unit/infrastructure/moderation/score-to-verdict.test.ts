import { describe, expect, it } from "vitest";
import {
    MediaModerationCategory,
    MediaModerationStatus,
} from "@core/domain/enums";
import { scoreToVerdict } from "@infrastructure/external/moderation/score-to-verdict";
import {
    flattenSightengineFrames,
    flattenSightengineScores,
} from "@infrastructure/external/moderation/sightengine-response";

const THRESHOLDS = { reject: 0.75, sensitive: 0.4 };

describe("scoreToVerdict()", () => {
    it("should approve a clean file", () => {
        expect(
            scoreToVerdict(
                {
                    "nudity.sexual_activity": 0.01,
                    "gore.prob": 0.02,
                    "violence.prob": 0.03,
                },
                THRESHOLDS,
            ),
        ).toEqual({
            verdict: MediaModerationStatus.APPROVED,
            categories: [],
        });
    });

    it("should reject explicit sexual content above the reject threshold", () => {
        const result = scoreToVerdict(
            { "nudity.sexual_activity": 0.9 },
            THRESHOLDS,
        );

        expect(result.verdict).toBe(MediaModerationStatus.REJECTED);
        expect(result.categories).toContain(
            MediaModerationCategory.SEXUAL_ACTIVITY,
        );
    });

    it("should reject gore above the reject threshold", () => {
        expect(scoreToVerdict({ "gore.prob": 0.8 }, THRESHOLDS).verdict).toBe(
            MediaModerationStatus.REJECTED,
        );
    });

    it("should mark suggestive content sensitive rather than rejecting it", () => {
        // Suggestive is a blur, never a removal, no matter how confident the
        // provider is.
        const result = scoreToVerdict(
            { "nudity.suggestive": 0.99 },
            THRESHOLDS,
        );

        expect(result.verdict).toBe(MediaModerationStatus.SENSITIVE);
        expect(result.categories).toEqual([MediaModerationCategory.SUGGESTIVE]);
    });

    it("should keep weapons and depicted violence at sensitive", () => {
        // A developer network is full of game screenshots. A filter that
        // deletes those is a filter people route around.
        expect(
            scoreToVerdict({ "weapon.prob": 0.99 }, THRESHOLDS).verdict,
        ).toBe(MediaModerationStatus.SENSITIVE);
        expect(
            scoreToVerdict({ "violence.prob": 0.99 }, THRESHOLDS).verdict,
        ).toBe(MediaModerationStatus.SENSITIVE);
    });

    it("should ignore a score sitting below the sensitive threshold", () => {
        expect(
            scoreToVerdict({ "nudity.suggestive": 0.39 }, THRESHOLDS).verdict,
        ).toBe(MediaModerationStatus.APPROVED);
    });

    it("should let a rejecting class win over a sensitive one", () => {
        const result = scoreToVerdict(
            { "nudity.suggestive": 0.9, "gore.prob": 0.9 },
            THRESHOLDS,
        );

        expect(result.verdict).toBe(MediaModerationStatus.REJECTED);
    });

    it("should ignore classes it does not know", () => {
        // A provider adding a model must not silently start rejecting uploads.
        expect(
            scoreToVerdict({ "some-new-model.prob": 1 }, THRESHOLDS).verdict,
        ).toBe(MediaModerationStatus.APPROVED);
    });

    it("should honour thresholds moved from the environment", () => {
        expect(
            scoreToVerdict(
                { "gore.prob": 0.5 },
                { reject: 0.4, sensitive: 0.2 },
            ).verdict,
        ).toBe(MediaModerationStatus.REJECTED);
    });
});

describe("flattenSightengineScores()", () => {
    it("should flatten the provider's nested answer into dotted keys", () => {
        expect(
            flattenSightengineScores({
                nudity: {
                    sexual_activity: 0.9,
                    suggestive: 0.2,
                    none: 0.05,
                    context: { sea_lingerie: 0.1 },
                },
                gore: { prob: 0.3 },
                violence: { prob: 0.1 },
            }),
        ).toEqual({
            "nudity.sexual_activity": 0.9,
            "nudity.suggestive": 0.2,
            "gore.prob": 0.3,
            "violence.prob": 0.1,
        });
    });

    it("should read both shapes the weapon model has used", () => {
        expect(
            flattenSightengineScores({
                weapon: { classes: { firearm: 0.8, knife: 0.2 } },
            }),
        ).toEqual({ "weapon.prob": 0.8 });

        expect(flattenSightengineScores({ weapon: 0.6 })).toEqual({
            "weapon.prob": 0.6,
        });
    });

    it("should survive a response missing the models entirely", () => {
        expect(flattenSightengineScores({ status: "success" })).toEqual({});
    });
});

describe("flattenSightengineFrames()", () => {
    it("should keep the worst score seen across frames", () => {
        // A clip is exactly as acceptable as its worst frame: content that
        // appears for a second is still published.
        expect(
            flattenSightengineFrames([
                { gore: { prob: 0.01 } },
                { gore: { prob: 0.92 } },
                { gore: { prob: 0.02 } },
            ]),
        ).toEqual({ "gore.prob": 0.92 });
    });
});
