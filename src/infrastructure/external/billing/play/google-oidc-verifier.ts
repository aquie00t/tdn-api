import {
    createPublicKey,
    createVerify,
    type JsonWebKeyInput,
    type KeyObject,
} from "node:crypto";
import axios from "axios";

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/** How long a fetched key set is reused before it is fetched again. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Tolerated clock difference between Google and this machine. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * One key from Google's published JWK set.
 *
 * Typed loosely on purpose: `createPublicKey` takes the JWK as it comes, and
 * narrowing it here would mean restating a format Google owns.
 */
interface GoogleJwk {
    kid?: string;
    alg?: string;
    kty?: string;
    n?: string;
    e?: string;
}

interface OidcClaims {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
}

/**
 * What the verifier was told to accept.
 */
export interface GoogleOidcConfig {
    /**
     * The audience configured on the Pub/Sub push subscription.
     *
     * Empty disables OIDC verification, which is what leaves a deployment with
     * no Pub/Sub subscription falling back to the shared secret.
     */
    audience: string;

    /**
     * The service account Pub/Sub signs as.
     *
     * Checked as well as the audience: an audience alone is a string anybody
     * with a Google account can mint a token for, and it is often a URL that
     * is not secret. The pair is what identifies the caller.
     */
    serviceAccountEmail: string;
}

/**
 * Verifies the identity token Google attaches to a Pub/Sub push.
 *
 * The alternative this replaces is a shared secret in the query string, which
 * ends up in this service's access logs and in those of anything in front of
 * it. A signed token in the `Authorization` header does not, and it proves the
 * caller is Google rather than somebody who read a log line.
 *
 * Written against Node's own crypto rather than a JWT library: the check is a
 * signature, three claims and an expiry, and Google publishes the keys as a
 * JWK set that `createPublicKey` reads directly.
 */
export class GoogleOidcVerifier {
    private keys: Map<string, GoogleJwk> = new Map();

    private fetchedAt = 0;

    /**
     * @param config - The audience and service account to accept
     */
    constructor(private readonly config: GoogleOidcConfig) {}

    /**
     * Whether this deployment is configured to verify tokens at all.
     *
     * @returns True when an audience and a service account are set
     */
    get isConfigured(): boolean {
        return (
            this.config.audience.length > 0 &&
            this.config.serviceAccountEmail.length > 0
        );
    }

    /**
     * Checks an `Authorization: Bearer <token>` header from a push request.
     *
     * @param authorization - The header value, if any
     * @returns True when the token is a valid Google identity token for the
     * configured audience and service account
     */
    async verify(authorization: string | undefined): Promise<boolean> {
        if (!this.isConfigured) return false;

        const token = authorization?.startsWith("Bearer ")
            ? authorization.slice("Bearer ".length).trim()
            : null;

        if (!token) return false;

        const parts = token.split(".");

        if (parts.length !== 3) return false;

        const [rawHeader, rawPayload, rawSignature] = parts as [
            string,
            string,
            string,
        ];

        try {
            const header = decodeSegment<{ alg?: string; kid?: string }>(
                rawHeader,
            );

            // RS256 only. Accepting whatever the token names is how a token
            // signed with "none", or with the public key as an HMAC secret,
            // gets through.
            if (header.alg !== "RS256" || !header.kid) return false;

            const jwk = await this.keyFor(header.kid);

            if (!jwk) return false;

            const verifier = createVerify("RSA-SHA256");
            verifier.update(`${rawHeader}.${rawPayload}`);
            verifier.end();

            const signatureValid = verifier.verify(
                publicKeyFrom(jwk),
                Buffer.from(rawSignature, "base64url"),
            );

            if (!signatureValid) return false;

            return this.claimsAccepted(decodeSegment<OidcClaims>(rawPayload));
        } catch {
            // A malformed token is a rejected token; there is nothing here
            // worth distinguishing for the caller.
            return false;
        }
    }

    /**
     * Checks everything about the token that is not its signature.
     *
     * @param claims - The decoded payload
     * @returns True when the claims name the caller we expect
     */
    private claimsAccepted(claims: OidcClaims): boolean {
        const now = Math.floor(Date.now() / 1000);

        if (!claims.iss || !ISSUERS.has(claims.iss)) return false;
        if (!claims.exp || claims.exp + CLOCK_SKEW_SECONDS < now) return false;
        if (claims.aud !== this.config.audience) return false;
        if (claims.email !== this.config.serviceAccountEmail) return false;

        return claims.email_verified === true;
    }

    /**
     * Finds the signing key, fetching Google's key set when it is stale.
     *
     * A key id that is not in a fresh set is refetched once: Google rotates
     * keys, and a rotation that happened inside the cache window would
     * otherwise reject every push until the hour was up.
     *
     * @param kid - The key id named in the token header
     * @returns The key, or null when Google does not publish it
     */
    private async keyFor(kid: string): Promise<GoogleJwk | null> {
        const stale = Date.now() - this.fetchedAt > CACHE_TTL_MS;

        if (stale || !this.keys.has(kid)) await this.refreshKeys();

        return this.keys.get(kid) ?? null;
    }

    /**
     * Reads Google's published signing keys.
     */
    private async refreshKeys(): Promise<void> {
        const response = await axios.get<{ keys?: GoogleJwk[] }>(CERTS_URL, {
            timeout: 5000,
        });

        const keys = response.data?.keys ?? [];

        this.keys = new Map(
            keys.filter((key) => key.kid).map((key) => [key.kid!, key]),
        );
        this.fetchedAt = Date.now();
    }
}

/**
 * Builds a verifying key from one of Google's JWKs.
 *
 * @param jwk - The published key
 * @returns The key object to verify with
 */
function publicKeyFrom(jwk: GoogleJwk): KeyObject {
    return createPublicKey({ key: jwk, format: "jwk" } as JsonWebKeyInput);
}

/**
 * Decodes one base64url segment of a JWT.
 *
 * @param segment - The segment
 * @returns Its parsed contents
 */
function decodeSegment<T>(segment: string): T {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}
