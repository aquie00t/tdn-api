import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeletePostUseCase } from "@core/use-cases/post/delete-post";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { CachePort } from "@core/ports/services/cache.port";
import { NotFoundError } from "@core/errors";
import { UnauthorizedActionError } from "@core/errors";
import { buildPost } from "../../../helpers/mock-factories";

describe("DeletePostUseCase", () => {
    let useCase: DeletePostUseCase;
    let postRepository: Pick<
        IPostRepository,
        "findById" | "delete" | "decrementQuoteCount"
    >;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
    let storageService: Pick<StoragePort, "delete">;
    let logger: LoggerPort;
    let cacheService: Pick<CachePort, "deleteByPattern">;

    beforeEach(() => {
        postRepository = {
            findById: vi.fn(),
            delete: vi.fn().mockResolvedValue(undefined),
            decrementQuoteCount: vi.fn().mockResolvedValue(undefined),
        };
        transactionService = {
            runInTransaction: vi
                .fn()
                .mockImplementation(async (work) =>
                    work({ postRepository } as unknown as TransactionContext),
                ),
        };
        storageService = {
            delete: vi.fn().mockResolvedValue(undefined),
        };
        logger = {
            error: vi.fn(),
            warn: vi.fn(),
        };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new DeletePostUseCase(
            postRepository as IPostRepository,
            storageService as StoragePort,
            logger,
            cacheService as CachePort,
            transactionService as TransactionPort,
        );
    });

    it("should throw NotFoundError when post not found", async () => {
        vi.mocked(postRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                postId: "ghost-post",
                userId: "user-1",
                cdnBaseUrl: "https://cdn.example.com",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw UnauthorizedActionError when user is not the author", async () => {
        const post = buildPost({ author: { id: "author-1" } });
        vi.mocked(postRepository.findById).mockResolvedValue(post);

        await expect(
            useCase.execute({
                postId: "post-1",
                userId: "other-user",
                cdnBaseUrl: "https://cdn.example.com",
            }),
        ).rejects.toThrow(UnauthorizedActionError);
    });

    it("should delete post and invalidate cache", async () => {
        const post = buildPost({ author: { id: "user-1" } });
        vi.mocked(postRepository.findById).mockResolvedValue(post);

        await useCase.execute({
            postId: "post-1",
            userId: "user-1",
            cdnBaseUrl: "https://cdn.example.com",
        });

        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "posts:feed:*",
        );
        expect(postRepository.delete).toHaveBeenCalledWith("post-1");
    });

    it("should delete media files when post has media", async () => {
        const post = buildPost({
            author: { id: "user-1" },
            mediaUrls: ["https://cdn.example.com/posts/user-1/img.jpg"],
        });
        vi.mocked(postRepository.findById).mockResolvedValue(post);

        await useCase.execute({
            postId: "post-1",
            userId: "user-1",
            cdnBaseUrl: "https://cdn.example.com",
        });

        expect(storageService.delete).toHaveBeenCalledWith(
            "posts/user-1/img.jpg",
        );
    });

    it("should continue deletion even if storage delete fails", async () => {
        const post = buildPost({
            author: { id: "user-1" },
            mediaUrls: ["https://cdn.example.com/posts/user-1/img.jpg"],
        });
        vi.mocked(postRepository.findById).mockResolvedValue(post);
        vi.mocked(storageService.delete).mockRejectedValue(
            new Error("S3 unavailable"),
        );

        await useCase.execute({
            postId: "post-1",
            userId: "user-1",
            cdnBaseUrl: "https://cdn.example.com",
        });

        expect(logger.error).toHaveBeenCalledOnce();
        expect(postRepository.delete).toHaveBeenCalledWith("post-1");
    });

    describe("quote counter", () => {
        it("should give the quoted post its count back when a quote is deleted", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ author: { id: "user-1" }, quotedPostId: "post-0" }),
            );

            await useCase.execute({
                postId: "post-1",
                userId: "user-1",
                cdnBaseUrl: "https://cdn.example.com",
            });

            expect(postRepository.decrementQuoteCount).toHaveBeenCalledWith(
                "post-0",
            );
        });

        it("should delete the post and decrement in one transaction", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ author: { id: "user-1" }, quotedPostId: "post-0" }),
            );

            await useCase.execute({
                postId: "post-1",
                userId: "user-1",
                cdnBaseUrl: "https://cdn.example.com",
            });

            expect(transactionService.runInTransaction).toHaveBeenCalledOnce();
            expect(postRepository.delete).toHaveBeenCalledWith("post-1");
        });

        it("should not touch any counter when the post quotes nothing", async () => {
            // A quoted post needs no decrement of its own: its quotes are
            // cascaded away with it and no surviving row was counting them.
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ author: { id: "user-1" } }),
            );

            await useCase.execute({
                postId: "post-1",
                userId: "user-1",
                cdnBaseUrl: "https://cdn.example.com",
            });

            expect(postRepository.decrementQuoteCount).not.toHaveBeenCalled();
        });
    });
});
