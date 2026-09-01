import {
    MediaModerationCategory,
    MediaModerationStatus,
    type MediaModerationVerdict,
} from "@core/domain/enums";

/**
 * The two cut-offs that turn provider scores into a decision.
 */
export interface ModerationThresholds {
    /** At or above this, a rejecting class refuses the file outright. */
    reject: number;

    /** At or above this, any flagged class marks the media sensitive. */
    sensitive: number;
}

/**
 * How far a class is allowed to escalate.
 *
 * `REJECT` classes can refuse an upload; `SENSITIVE` ones can only ever ask
 * for a blur, however confident the provider is.
 */
enum ClassTier {
    REJECT = "REJECT",
    SENSITIVE = "SENSITIVE",
}

interface ClassRule {
    category: MediaModerationCategory;
    tier: ClassTier;
}

/**
 * Maps a provider class onto a domain category and the worst it may do.
 *
 * The tiers encode a judgement about this platform rather than about the
 * models. Weapons and depicted violence sit at SENSITIVE because a developer
 * network is full of game screenshots, and a filter that deletes those is a
 * filter people route around. Gore, sexual content, self-harm and hate imagery
 * sit at REJECT because there is no reading of them that belongs in a feed.
 */
const CLASS_RULES: Record<string, ClassRule> = {
    "nudity.sexual_activity": {
        category: MediaModerationCategory.SEXUAL_ACTIVITY,
        tier: ClassTier.REJECT,
    },
    "nudity.sexual_display": {
        category: MediaModerationCategory.NUDITY,
        tier: ClassTier.REJECT,
    },
    "nudity.erotica": {
        category: MediaModerationCategory.NUDITY,
        tier: ClassTier.REJECT,
    },
    "nudity.very_suggestive": {
        category: MediaModerationCategory.SUGGESTIVE,
        tier: ClassTier.SENSITIVE,
    },
    "nudity.suggestive": {
        category: MediaModerationCategory.SUGGESTIVE,
        tier: ClassTier.SENSITIVE,
    },
    "nudity.mildly_suggestive": {
        category: MediaModerationCategory.SUGGESTIVE,
        tier: ClassTier.SENSITIVE,
    },
    "gore.prob": {
        category: MediaModerationCategory.GORE,
        tier: ClassTier.REJECT,
    },
    "self-harm.prob": {
        category: MediaModerationCategory.SELF_HARM,
        tier: ClassTier.REJECT,
    },
    "offensive.prob": {
        category: MediaModerationCategory.OFFENSIVE,
        tier: ClassTier.REJECT,
    },
    "violence.prob": {
        category: MediaModerationCategory.VIOLENCE,
        tier: ClassTier.SENSITIVE,
    },
    "weapon.prob": {
        category: MediaModerationCategory.WEAPON,
        tier: ClassTier.SENSITIVE,
    },
};

/**
 * The result of reading a set of scores.
 */
export interface ScoreVerdict {
    verdict: MediaModerationVerdict;

    /** Every category that met at least the sensitive threshold. */
    categories: MediaModerationCategory[];
}

/**
 * Turns provider class scores into a verdict.
 *
 * Kept as a pure function, separate from the HTTP client, because the
 * thresholds are the part that will actually get retuned: they can be pinned
 * by unit tests and moved from the environment without anyone touching the
 * code that talks to the provider.
 *
 * Unknown classes are ignored rather than treated as clean or as suspect - a
 * provider adding a model should not silently start rejecting uploads, nor
 * should it look like the file was checked for something it was not.
 *
 * @param scores - Flattened `class -> probability` pairs from the provider
 * @param thresholds - The reject and sensitive cut-offs
 * @returns The verdict and the categories behind it
 */
export function scoreToVerdict(
    scores: Record<string, number>,
    thresholds: ModerationThresholds,
): ScoreVerdict {
    const categories = new Set<MediaModerationCategory>();
    let rejected = false;

    for (const [key, rule] of Object.entries(CLASS_RULES)) {
        const score = scores[key];

        if (typeof score !== "number" || Number.isNaN(score)) continue;

        if (score >= thresholds.reject && rule.tier === ClassTier.REJECT) {
            rejected = true;
            categories.add(rule.category);
            continue;
        }

        if (score >= thresholds.sensitive) {
            categories.add(rule.category);
        }
    }

    if (rejected) {
        return {
            verdict: MediaModerationStatus.REJECTED,
            categories: [...categories],
        };
    }

    if (categories.size > 0) {
        return {
            verdict: MediaModerationStatus.SENSITIVE,
            categories: [...categories],
        };
    }

    return { verdict: MediaModerationStatus.APPROVED, categories: [] };
}
