/**
 * Represents a user profile retrieved from GitHub OAuth.
 */
export interface GithubProfile {
    /** The unique account identifier provided by GitHub. */
    providerAccountId: string;

    /** The GitHub username of the authenticated user. */
    username: string;

    /** The primary email address associated with the GitHub account. */
    email: string;

    /** Indicates whether the user's email address has been verified by GitHub. */
    isEmailVerified: boolean;
}

/**
 * Port interface for GitHub OAuth authentication operations.
 */
export interface GithubAuthPort {
    /**
     * Generates the GitHub OAuth authorization URL to redirect the user to.
     *
     * @param state - Opaque value the provider hands back on the callback. It
     * is what ties a callback to the flow that started it: without one, an
     * attacker can feed a victim's browser a callback of their own and have it
     * complete a login as somebody else, and there is nowhere to record which
     * client asked for the flow.
     * @returns The full authorization URL including required query parameters.
     */
    getAuthorizationUrl(state: string): string;

    /**
     * Exchanges an authorization code for tokens and retrieves the authenticated user's profile.
     *
     * @param code - The authorization code received from GitHub after user consent.
     * @returns A promise that resolves to the authenticated user's GitHub profile.
     * @throws {OAuthProviderError} If the token exchange or profile fetch fails.
     */
    getUserProfileByCode(code: string): Promise<GithubProfile>;
}
