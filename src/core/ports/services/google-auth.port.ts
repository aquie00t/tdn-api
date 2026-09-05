/**
 * Represents a user profile retrieved from Google OAuth.
 */
export interface GoogleProfile {
    /** The unique account identifier provided by Google. */
    providerAccountId: string;

    /** The primary email address associated with the Google account. */
    email: string;

    /** The derived username based on the user's Google email address. */
    username: string;
}

/**
 * Port interface for Google OAuth authentication operations.
 */
export interface GoogleAuthPort {
    /**
     * Generates the Google OAuth authorization URL to redirect the user to.
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
     * @param code - The authorization code received from Google after user consent.
     * @returns A promise that resolves to the authenticated user's Google profile.
     * @throws {OAuthProviderError} If the token exchange or profile fetch fails.
     */
    getUserProfileByCode(code: string): Promise<GoogleProfile>;
}
