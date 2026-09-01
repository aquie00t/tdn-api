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

describe("a real Sightengine response", () => {
    /**
     * Captured from the live API on 2026-09-01, trimmed to the sections the
     * parser reads. Written from a real body rather than an invented one:
     * every model nests its answer differently, and the shape this has to
     * survive is the provider's, not ours.
     */
    const response = {
        status: "success",
        nudity: {
            sexual_activity: 0.001,
            sexual_display: 0.001,
            erotica: 0.001,
            very_suggestive: 0.001,
            suggestive: 0.001,
            mildly_suggestive: 0.001,
            suggestive_classes: { bikini: 0.001, cleavage: 0.001 },
            none: 0.99,
            context: { sea_lake_pool: 0.001, outdoor_other: 0.5 },
        },
        gore: {
            prob: 0.001,
            classes: { very_bloody: 0.001, corpse: 0.001 },
            type: { real: 0.001 },
        },
        violence: { prob: 0.001, classes: { physical_violence: 0.001 } },
        weapon: {
            classes: {
                firearm: 0.001,
                firearm_gesture: 0.001,
                firearm_toy: 0.02,
                knife: 0.001,
            },
            firearm_type: { animated: 0.001 },
            firearm_action: { aiming_threat: 0.001 },
        },
        "self-harm": { prob: 0.001, type: { real: 0.001 } },
        offensive: { prob: 0.01, nazi: 0.001, supremacist: 0.01 },
        media: { id: "med_x", uri: "https://cdn.example.com/avatar.png" },
    };

    it("should read every model the request asks for", () => {
        expect(flattenSightengineScores(response)).toEqual({
            "nudity.sexual_activity": 0.001,
            "nudity.sexual_display": 0.001,
            "nudity.erotica": 0.001,
            "nudity.very_suggestive": 0.001,
            "nudity.suggestive": 0.001,
            "nudity.mildly_suggestive": 0.001,
            "gore.prob": 0.001,
            "violence.prob": 0.001,
            "self-harm.prob": 0.001,
            "offensive.prob": 0.01,
            // The highest weapon class, not the whole map.
            "weapon.prob": 0.02,
        });
    });

    it("should ignore the descriptive fields sitting beside the scores", () => {
        // `none`, `context`, `suggestive_classes`, `type` and `media` are not
        // class probabilities. Reading one as a score would flag a clean file:
        // `none` is 0.99 on exactly the images nothing is wrong with.
        const scores = flattenSightengineScores(response);

        expect(scores["nudity.none"]).toBeUndefined();
        expect(scores["gore.type"]).toBeUndefined();
        expect(Object.keys(scores)).toHaveLength(11);
    });

    it("should approve a clean file", () => {
        expect(
            scoreToVerdict(flattenSightengineScores(response), THRESHOLDS)
                .verdict,
        ).toBe(MediaModerationStatus.APPROVED);
    });

    it("should reject the same body carrying an explicit score", () => {
        const explicit = {
            ...response,
            nudity: { ...response.nudity, sexual_activity: 0.97 },
        };

        expect(
            scoreToVerdict(flattenSightengineScores(explicit), THRESHOLDS),
        ).toEqual({
            verdict: MediaModerationStatus.REJECTED,
            categories: [MediaModerationCategory.SEXUAL_ACTIVITY],
        });
    });
});
