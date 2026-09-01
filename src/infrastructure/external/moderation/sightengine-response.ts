/**
 * Flattens a Sightengine response into `class -> probability` pairs.
 *
 * The provider nests its answer differently per model - `nudity` is a flat map
 * of classes, `gore` and `violence` carry a single `prob`, and `weapon` has
 * changed shape across model versions - so the shape is normalised once here
 * and everything downstream reads plain dotted keys.
 */

/**
 * The keys under `nudity` that are class probabilities. `none` and `context`
 * describe the absence of a match and are deliberately not carried through.
 */
const NUDITY_CLASSES = [
    "sexual_activity",
    "sexual_display",
    "erotica",
    "very_suggestive",
    "suggestive",
    "mildly_suggestive",
] as const;

/** Models that answer with a single probability under `prob`. */
const PROB_MODELS = ["gore", "violence", "self-harm", "offensive"] as const;

/**
 * Reads a number out of an unknown value, or null when it is not one.
 *
 * @param value - The value to read
 * @returns The number, or null
 */
function asNumber(value: unknown): number | null {
    return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

/**
 * Reads a plain object out of an unknown value.
 *
 * @param value - The value to read
 * @returns The object, or null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * Flattens one Sightengine result object - a whole image response, or a single
 * video frame - into dotted class keys.
 *
 * @param result - The provider's result object
 * @returns Flattened `class -> probability` pairs
 */
export function flattenSightengineScores(
    result: Record<string, unknown>,
): Record<string, number> {
    const scores: Record<string, number> = {};

    const nudity = asRecord(result.nudity);

    if (nudity) {
        for (const cls of NUDITY_CLASSES) {
            const score = asNumber(nudity[cls]);
            if (score !== null) scores["nudity." + cls] = score;
        }
    }

    for (const model of PROB_MODELS) {
        const section = asRecord(result[model]);
        const score = section ? asNumber(section.prob) : null;

        if (score !== null) scores[model + ".prob"] = score;
    }

    // The weapon model reports per-class probabilities in its current version
    // and a single number in the older one. The highest class is what matters
    // either way, so both shapes collapse to one key.
    const weapon = result.weapon;
    const flatWeapon = asNumber(weapon);

    if (flatWeapon !== null) {
        scores["weapon.prob"] = flatWeapon;
    } else {
        const weaponClasses = asRecord(asRecord(weapon)?.classes);

        if (weaponClasses) {
            const values = Object.values(weaponClasses)
                .map(asNumber)
                .filter((value): value is number => value !== null);

            if (values.length > 0) {
                scores["weapon.prob"] = Math.max(...values);
            }
        }
    }

    return scores;
}

/**
 * Reduces a video's per-frame results to the worst score seen for each class.
 *
 * A clip is exactly as acceptable as its worst frame: content that appears for
 * a second is still published, and averaging across frames would let a long
 * clean stretch bury it.
 *
 * @param frames - The frame results from a video response
 * @returns Flattened `class -> highest probability across frames` pairs
 */
export function flattenSightengineFrames(
    frames: Record<string, unknown>[],
): Record<string, number> {
    const worst: Record<string, number> = {};

    for (const frame of frames) {
        for (const [key, score] of Object.entries(
            flattenSightengineScores(frame),
        )) {
            if (worst[key] === undefined || score > worst[key]) {
                worst[key] = score;
            }
        }
    }

    return worst;
}
