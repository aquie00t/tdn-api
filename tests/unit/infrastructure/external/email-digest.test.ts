import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { DailyDigestEmail } from "@core/domain/interfaces/digest.interface";
import { escapeHtml } from "@infrastructure/external/email/escape-html";
import { EmailService } from "@infrastructure/external/email.service";

const batchSend = vi.fn();

vi.mock("resend", () => ({
    Resend: class {
        batch = { send: batchSend };
        emails = { send: vi.fn() };
    },
}));

/**
 * Builds a digest with one item in each section.
 */
function buildDigest(
    overrides: Partial<DailyDigestEmail> = {},
): DailyDigestEmail {
    return {
        to: "ada@example.com",
        language: "tr",
        unsubscribeUrl:
            "https://api.tdn.example/api/v1/emails/unsubscribe?u=1&t=2",
        notifications: [
            {
                type: NotificationType.MENTION,
                issuerUsername: "zoe",
                url: "https://tdn.example/posts/post-1",
                createdAt: new Date("2026-09-05T08:00:00.000Z"),
            },
        ],
        posts: [
            {
                authorUsername: "kaan",
                excerpt: "A post about TypeScript",
                url: "https://tdn.example/posts/post-2",
            },
        ],
        ...overrides,
    };
}

describe("escapeHtml", () => {
    it("should neutralise markup", () => {
        expect(escapeHtml("<script>alert(1)</script>")).toBe(
            "&lt;script&gt;alert(1)&lt;/script&gt;",
        );
    });

    it("should escape ampersands and quotes", () => {
        expect(escapeHtml(`a & b "c" 'd'`)).toBe(
            "a &amp; b &quot;c&quot; &#39;d&#39;",
        );
    });

    it("should leave ordinary text alone", () => {
        expect(escapeHtml("merhaba dünya")).toBe("merhaba dünya");
    });
});

