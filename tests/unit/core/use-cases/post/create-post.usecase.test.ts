import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePostUseCase } from "@core/use-cases/post/create-post";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import type { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import { NotFoundError } from "@core/errors/common/not-found.error";
import { ForbiddenError } from "@core/errors/common/forbidden.error";
import { PostType } from "@core/domain/enums/post-type.enum";
import { buildUser, buildPost } from "../../../helpers/mock-factories";

describe("CreatePostUseCase", () => {
    let useCase: CreatePostUseCase;
    // The transactional repository, reached through the mocked transaction.
    let postRepository: Pick<
        IPostRepository,
        "create" | "findById" | "incrementQuoteCount"
    >;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
    let userRepository: Pick<IUserRepository, "findById">;
    let cacheService: Pick<CachePort, "deleteByPattern">;
    let notifyNewPostUseCase: Pick<NotifyNewPostUseCase, "execute">;
    let notifyQuotedAuthorUseCase: Pick<NotifyQuotedAuthorUseCase, "execute">;
    let logger: Pick<LoggerPort, "error">;

    beforeEach(() => {
        postRepository = {
            create: vi.fn().mockResolvedValue(buildPost()),
            findById: vi.fn().mockResolvedValue(buildPost()),
            incrementQuoteCount: vi.fn().mockResolvedValue(undefined),
        };
        transactionService = {
            runInTransaction: vi
                .fn()
                .mockImplementation(async (work) =>
                    work({ postRepository } as unknown as TransactionContext),
                ),
        };
        userRepository = {
            findById: vi.fn(),
        };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        notifyNewPostUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        notifyQuotedAuthorUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        logger = { error: vi.fn() };
        useCase = new CreatePostUseCase(
            transactionService as TransactionPort,
            cacheService as CachePort,
            userRepository as IUserRepository,
            notifyNewPostUseCase as NotifyNewPostUseCase,
            notifyQuotedAuthorUseCase as NotifyQuotedAuthorUseCase,
            logger as LoggerPort,
        );
    });

    it("should create and return post for COMMUNITY type without user lookup", async () => {
        const created = buildPost({ type: PostType.COMMUNITY });
        vi.mocked(postRepository.create).mockResolvedValue(created);

        const result = await useCase.execute({
            content: "Hello world",
            type: PostType.COMMUNITY,
            authorId: "user-1",
        });

        expect(result).toBe(created);
        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when author not found for SYSTEM_UPDATE type", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                content: "System update",
                type: PostType.SYSTEM_UPDATE,
                authorId: "ghost-user",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError when non-bot creates TECH_NEWS", async () => {
        const nonBotUser = buildUser({ isBot: false });
        vi.mocked(userRepository.findById).mockResolvedValue(nonBotUser);

        await expect(
            useCase.execute({
                content: "Tech news",
                type: PostType.TECH_NEWS,
                authorId: "user-1",
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it("should allow bot user to create SYSTEM_UPDATE", async () => {
        const botUser = buildUser({ isBot: true });
        vi.mocked(userRepository.findById).mockResolvedValue(botUser);
        const created = buildPost({ type: PostType.SYSTEM_UPDATE });
        vi.mocked(postRepository.create).mockResolvedValue(created);

        const result = await useCase.execute({
            content: "System update",
            type: PostType.SYSTEM_UPDATE,
            authorId: "bot-1",
        });

        expect(result).toBe(created);
    });

    it("should invalidate posts:feed:* cache after creation", async () => {
        vi.mocked(postRepository.create).mockResolvedValue(buildPost());

        await useCase.execute({
            content: "Hello",
            type: PostType.COMMUNITY,
            authorId: "user-1",
        });

        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "posts:feed:*",
        );
    });

    describe("follower fan-out", () => {
        it("should hand the created post to the fan-out", async () => {
            const created = buildPost({
                id: "post-9",
                type: PostType.TECH_NEWS,
            });
            vi.mocked(userRepository.findById).mockResolvedValue(
                buildUser({ isBot: true }),
            );
            vi.mocked(postRepository.create).mockResolvedValue(created);

            await useCase.execute({
                content: "TypeScript 6.0",
                type: PostType.TECH_NEWS,
                authorId: "bot-1",
            });

            expect(notifyNewPostUseCase.execute).toHaveBeenCalledWith({
                postId: "post-9",
                authorId: "bot-1",
                postType: PostType.TECH_NEWS,
            });
        });

        it("should still return the post when the fan-out fails", async () => {
            // The post is the thing worth keeping - a notification failure must
            // not surface as a failed request.
            const created = buildPost();
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(notifyNewPostUseCase.execute).mockRejectedValue(
                new Error("fan-out exploded"),
            );

            const result = await useCase.execute({
                content: "Hello",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(result).toBe(created);
            await vi.waitFor(() => {
                expect(logger.error).toHaveBeenCalledOnce();
            });
        });
    });

    describe("quote posts", () => {
        it("should carry quotedPostId onto the created post", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0" }),
            );

            await useCase.execute({
                content: "I agree with this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            const created = vi.mocked(postRepository.create).mock.calls[0][0];
            expect(created.quotedPostId).toBe("post-0");
            expect(created.isQuote()).toBe(true);
        });

        it("should throw NotFoundError when the quoted post is gone", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(null);

            await expect(
                useCase.execute({
                    content: "I agree with this",
                    type: PostType.COMMUNITY,
                    authorId: "user-1",
                    quotedPostId: "missing-post",
                }),
            ).rejects.toThrow(NotFoundError);

            expect(postRepository.create).not.toHaveBeenCalled();
        });

        it("should not look up anything when nothing is quoted", async () => {
            await useCase.execute({
                content: "Just a post",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(postRepository.findById).not.toHaveBeenCalled();
            expect(
                vi.mocked(postRepository.create).mock.calls[0][0].isQuote(),
            ).toBe(false);
        });

        it("should count the quote on the post it quotes", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0" }),
            );

            await useCase.execute({
                content: "I agree with this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            expect(postRepository.incrementQuoteCount).toHaveBeenCalledWith(
                "post-0",
            );
        });

        it("should write the post and the counter in one transaction", async () => {
            // A post that exists without having been counted leaves the quote
            // badge permanently short, with nothing to notice it afterwards.
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0" }),
            );

            await useCase.execute({
                content: "I agree with this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            expect(transactionService.runInTransaction).toHaveBeenCalledOnce();
        });

        it("should not touch the counter when nothing is quoted", async () => {
            await useCase.execute({
                content: "Just a post",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(postRepository.incrementQuoteCount).not.toHaveBeenCalled();
        });

        it("should tell the quoted author about it", async () => {
            const created = buildPost({ id: "quote-1" });
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0" }),
            );

            await useCase.execute({
                content: "I agree with this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            await vi.waitFor(() => {
                expect(notifyQuotedAuthorUseCase.execute).toHaveBeenCalledWith({
                    quotePostId: "quote-1",
                    quotedPostId: "post-0",
                    issuerId: "user-1",
                });
            });
        });

        it("should not notify anyone when nothing is quoted", async () => {
            await useCase.execute({
                content: "Just a post",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(notifyQuotedAuthorUseCase.execute).not.toHaveBeenCalled();
        });

        it("should still return the post when the quote notification fails", async () => {
            // The post is the thing worth keeping; a notification failure must
            // not surface as a failed request.
            const created = buildPost({ id: "quote-1" });
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(notifyQuotedAuthorUseCase.execute).mockRejectedValue(
                new Error("notifier exploded"),
            );

            const result = await useCase.execute({
                content: "I agree with this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            expect(result).toBe(created);
            await vi.waitFor(() => {
                expect(logger.error).toHaveBeenCalledOnce();
            });
        });

        it("should allow quoting a quote", async () => {
            // Only the read side stops at one level; the write side does not
            // care how deep the chain already goes.
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-1", quotedPostId: "post-0" }),
            );

            await useCase.execute({
                content: "and another thing",
                type: PostType.COMMUNITY,
                authorId: "user-2",
                quotedPostId: "post-1",
            });

            expect(
                vi.mocked(postRepository.create).mock.calls[0][0].quotedPostId,
            ).toBe("post-1");
        });
    });
});
