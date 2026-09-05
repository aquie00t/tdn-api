import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetPostQuotesUseCase } from "@core/use-cases/post/get-post-quotes";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import { NotFoundError } from "@core/errors";
import {
    buildPost,
    buildBlockRepository,
} from "../../../helpers/mock-factories";

describe("GetPostQuotesUseCase", () => {
    let useCase: GetPostQuotesUseCase;
    let postRepository: Pick<IPostRepository, "findById" | "findAll">;

    beforeEach(() => {
        postRepository = {
            findById: vi.fn().mockResolvedValue(buildPost({ id: "post-0" })),
            findAll: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
        };
        useCase = new GetPostQuotesUseCase(
            postRepository as IPostRepository,
            buildBlockRepository(),
        );
    });

    it("should ask the repository for the posts quoting this one", async () => {
        const quotes = [buildPost({ id: "quote-1" })];
        vi.mocked(postRepository.findAll).mockResolvedValue({
            posts: quotes,
            total: 1,
        });

        const result = await useCase.execute({
            postId: "post-0",
            page: 2,
            limit: 20,
            currentUserId: "user-9",
        });

        expect(postRepository.findAll).toHaveBeenCalledWith({
            page: 2,
            limit: 20,
            quotedPostId: "post-0",
            currentUserId: "user-9",
            excludeAuthorIds: [],
        });
        expect(result).toEqual({ posts: quotes, total: 1 });
    });

    it("should throw NotFoundError when the post itself is gone", async () => {
        // "No quotes" and "no such post" are different answers, the way
        // GET /posts/:id already distinguishes them.
        vi.mocked(postRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ postId: "ghost", page: 1, limit: 10 }),
        ).rejects.toThrow(NotFoundError);

        expect(postRepository.findAll).not.toHaveBeenCalled();
    });

    it("should return an empty page rather than failing when nothing quotes it", async () => {
        const result = await useCase.execute({
            postId: "post-0",
            page: 1,
            limit: 10,
        });

        expect(result).toEqual({ posts: [], total: 0 });
    });

    it("should work for an anonymous caller", async () => {
        await useCase.execute({ postId: "post-0", page: 1, limit: 10 });

        expect(postRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ currentUserId: undefined }),
        );
    });
});
