import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { InterestKind } from "@core/domain/interfaces/user-interest.interface";
import type { DailyDigestEmail } from "@core/domain/interfaces/digest.interface";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import type { IDigestDeliveryRepository } from "@core/ports/repositories/digest-delivery.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { FeedRankingWeights } from "@core/use-cases/post/get-posts/feed-ranking";
import { SendDailyDigestUseCase } from "@core/use-cases/digest/send-daily-digest";
import type { SendDailyDigestConfig } from "@core/use-cases/digest/send-daily-digest";
import { buildNotification, buildPost } from "../../../helpers/mock-factories";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WEIGHTS: FeedRankingWeights = {
    language: 3,
    social: 2,
    affinity: 2.5,
    engagement: 0.6,
    halfLifeHours: 18,
};

const CONFIG: SendDailyDigestConfig = {
    windowHours: 24,
    maxWindowDays: 7,
    userPageSize: 200,
    maxNotifications: 8,
    maxPosts: 5,
    candidatePoolSize: 300,
    frontendUrl: "https://tdn.example",
    apiUrl: "https://api.tdn.example",
    unsubscribeSecret: "a-signing-secret",
    timezone: "Europe/Istanbul",
};

/**
 * Builds a candidate the ranker can score.
 */
function buildCandidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
    return {
        id: "post-1",
        authorId: "author-1",
        lang: "tr",
        createdAt: new Date(),
        likeCount: 0,
        commentCount: 0,
        quoteCount: 0,
        tags: [],
        categories: [],
        ...overrides,
    };
}

