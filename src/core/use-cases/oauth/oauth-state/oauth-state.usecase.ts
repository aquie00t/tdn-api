import { BadRequestError } from "@core/errors";
import type { CachePort } from "@core/ports/services/cache.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";
import {
    defaultRedirectTarget,
    resolveRedirectTarget,
    type OAuthRedirectConfig,
    type OAuthRedirectTarget,
} from "./oauth-redirect-target";

/** Which provider a flow is being started with. */
export type OAuthProvider = "github" | "google";

/**
 * How long a started flow may take to come back.
 *
 * Long enough for somebody to read a consent screen, find their password
 * manager and pass a second factor; short enough that an abandoned flow does
 * not leave a usable state value lying in the cache for the afternoon.
 */
const STATE_TTL_SECONDS = 600;

const STATE_KEY_PREFIX = "oauth:state:";

/**
 * Starts an OAuth flow and remembers what it was started for.
 *
 * Two things are recorded against a random `state` value: where the callback
 * should return to, and which channel the resulting session belongs on. Both
 * are decided here, when the flow begins, rather than read from the callback
 * or from whoever later calls the exchange endpoint - neither of which can be
 * trusted to describe the flow they are finishing.
 *
 * The state value also does what state is for. Without one, an attacker can
 * start a flow with their own account, hand the resulting callback URL to a
 * victim, and have the victim's browser quietly finish it - leaving them
 * signed in as the attacker, typing into an account somebody else can read.
 */
export class BeginOAuthUseCase {
    /**
     * Creates a new instance of BeginOAuthUseCase.
     *
     * @param githubAuthService - Builds the GitHub authorization URL
     * @param googleAuthService - Builds the Google authorization URL
     * @param cryptoService - Source of the random state value
     * @param cacheService - Where the state is held until the callback
     * @param oauthRedirectConfig - The targets this deployment accepts
     */
    constructor(
        private readonly githubAuthService: GithubAuthPort,
        private readonly googleAuthService: GoogleAuthPort,
        private readonly cryptoService: CryptoPort,
        private readonly cacheService: CachePort,
        private readonly oauthRedirectConfig: OAuthRedirectConfig,
    ) {}

    /**
     * Mints a state value and returns the provider URL to send the user to.
     *
     * @param provider - Which provider to start with
     * @param requestedRedirect - Where the caller wants to be returned to
     * @returns The authorization URL to redirect to
     *
     * @throws BadRequestError - When the requested redirect is not allow-listed
     */
    async execute(
        provider: OAuthProvider,
        requestedRedirect?: string,
    ): Promise<{ authorizationUrl: string }> {
        const target = resolveRedirectTarget(
            requestedRedirect,
            this.oauthRedirectConfig,
        );

        // Refused rather than quietly redirected somewhere safe: a caller
        // asking for an address we do not know is either misconfigured or
        // probing, and both are better answered plainly.
        if (!target) {
            throw new BadRequestError("Unknown OAuth redirect target.");
        }

        const state = this.cryptoService.generateRandomHex(32);

        await this.cacheService.set(
            `${STATE_KEY_PREFIX}${state}`,
            JSON.stringify(target),
            STATE_TTL_SECONDS,
        );

        const authorizationUrl =
            provider === "github"
                ? this.githubAuthService.getAuthorizationUrl(state)
                : this.googleAuthService.getAuthorizationUrl(state);

        return { authorizationUrl };
    }
}

/**
 * Reads back what a flow was started for, and spends the state doing it.
 */
export class ConsumeOAuthStateUseCase {
    /**
     * Creates a new instance of ConsumeOAuthStateUseCase.
     *
     * @param cacheService - Where the state was held
     * @param oauthRedirectConfig - The targets this deployment accepts
     */
    constructor(
        private readonly cacheService: CachePort,
        private readonly oauthRedirectConfig: OAuthRedirectConfig,
    ) {}

    /**
     * Resolves the target a callback belongs to.
     *
     * Single use: the value is deleted before it is trusted, so a callback URL
     * that is replayed - or handed to somebody else - finds nothing.
     *
     * A callback with no usable state is not treated as fatal. It is answered
     * on the default web target with an error, because the alternative is a
     * blank page: this runs in a browser being redirected back from a provider,
     * and by then there is nobody left to read a JSON problem document. What it
     * must not do is complete the sign-in, and it does not.
     *
     * @param state - The state value the provider handed back
     * @returns The target the flow was started for, or null when the state is
     * missing, expired or already spent
     */
    async execute(
        state: string | undefined,
    ): Promise<OAuthRedirectTarget | null> {
        if (!state) return null;

        const key = `${STATE_KEY_PREFIX}${state}`;
        const raw = await this.cacheService.get(key);

        if (!raw) return null;

        await this.cacheService.delete(key);

        try {
            return JSON.parse(raw) as OAuthRedirectTarget;
        } catch {
            return null;
        }
    }

    /**
     * The target a callback with no usable state has to be answered on.
     *
     * @returns The default browser target
     */
    fallbackTarget(): OAuthRedirectTarget {
        return defaultRedirectTarget(this.oauthRedirectConfig);
    }
}
