/**
 * The kinds of forbidden or borderline content moderation looks for.
 *
 * Deliberately provider-neutral: a Sightengine class name or a Rekognition
 * label is mapped onto one of these before it reaches the domain, so swapping
 * providers does not change what the rest of the codebase reads.
 */
export enum MediaModerationCategory {
    /**
     * Exposed nudity, short of a depicted sexual act.
     */
    NUDITY = "NUDITY",

    /**
     * A depicted sexual act.
     */
    SEXUAL_ACTIVITY = "SEXUAL_ACTIVITY",

    /**
     * Suggestive but clothed. Only ever borderline, never a rejection on its
     * own.
     */
    SUGGESTIVE = "SUGGESTIVE",

    /**
     * Blood, injury, corpses, mutilation.
     */
    GORE = "GORE",

    /**
     * Depicted physical violence against a person or animal.
     */
    VIOLENCE = "VIOLENCE",

    /**
     * A weapon shown in a threatening context.
     */
    WEAPON = "WEAPON",

    /**
     * Self-harm or its promotion.
     */
    SELF_HARM = "SELF_HARM",

    /**
     * Hate symbols and comparable offensive imagery.
     */
    OFFENSIVE = "OFFENSIVE",
}