describe("EmailService.sendDailyDigests", () => {
    let service: EmailService;
    const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    };

    /** The batch payload handed to the provider on the nth call. */
    function payload(call = 0): Record<string, unknown>[] {
        return batchSend.mock.calls[call][0] as Record<string, unknown>[];
    }

    beforeEach(() => {
        batchSend.mockReset().mockResolvedValue({ data: { data: [] } });
        logger.info.mockReset();
        logger.error.mockReset();

        service = new EmailService(
            {
                from: "tdn <no-reply@tdn.example>",
                apiKey: "key",
                digestBatchSize: 100,
                // No pause: a test must not wait on a rate limiter.
                digestBatchPauseMs: 0,
            },
            logger as never,
        );
    });

    it("should do nothing at all for an empty run", async () => {
        const result = await service.sendDailyDigests([]);

        expect(result).toEqual({ sent: 0, failed: [] });
        expect(batchSend).not.toHaveBeenCalled();
    });

    it("should count every accepted email", async () => {
        const result = await service.sendDailyDigests([
            buildDigest(),
            buildDigest({ to: "zoe@example.com" }),
        ]);

        expect(result.sent).toBe(2);
        expect(result.failed).toEqual([]);
        expect(batchSend).toHaveBeenCalledOnce();
    });

    it("should split a run into batches the provider accepts", async () => {
        const digests = Array.from({ length: 250 }, (_, index) =>
            buildDigest({ to: `user${index}@example.com` }),
        );

        const result = await service.sendDailyDigests(digests);

        expect(batchSend).toHaveBeenCalledTimes(3);
        expect(payload(0)).toHaveLength(100);
        expect(payload(2)).toHaveLength(50);
        expect(result.sent).toBe(250);
    });

    it("should give each batch its own idempotency key", async () => {
        const digests = Array.from({ length: 150 }, (_, index) =>
            buildDigest({ to: `user${index}@example.com` }),
        );

        await service.sendDailyDigests(digests);

        const first = batchSend.mock.calls[0][1] as { idempotencyKey: string };
        const second = batchSend.mock.calls[1][1] as { idempotencyKey: string };

        expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
        expect(first.idempotencyKey).toContain("daily-digest:");
    });

    it("should ask for permissive validation, so one bad address does not sink the batch", async () => {
        await service.sendDailyDigests([buildDigest()]);

        expect(batchSend.mock.calls[0][1]).toMatchObject({
            batchValidation: "permissive",
        });
    });

    it("should report the recipients the provider refused", async () => {
        batchSend.mockResolvedValue({
            data: {
                data: [],
                errors: [{ index: 1, message: "invalid recipient" }],
            },
        });

        const result = await service.sendDailyDigests([
            buildDigest(),
            buildDigest({ to: "broken@example.com" }),
            buildDigest({ to: "zoe@example.com" }),
        ]);

        expect(result.sent).toBe(2);
        expect(result.failed).toEqual([
            { to: "broken@example.com", reason: "invalid recipient" },
        ]);
    });

    it("should report every recipient when the whole request fails", async () => {
        batchSend.mockResolvedValue({
            data: null,
            error: { message: "rate limited" },
        });

        const result = await service.sendDailyDigests([
            buildDigest(),
            buildDigest({ to: "zoe@example.com" }),
        ]);

        expect(result.sent).toBe(0);
        expect(result.failed).toHaveLength(2);
        expect(logger.error).toHaveBeenCalled();
    });

    it("should report every recipient when the client throws", async () => {
        batchSend.mockRejectedValue(new Error("socket hang up"));

        const result = await service.sendDailyDigests([buildDigest()]);

        expect(result.sent).toBe(0);
        expect(result.failed).toEqual([
            { to: "ada@example.com", reason: "Unexpected error" },
        ]);
    });

    describe("the rendered email", () => {
        it("should carry the one-click unsubscribe headers", async () => {
            await service.sendDailyDigests([buildDigest()]);

            expect(payload()[0].headers).toEqual({
                "List-Unsubscribe":
                    "<https://api.tdn.example/api/v1/emails/unsubscribe?u=1&t=2>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            });
        });

        it("should write the subject and the document language in Turkish", async () => {
            await service.sendDailyDigests([buildDigest({ language: "tr" })]);

            const email = payload()[0];
            expect(email.subject).toBe("Bugün neleri kaçırdın");
            expect(email.html).toContain('<html lang="tr">');
            expect(email.html).toContain("senden bahsetti.");
        });

        it("should write the subject and the document language in English", async () => {
            await service.sendDailyDigests([buildDigest({ language: "en" })]);

            const email = payload()[0];
            expect(email.subject).toBe("What you missed today");
            expect(email.html).toContain('<html lang="en">');
            expect(email.html).toContain("mentioned you.");
        });

        it("should render both sections with their links", async () => {
            await service.sendDailyDigests([buildDigest()]);

            const html = payload()[0].html as string;
            expect(html).toContain("Kaçırdığın bildirimler");
            expect(html).toContain("İlgi alanlarından");
            expect(html).toContain("https://tdn.example/posts/post-1");
            expect(html).toContain("https://tdn.example/posts/post-2");
        });

        it("should omit a section that has nothing in it", async () => {
            await service.sendDailyDigests([buildDigest({ posts: [] })]);

            const html = payload()[0].html as string;
            expect(html).toContain("Kaçırdığın bildirimler");
            expect(html).not.toContain("İlgi alanlarından");
        });

        it("should escape everything a user wrote", async () => {
            await service.sendDailyDigests([
                buildDigest({
                    posts: [
                        {
                            authorUsername: "kaan",
                            excerpt: "<img src=x onerror=alert(1)>",
                            url: "https://tdn.example/posts/post-2",
                        },
                    ],
                }),
            ]);

            const html = payload()[0].html as string;
            expect(html).not.toContain("<img src=x");
            expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        });

        it("should still carry the structural styles inline", async () => {
            // Several clients strip <style>; a digest reduced to a run of bare
            // links would be unreadable.
            await service.sendDailyDigests([buildDigest()]);

            const html = payload()[0].html as string;
            expect(html).toContain('style="margin:0 0 14px 0;');
        });
    });
});
