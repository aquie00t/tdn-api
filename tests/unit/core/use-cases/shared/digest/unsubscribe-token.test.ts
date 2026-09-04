import { describe, expect, it } from "vitest";
import {
    signUnsubscribeToken,
    verifyUnsubscribeToken,
} from "@core/use-cases/shared/digest/unsubscribe-token";

const SECRET = "a-signing-secret";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("unsubscribe token", () => {
    it("should accept a token it just issued", () => {
        const token = signUnsubscribeToken(USER, SECRET);

        expect(verifyUnsubscribeToken(USER, token, SECRET)).toBe(true);
    });

    it("should be stable, so a link keeps working", () => {
        // No expiry by design: a digest is read whenever the inbox is.
        expect(signUnsubscribeToken(USER, SECRET)).toBe(
            signUnsubscribeToken(USER, SECRET),
        );
    });

    it("should reject another user's token", () => {
        const token = signUnsubscribeToken(OTHER, SECRET);

        expect(verifyUnsubscribeToken(USER, token, SECRET)).toBe(false);
    });

    it("should reject a token signed with a different secret", () => {
        const token = signUnsubscribeToken(USER, "some-other-secret");

        expect(verifyUnsubscribeToken(USER, token, SECRET)).toBe(false);
    });

    it("should reject a tampered token without throwing", () => {
        const token = signUnsubscribeToken(USER, SECRET);
        const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

        expect(verifyUnsubscribeToken(USER, tampered, SECRET)).toBe(false);
    });

    it("should reject a token of the wrong length without throwing", () => {
        // timingSafeEqual throws on a length mismatch; the helper has to
        // answer false rather than crash the request.
        expect(verifyUnsubscribeToken(USER, "short", SECRET)).toBe(false);
        expect(verifyUnsubscribeToken(USER, "", SECRET)).toBe(false);
    });

    it("should give different users different tokens", () => {
        expect(signUnsubscribeToken(USER, SECRET)).not.toBe(
            signUnsubscribeToken(OTHER, SECRET),
        );
    });
});
