/**
 * How the session that comes out of an OAuth flow reaches the client.
 *
 * Decided by the flow rather than by whoever calls the exchange endpoint. The
 * exchange code is handed to whatever the callback redirected to, so the
 * redirect target is the only thing that knows whether a browser or an app is
 * on the other end - and a client that could simply ask for the body channel
 * would let page JavaScript trade a code it can see for a thirty-day refresh
 * token.
 */
export type OAuthDelivery = "cookie" | "body";

/**
 * Where a finished OAuth flow sends the browser, and on which channel the
 * session it produced should be delivered.
 */
export interface OAuthRedirectTarget {
    /** Absolute URL the exchange code is appended to. */
    successUrl: string;

    /** Absolute URL failures are reported to. */
    errorUrl: string;

    delivery: OAuthDelivery;
}

/**
 * The redirect targets a deployment accepts.
 */
export interface OAuthRedirectConfig {
    /** Origin the web app is served from. */
    frontendUrl: string;

    /** Extra browser targets, matched exactly. */
    webAllowList: string[];

    /** App targets - a custom scheme, matched exactly. */
    nativeAllowList: string[];
}

/**
 * Strips a trailing slash so two spellings of the same origin do not become
 * two different allow-list entries.
 *
 * @param url - The URL to normalise
 * @returns The URL without its trailing slashes
 */
function trimTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

/**
 * The target used when a caller asks for nothing in particular.
 *
 * Exactly what the flow did before it could be asked: success lands on the
 * web app's OAuth page, failure on its login page.
 *
 * @param config - The configured targets
 * @returns The default browser target
 */
export function defaultRedirectTarget(
    config: OAuthRedirectConfig,
): OAuthRedirectTarget {
    const origin = trimTrailingSlash(config.frontendUrl);

    return {
        successUrl: `${origin}/oauth-success`,
        errorUrl: `${origin}/login`,
        delivery: "cookie",
    };
}

/**
 * Resolves the target a caller asked to be returned to.
 *
 * Exact string matching against the configured lists, deliberately: no prefix
 * test, no host comparison, no "starts with our domain". Every one of those is
 * how an open redirect gets built, and here it would not just bounce a visitor
 * somewhere unpleasant - it would hand an OAuth exchange code, and with it a
 * whole session, to whoever owned the address.
 *
 * @param requested - The redirect the caller asked for, if any
 * @param config - The configured targets
 * @returns The resolved target, or null when the request named something that
 * is not allow-listed
 */
export function resolveRedirectTarget(
    requested: string | undefined,
    config: OAuthRedirectConfig,
): OAuthRedirectTarget | null {
    if (!requested) return defaultRedirectTarget(config);

    const candidate = trimTrailingSlash(requested);

    if (config.webAllowList.map(trimTrailingSlash).includes(candidate)) {
        return {
            successUrl: candidate,
            errorUrl: candidate,
            delivery: "cookie",
        };
    }

    if (config.nativeAllowList.map(trimTrailingSlash).includes(candidate)) {
        return {
            successUrl: candidate,
            errorUrl: candidate,
            delivery: "body",
        };
    }

    return null;
}
