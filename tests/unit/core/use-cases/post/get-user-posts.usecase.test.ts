import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetUserPostsUseCase } from "@core/use-cases/post/get-user-posts/get-user.posts.usecase";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import {
    buildPost,
    buildBlockRepository,
} from "../../../helpers/mock-factories";
import { PostType } from "@core/domain/enums/post-type.enum";

describe("GetUserPostsUseCase", () => {
    let useCase: GetUserPostsUseCase;
    let postRepository: Pick<IPostRepository, "findByAuthorUsername">;

    beforeEach(() => {
        postRepository = {
            findByAuthorUsername: vi.fn(),
        };
        useCase = new GetUserPostsUseCase(
            postRepository as IPostRepository,
            buildBlockRepository(),
        );
    });

    it("should return posts and total for given username", async () => {
        const posts = [buildPost(), buildPost({ id: "post-2" })];
        vi.mocked(postRepository.findByAuthorUsername).mockResolvedValue({
            posts,
            total: 2,
        });

        const result = await useCase.execute({
            username: "testuser",
            page: 1,
            limit: 10,
        });

        expect(result.posts).toBe(posts);
        expect(result.total).toBe(2);
    });

    it("should pass optional type filter to repository", async () => {
        vi.mocked(postRepository.findByAuthorUsername).mockResolvedValue({
            posts: [],
            total: 0,
        });

        await useCase.execute({
            username: "testuser",
            page: 1,
            limit: 10,
            type: PostType.TECH_NEWS,
        });

        expect(postRepository.findByAuthorUsername).toHaveBeenCalledWith(
            "testuser",
            1,
            10,
            PostType.TECH_NEWS,
            undefined,
            [],
        );
    });

    it("should pass currentUserId to repository", async () => {
        vi.mocked(postRepository.findByAuthorUsername).mockResolvedValue({
            posts: [],
            total: 0,
        });

        await useCase.execute({
            username: "testuser",
            page: 2,
            limit: 5,
            currentUserId: "viewer-99",
        });

        expect(postRepository.findByAuthorUsername).toHaveBeenCalledWith(
            "testuser",
            2,
            5,
            undefined,
            "viewer-99",
            [],
        );
    });
});
