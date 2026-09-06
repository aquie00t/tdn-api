import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import axios from "axios";
import { GoogleOidcVerifier } from "@infrastructure/external/billing/play/google-oidc-verifier";

const AUDIENCE = "https://api.example/api/v1/billing/play/notifications";
const SERVICE_ACCOUNT = "play-push@tdn.iam.gserviceaccount.com";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
});

const KID = randomUUID();

/** Google's key set, as the verifier fetches it. */
const JWKS = {
    keys: [
        {
            ...(publicKey.export({ format: "jwk" }) as Record<string, string>),
            kid: KID,
            alg: "RS256",
            use: "sig",
        },
    ],
};

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Signs a token the way Google would, so the parts under test are the checks
 * rather than the signing.
 */
function sign(
    claims: Record<string, unknown>,
    header: Record<string, unknown> = { alg: "RS256", kid: KID },
): string {
    const body = `${base64url(header)}.${base64url(claims)}`;
    const signer = createSign("RSA-SHA256");

    signer.update(body);
    signer.end();

    return `${body}.${signer.sign(privateKey).toString("base64url")}`;
}

const validClaims = (): Record<string, unknown> => ({
    iss: "https://accounts.google.com",
    aud: AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 600,
    email: SERVICE_ACCOUNT,
    email_verified: true,
});

describe("GoogleOidcVerifier", () => {
    let verifier: GoogleOidcVerifier;

    beforeEach(() => {
        vi.spyOn(axios, "get").mockResolvedValue({ data: JWKS });

        verifier = new GoogleOidcVerifier({
            audience: AUDIENCE,
            serviceAccountEmail: SERVICE_ACCOUNT,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should accept a token Google signed for us", async () => {
        await expect(
            verifier.verify(`Bearer ${sign(validClaims())}`),
        ).resolves.toBe(true);
    });

    it("should refuse a token signed by somebody else", async () => {
        const impostor = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const body = `${base64url({ alg: "RS256", kid: KID })}.${base64url(validClaims())}`;
        const signer = createSign("RSA-SHA256");
        signer.update(body);
        signer.end();

        const forged = `${body}.${signer.sign(impostor.privateKey).toString("base64url")}`;

        await expect(verifier.verify(`Bearer ${forged}`)).resolves.toBe(false);
    });

    it("should refuse an unsigned token", async () => {
        // The classic: claim `alg: none` and hope the verifier believes the
        // header about how to check the header.
        const unsigned = `${base64url({ alg: "none", kid: KID })}.${base64url(validClaims())}.`;

        await expect(verifier.verify(`Bearer ${unsigned}`)).resolves.toBe(
            false,
        );
    });

    it("should refuse a token minted for another audience", async () => {
        // Anybody with a Google account can mint an identity token; the
        // audience is what says it was minted for us.
        await expect(
            verifier.verify(
                `Bearer ${sign({ ...validClaims(), aud: "https://evil.example" })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse a token from another service account", async () => {
        await expect(
            verifier.verify(
                `Bearer ${sign({ ...validClaims(), email: "someone@else.iam.gserviceaccount.com" })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse an expired token", async () => {
        await expect(
            verifier.verify(
                `Bearer ${sign({ ...validClaims(), exp: Math.floor(Date.now() / 1000) - 3600 })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse an issuer that is not Google", async () => {
        await expect(
            verifier.verify(
                `Bearer ${sign({ ...validClaims(), iss: "https://evil.example" })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse an unverified email claim", async () => {
        await expect(
            verifier.verify(
                `Bearer ${sign({ ...validClaims(), email_verified: false })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse a key id Google does not publish", async () => {
        await expect(
            verifier.verify(
                `Bearer ${sign(validClaims(), { alg: "RS256", kid: "unknown" })}`,
            ),
        ).resolves.toBe(false);
    });

    it("should refuse anything that is not a bearer token", async () => {
        for (const header of [undefined, "", "Basic abc", "Bearer", "Bearer x"]) {
            await expect(verifier.verify(header)).resolves.toBe(false);
        }
    });

    it("should verify nothing when it has not been configured", async () => {
        // An unconfigured verifier must not accept a token; the endpoint falls
        // back to the shared secret instead.
        const unconfigured = new GoogleOidcVerifier({
            audience: "",
            serviceAccountEmail: "",
        });

        await expect(
            unconfigured.verify(`Bearer ${sign(validClaims())}`),
        ).resolves.toBe(false);
    });

    it("should reuse the fetched key set", async () => {
        await verifier.verify(`Bearer ${sign(validClaims())}`);
        await verifier.verify(`Bearer ${sign(validClaims())}`);

        expect(axios.get).toHaveBeenCalledTimes(1);
    });
});
