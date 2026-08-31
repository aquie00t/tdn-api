import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    RebuildUserInterestsUseCase,
    type InterestScoringWeights,
} from "@core/use-cases/user-interest/rebuild-user-interests";
import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import {
    InteractionType,
    InterestKind,
} from "@core/domain/interfaces/user-interest.interface";

const WEIGHTS: InterestScoringWeights = {
    halfLifeDays: 10,
    maxInterests: 40,
    minWeight: 0.05,
};

const WINDOW_DAYS = 30;
const SIGNAL_LIMIT = 500;

describe("RebuildUserInterestsUseCase", () => {
    let useCase: RebuildUserInterestsUseCase;
    let userInterestRepository: Pick<
        IUserInterestRepository,
        "findActiveUserIds" | "findInteractionSignals" | "replaceForUser"
    >;
    let logger: Pick<LoggerPort, "error">;

    /** Makes the repository hand back one page of users and then stop. */
    const activeUsers = (...userIds: string[]): void => {
        vi.mocked(userInterestRepository.findActiveUserIds).mockResolvedValue({
            userIds,
            nextCursor: null,
        });
    };

    beforeEach(() => {
        userInterestRepository = {
            findActiveUserIds: vi
                .fn()
                .mockResolvedValue({ userIds: [], nextCursor: null }),
            findInteractionSignals: vi.fn().mockResolvedValue([]),
            replaceForUser: vi.fn().mockResolvedValue(undefined),
        };
        logger = { error: vi.fn() };

        useCase = new RebuildUserInterestsUseCase(
            userInterestRepository as IUserInterestRepository,
            WEIGHTS,
            WINDOW_DAYS,
            SIGNAL_LIMIT,
            logger as LoggerPort,
        );
    });

    it("should rebuild every active user's profile", async () => {
        activeUsers("user-1", "user-2", "user-3");

        const result = await useCase.execute();

        expect(result).toEqual({ rebuilt: 3, failed: 0 });
        expect(userInterestRepository.replaceForUser).toHaveBeenCalledTimes(3);
    });

    it("should store what the scorer made of a user's interactions", async () => {
        activeUsers("user-1");
        vi.mocked(
            userInterestRepository.findInteractionSignals,
        ).mockResolvedValue([
            {
                type: InteractionType.AUTHORED,
                tags: ["rust"],
                categories: ["BACKEND"],
                occurredAt: new Date(),
            },
        ]);

        await useCase.execute();

        const [userId, interests] = vi.mocked(
            userInterestRepository.replaceForUser,
        ).mock.calls[0];
        expect(userId).toBe("user-1");
        expect(interests).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: InterestKind.TAG,
                    key: "rust",
                }),
                expect.objectContaining({
                    kind: InterestKind.CATEGORY,
                    key: "backend",
                }),
            ]),
        );
    });

    it("should read interactions from the configured window and cap", async () => {
        activeUsers("user-1");
        const before = Date.now();

        await useCase.execute();

        const [, since, limit] = vi.mocked(
            userInterestRepository.findInteractionSignals,
        ).mock.calls[0];
        expect(limit).toBe(SIGNAL_LIMIT);
        const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
        expect(since.getTime()).toBeGreaterThanOrEqual(
            before - windowMs - 1000,
        );
        expect(since.getTime()).toBeLessThanOrEqual(
            Date.now() - windowMs + 1000,
        );
    });

    it("should clear a profile whose interests have all decayed away", async () => {
        // Writing the empty result is the point: a user who moved on should
        // stop being ranked on what they cared about a season ago, and that
        // only happens if the stale rows actually go.
        activeUsers("user-1");
        vi.mocked(
            userInterestRepository.findInteractionSignals,
        ).mockResolvedValue([]);

        await useCase.execute();

        expect(userInterestRepository.replaceForUser).toHaveBeenCalledWith(
            "user-1",
            [],
        );
    });

    describe("paging through users", () => {
        it("should follow the cursor to the end", async () => {
            vi.mocked(userInterestRepository.findActiveUserIds)
                .mockResolvedValueOnce({
                    userIds: ["user-1", "user-2"],
                    nextCursor: "user-2",
                })
                .mockResolvedValueOnce({
                    userIds: ["user-3"],
                    nextCursor: null,
                });

            const result = await useCase.execute();

            expect(result.rebuilt).toBe(3);
            expect(
                vi.mocked(userInterestRepository.findActiveUserIds).mock
                    .calls[1][2],
            ).toBe("user-2");
        });

        it("should do nothing when nobody has been active", async () => {
            const result = await useCase.execute();

            expect(result).toEqual({ rebuilt: 0, failed: 0 });
            expect(
                userInterestRepository.replaceForUser,
            ).not.toHaveBeenCalled();
        });
    });

    describe("when one user fails", () => {
        it("should carry on with the rest of the run", async () => {
            // One unreadable profile must not stop the other thousands from
            // being refreshed; the stale rows it leaves still rank a feed.
            activeUsers("user-1", "user-2", "user-3");
            vi.mocked(
                userInterestRepository.findInteractionSignals,
            ).mockRejectedValueOnce(new Error("connection reset"));

            const result = await useCase.execute();

            expect(result).toEqual({ rebuilt: 2, failed: 1 });
        });

        it("should log which user it was", async () => {
            activeUsers("user-1");
            vi.mocked(userInterestRepository.replaceForUser).mockRejectedValue(
                new Error("deadlock detected"),
            );

            await useCase.execute();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ userId: "user-1" }),
                expect.any(String),
            );
        });
    });

    describe("rebuilding a single user", () => {
        it("should skip the active-user scan entirely", async () => {
            const result = await useCase.execute({ userId: "user-9" });

            expect(result).toEqual({ rebuilt: 1, failed: 0 });
            expect(
                userInterestRepository.findActiveUserIds,
            ).not.toHaveBeenCalled();
            expect(userInterestRepository.replaceForUser).toHaveBeenCalledWith(
                "user-9",
                [],
            );
        });

        it("should report a failure rather than throwing", async () => {
            vi.mocked(
                userInterestRepository.findInteractionSignals,
            ).mockRejectedValue(new Error("nope"));

            await expect(
                useCase.execute({ userId: "user-9" }),
            ).resolves.toEqual({ rebuilt: 0, failed: 1 });
        });
    });
});
