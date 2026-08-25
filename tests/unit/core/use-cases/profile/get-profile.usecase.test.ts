import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetProfileUseCase } from "@core/use-cases/profile/get-profile";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import { NotFoundError } from "@core/errors";
import { buildProfile } from "../../../helpers/mock-factories";

describe("GetProfileUseCase", () => {
    let useCase: GetProfileUseCase;
    let profileRepository: Pick<IProfileRepository, "findByUsername">;
    let followRepository: Pick<IFollowRepository, "checkIsFollowing">;
    let postRepository: Pick<IPostRepository, "countByUserId">;
    let articleRepository: Pick<
        IArticleRepository,
        "countPublishedByAuthorId"
    >;

    beforeEach(() => {
        profileRepository = {
            findByUsername: vi.fn(),
        };
        followRepository = {
            checkIsFollowing: vi.fn().mockResolvedValue(false),
        };
        postRepository = {
            countByUserId: vi.fn().mockResolvedValue(0),
        };
        articleRepository = {
            countPublishedByAuthorId: vi.fn().mockResolvedValue(0),
        };
        useCase = new GetProfileUseCase(
            profileRepository as IProfileRepository,
            followRepository as IFollowRepository,
            postRepository as IPostRepository,
            articleRepository as IArticleRepository,
        );
    });

    it("should throw NotFoundError when profile is not found", async () => {
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(null);

        await expect(useCase.execute("nonexistent")).rejects.toThrow(
            NotFoundError,
        );
    });

    it("should set isMe to true when currentUserId matches profile.userId", async () => {
        const profile = buildProfile({ userId: "user-1" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);
        vi.mocked(postRepository.countByUserId).mockResolvedValue(5);

        const result = await useCase.execute("testuser", "user-1");

        expect(result.isMe).toBe(true);
    });

    it("should set isMe to false when currentUserId does not match profile.userId", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        const result = await useCase.execute("testuser", "user-1");

        expect(result.isMe).toBe(false);
    });

    it("should set isMe to false when currentUserId is not provided", async () => {
        const profile = buildProfile({ userId: "user-1" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        const result = await useCase.execute("testuser");

        expect(result.isMe).toBe(false);
    });

    it("should not call checkIsFollowing when isMe is true", async () => {
        const profile = buildProfile({ userId: "user-1" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        await useCase.execute("testuser", "user-1");

        expect(followRepository.checkIsFollowing).not.toHaveBeenCalled();
    });

    it("should not call checkIsFollowing when currentUserId is not provided", async () => {
        const profile = buildProfile({ userId: "user-1" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        await useCase.execute("testuser");

        expect(followRepository.checkIsFollowing).not.toHaveBeenCalled();
    });

    it("should call checkIsFollowing with currentUserId and profile.userId when viewing another user", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);
        vi.mocked(followRepository.checkIsFollowing).mockResolvedValue(true);

        await useCase.execute("testuser", "user-1");

        expect(followRepository.checkIsFollowing).toHaveBeenCalledOnce();
        expect(followRepository.checkIsFollowing).toHaveBeenCalledWith(
            "user-1",
            "user-2",
        );
    });

    it("should return isFollowing from checkIsFollowing result", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);
        vi.mocked(followRepository.checkIsFollowing).mockResolvedValue(true);

        const result = await useCase.execute("testuser", "user-1");

        expect(result.isFollowing).toBe(true);
    });

    it("should set isFollowing to false when not following", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);
        vi.mocked(followRepository.checkIsFollowing).mockResolvedValue(false);

        const result = await useCase.execute("testuser", "user-1");

        expect(result.isFollowing).toBe(false);
    });

    it("should call countByUserId and return the post count", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);
        vi.mocked(postRepository.countByUserId).mockResolvedValue(12);

        const result = await useCase.execute("testuser", "user-1");

        expect(postRepository.countByUserId).toHaveBeenCalledWith("user-2");
        expect(result.postCount).toBe(12);
    });

    it("should run checkIsFollowing and countByUserId in parallel", async () => {
        const profile = buildProfile({ userId: "user-2" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        const order: string[] = [];
        vi.mocked(followRepository.checkIsFollowing).mockImplementation(
            async () => {
                order.push("follow");
                return false;
            },
        );
        vi.mocked(postRepository.countByUserId).mockImplementation(async () => {
            order.push("count");
            return 0;
        });

        await useCase.execute("testuser", "user-1");

        expect(order).toContain("follow");
        expect(order).toContain("count");
    });

    it("should return the profile entity in the output", async () => {
        const profile = buildProfile({ userId: "user-1" });
        vi.mocked(profileRepository.findByUsername).mockResolvedValue(profile);

        const result = await useCase.execute("testuser", "user-1");

        expect(result.profile).toBe(profile);
    });

    describe("articleCount", () => {
        it("should return the published article count for the profile owner", async () => {
            const profile = buildProfile({ userId: "user-1" });
            vi.mocked(profileRepository.findByUsername).mockResolvedValue(
                profile,
            );
            vi.mocked(
                articleRepository.countPublishedByAuthorId,
            ).mockResolvedValue(7);

            const result = await useCase.execute("testuser");

            expect(result.articleCount).toBe(7);
            expect(
                articleRepository.countPublishedByAuthorId,
            ).toHaveBeenCalledWith("user-1");
        });

        it("should report the same count to the owner and to a guest", async () => {
            const profile = buildProfile({ userId: "user-1" });
            vi.mocked(profileRepository.findByUsername).mockResolvedValue(
                profile,
            );
            vi.mocked(
                articleRepository.countPublishedByAuthorId,
            ).mockResolvedValue(3);

            const asOwner = await useCase.execute("testuser", "user-1");
            const asGuest = await useCase.execute("testuser");
            const asStranger = await useCase.execute("testuser", "user-2");

            // Published-only, so it cannot vary by viewer. A count that grew
            // for the owner would leak how much unpublished work exists.
            expect(asOwner.isMe).toBe(true);
            expect(asOwner.articleCount).toBe(3);
            expect(asGuest.articleCount).toBe(3);
            expect(asStranger.articleCount).toBe(3);
        });

        it("should count articles alongside posts, not instead of them", async () => {
            const profile = buildProfile({ userId: "user-1" });
            vi.mocked(profileRepository.findByUsername).mockResolvedValue(
                profile,
            );
            vi.mocked(postRepository.countByUserId).mockResolvedValue(12);
            vi.mocked(
                articleRepository.countPublishedByAuthorId,
            ).mockResolvedValue(4);

            const result = await useCase.execute("testuser");

            expect(result.postCount).toBe(12);
            expect(result.articleCount).toBe(4);
        });

        it("should not query articles when the profile does not exist", async () => {
            vi.mocked(profileRepository.findByUsername).mockResolvedValue(null);

            await expect(useCase.execute("nobody")).rejects.toThrow(
                NotFoundError,
            );

            expect(
                articleRepository.countPublishedByAuthorId,
            ).not.toHaveBeenCalled();
        });
    });
});
