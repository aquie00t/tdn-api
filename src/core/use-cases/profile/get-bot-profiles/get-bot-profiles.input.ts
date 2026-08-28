import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input for the GetBotProfilesUseCase.
 *
 * Drives the onboarding flow where a freshly registered user picks their
 * fields of interest and is offered the news bots that cover them.
 */
export interface GetBotProfilesInput {
    /**
     * Categories the caller is interested in. A bot matches when it carries at
     * least one of them. Omit to list every bot.
     */
    categories?: PostCategory[];

    /**
     * The ID of the requesting user, when authenticated.
     * Used to flag bots the user already follows.
     */
    currentUserId?: string;

    /** Maximum number of bots to return. */
    limit?: number;

    /** Number of bots to skip. */
    offset?: number;
}