describe("SendDailyDigestUseCase", () => {
    let useCase: SendDailyDigestUseCase;
    let userRepository: Pick<IUserRepository, "findDigestRecipients">;
    let notificationRepository: Pick<
        INotificationRepository,
        "findUnreadSince"
    >;
    let userInterestRepository: Pick<IUserInterestRepository, "findByUserId">;
    let postRepository: Pick<
        IPostRepository,
        "findFeedCandidates" | "findByIds"
    >;
    let digestDeliveryRepository: IDigestDeliveryRepository;
    let emailService: Pick<EmailPort, "sendDailyDigests">;
    let logger: Pick<LoggerPort, "error">;

    /** The digests handed to the transport on the first call. */
    function sentDigests(): DailyDigestEmail[] {
        return vi.mocked(emailService.sendDailyDigests).mock.calls[0][0];
    }

    beforeEach(() => {
        userRepository = {
            findDigestRecipients: vi.fn().mockResolvedValue({
                recipients: [
                    {
                        id: USER_ID,
                        email: "ada@example.com",
                        languages: ["tr"],
                    },
                ],
                nextCursor: null,
            }),
        };
        notificationRepository = {
            findUnreadSince: vi.fn().mockResolvedValue([]),
        };
        userInterestRepository = {
            findByUserId: vi.fn().mockResolvedValue([]),
        };
        postRepository = {
            findFeedCandidates: vi.fn().mockResolvedValue([]),
            findByIds: vi.fn().mockResolvedValue([]),
        };
        digestDeliveryRepository = {
            claim: vi.fn().mockResolvedValue(true),
            findLastSentAt: vi.fn().mockResolvedValue(null),
        };
        emailService = {
            sendDailyDigests: vi
                .fn()
                .mockResolvedValue({ sent: 1, failed: [] }),
        };
        logger = { error: vi.fn() };

        useCase = new SendDailyDigestUseCase(
            userRepository as IUserRepository,
            notificationRepository as INotificationRepository,
            userInterestRepository as IUserInterestRepository,
            postRepository as IPostRepository,
            digestDeliveryRepository,
            emailService as EmailPort,
            WEIGHTS,
            CONFIG,
            logger as LoggerPort,
        );
    });

    describe("who gets an email", () => {
        it("should send nothing to a user with an empty digest", async () => {
            const result = await useCase.execute();

            expect(result).toEqual({
                scanned: 1,
                sent: 0,
                skipped: 1,
                failed: 0,
            });
            expect(emailService.sendDailyDigests).not.toHaveBeenCalled();
        });

        it("should not claim a user it decided to skip", async () => {
            // Claiming an empty digest would burn the slot and cost them
            // tomorrow's window.
            await useCase.execute();

            expect(digestDeliveryRepository.claim).not.toHaveBeenCalled();
        });

        it("should send when only notifications are waiting", async () => {
            vi.mocked(notificationRepository.findUnreadSince).mockResolvedValue(
                [
                    buildNotification({
                        type: NotificationType.MENTION,
                        username: "zoe",
                        postId: "post-9",
                    }),
                ],
            );

            const result = await useCase.execute();

            expect(result.sent).toBe(1);
            expect(sentDigests()[0].notifications).toHaveLength(1);
        });

        it("should send when only posts are waiting", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate(),
            ]);
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "post-1", content: "Hello world" }),
            ]);

            const result = await useCase.execute();

            expect(result.sent).toBe(1);
            expect(sentDigests()[0].posts).toHaveLength(1);
        });

        it("should skip a user another instance already claimed", async () => {
            vi.mocked(digestDeliveryRepository.claim).mockResolvedValue(false);
            vi.mocked(notificationRepository.findUnreadSince).mockResolvedValue(
                [buildNotification()],
            );

            const result = await useCase.execute();

            expect(result.skipped).toBe(1);
            expect(emailService.sendDailyDigests).not.toHaveBeenCalled();
        });

        it("should keep going when one user cannot be assembled", async () => {
            vi.mocked(userRepository.findDigestRecipients).mockResolvedValue({
                recipients: [
                    { id: "bad", email: "bad@example.com", languages: [] },
                    { id: USER_ID, email: "ada@example.com", languages: [] },
                ],
                nextCursor: null,
            });
            vi.mocked(notificationRepository.findUnreadSince)
                .mockRejectedValueOnce(new Error("database is upset"))
                .mockResolvedValue([buildNotification()]);

            const result = await useCase.execute();

            expect(result.failed).toBe(1);
            expect(result.sent).toBe(1);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe("the window", () => {
        it("should resume from the last delivery", async () => {
            const lastSentAt = new Date("2026-09-04T09:00:00.000Z");
            vi.mocked(
                digestDeliveryRepository.findLastSentAt,
            ).mockResolvedValue(lastSentAt);

            await useCase.execute();

            const [, since] = vi.mocked(notificationRepository.findUnreadSince)
                .mock.calls[0];
            expect(since).toStrictEqual(lastSentAt);
        });

        it("should not reach further back than the ceiling", async () => {
            // Somebody returning after months must not be mailed months of
            // notifications in one page.
            vi.mocked(
                digestDeliveryRepository.findLastSentAt,
            ).mockResolvedValue(new Date("2020-01-01T00:00:00.000Z"));

            await useCase.execute();

            const [, since] = vi.mocked(notificationRepository.findUnreadSince)
                .mock.calls[0];
            const ceiling = Date.now() - CONFIG.maxWindowDays * 86_400_000;
            expect(since.getTime()).toBeGreaterThanOrEqual(ceiling - 5_000);
        });
    });

    describe("what the email carries", () => {
        beforeEach(() => {
            vi.mocked(notificationRepository.findUnreadSince).mockResolvedValue(
                [buildNotification({ postId: "post-9" })],
            );
        });

        it("should write in the recipient's language", async () => {
            vi.mocked(userRepository.findDigestRecipients).mockResolvedValue({
                recipients: [
                    {
                        id: USER_ID,
                        email: "ada@example.com",
                        languages: ["en"],
                    },
                ],
                nextCursor: null,
            });

            await useCase.execute();

            expect(sentDigests()[0].language).toBe("en");
        });

        it("should fall back to the platform language when none is set", async () => {
            vi.mocked(userRepository.findDigestRecipients).mockResolvedValue({
                recipients: [
                    { id: USER_ID, email: "ada@example.com", languages: [] },
                ],
                nextCursor: null,
            });

            await useCase.execute();

            expect(sentDigests()[0].language).toBe("tr");
        });

        it("should carry a signed unsubscribe link pointing at the API", async () => {
            await useCase.execute();

            const { unsubscribeUrl } = sentDigests()[0];
            expect(unsubscribeUrl).toContain(
                "https://api.tdn.example/api/v1/emails/unsubscribe",
            );
            expect(unsubscribeUrl).toContain(`u=${USER_ID}`);
            expect(unsubscribeUrl).toMatch(/t=[a-f0-9]{64}/);
        });

        it("should link notifications at the web app", async () => {
            await useCase.execute();

            expect(sentDigests()[0].notifications[0].url).toBe(
                "https://tdn.example/posts/post-9",
            );
        });
    });

    describe("ranking", () => {
        it("should still choose posts for a user with no interest profile", async () => {
            // Cold start degrades into freshness and engagement rather than
            // into an empty section.
            vi.mocked(userInterestRepository.findByUserId).mockResolvedValue(
                [],
            );
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "post-1" }),
            ]);
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "post-1" }),
            ]);

            await useCase.execute();

            expect(sentDigests()[0].posts).toHaveLength(1);
        });

        it("should prefer a post matching the reader's interests", async () => {
            vi.mocked(userInterestRepository.findByUserId).mockResolvedValue([
                { kind: InterestKind.TAG, key: "typescript", weight: 1 },
            ]);
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "unrelated", tags: ["gardening"] }),
                buildCandidate({ id: "wanted", tags: ["typescript"] }),
            ]);
            vi.mocked(postRepository.findByIds).mockImplementation(
                async (ids: string[]) =>
                    ids.map((id) => buildPost({ id, content: id })),
            );

            await useCase.execute();

            const chosen = sentDigests()[0].posts;
            expect(chosen[0].url).toContain("wanted");
        });

        it("should honour the per-section cap", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue(
                Array.from({ length: 20 }, (_, index) =>
                    buildCandidate({ id: `post-${index}` }),
                ),
            );
            vi.mocked(postRepository.findByIds).mockImplementation(
                async (ids: string[]) => ids.map((id) => buildPost({ id })),
            );

            await useCase.execute();

            expect(sentDigests()[0].posts).toHaveLength(CONFIG.maxPosts);
        });
    });

    describe("delivery accounting", () => {
        it("should count what the provider refused as failures", async () => {
            vi.mocked(notificationRepository.findUnreadSince).mockResolvedValue(
                [buildNotification()],
            );
            vi.mocked(emailService.sendDailyDigests).mockResolvedValue({
                sent: 0,
                failed: [{ to: "ada@example.com", reason: "bounced" }],
            });

            const result = await useCase.execute();

            expect(result.sent).toBe(0);
            expect(result.failed).toBe(1);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe("the candidate pool", () => {
        it("should be fetched once for the whole run", async () => {
            vi.mocked(userRepository.findDigestRecipients)
                .mockResolvedValueOnce({
                    recipients: [
                        { id: "a", email: "a@example.com", languages: [] },
                        { id: "b", email: "b@example.com", languages: [] },
                    ],
                    nextCursor: "b",
                })
                .mockResolvedValueOnce({
                    recipients: [
                        { id: "c", email: "c@example.com", languages: [] },
                    ],
                    nextCursor: null,
                });

            await useCase.execute();

            expect(postRepository.findFeedCandidates).toHaveBeenCalledOnce();
            expect(userRepository.findDigestRecipients).toHaveBeenCalledTimes(
                2,
            );
        });
    });
});
