import { describe, expect, it } from "vitest";
import { PasswordService } from "@infrastructure/security/password.service";

// argon2 is deliberately CPU-hard, so a single hash can take seconds on a
// loaded machine. Several of these cases hash twice and exceed the suite's 5s
// default, which made them fail whenever the runner was busy - reproducible by
// running two suites concurrently. The cost is the point of the algorithm, so
// the timeout moves rather than the work.
describe("PasswordService", { timeout: 30_000 }, () => {
    const svc = new PasswordService();

    describe("hash", () => {
        it("should return a non-empty string", async () => {
            const hash = await svc.hash("mypassword");

            expect(typeof hash).toBe("string");
            expect(hash.length).toBeGreaterThan(0);
        });

        it("should produce different hashes for the same input (salt)", async () => {
            const hash1 = await svc.hash("mypassword");
            const hash2 = await svc.hash("mypassword");

            expect(hash1).not.toBe(hash2);
        });
    });

    describe("verify", () => {
        it("should return true when plain password matches hash", async () => {
            const hash = await svc.hash("correctpassword");

            await expect(svc.verify("correctpassword", hash)).resolves.toBe(
                true,
            );
        });

        it("should return false when plain password does not match hash", async () => {
            const hash = await svc.hash("correctpassword");

            await expect(svc.verify("wrongpassword", hash)).resolves.toBe(
                false,
            );
        });
    });
});
