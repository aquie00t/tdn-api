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
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import type { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import type { LanguageDetectionPort } from "@core/ports/services/language-detection.port";
import { NotFoundError } from "@core/errors/common/not-found.error";
import { ForbiddenError } from "@core/errors/common/forbidden.error";
import { BadRequestError } from "@core/errors/common/bad-request.error";
import { PostType } from "@core/domain/enums/post-type.enum";
import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import {
    MediaChannel,
    MediaKind,
    MediaModerationStatus,
    MediaOwnerKind,
} from "@core/domain/enums";
import { MediaNotOwnedError, MentionLimitExceededError } from "@core/errors";
import { buildUser, buildPost } from "../../../helpers/mock-factories";

const CDN_URL = "https://cdn.example.com";

describe("CreatePostUseCase", () => {
    let useCase: CreatePostUseCase;
    // The transactional repository, reached through the mocked transaction.
    let postRepository: Pick<
        IPostRepository,
        "create" | "findById" | "incrementQuoteCount"
    >;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
    let userRepository: Pick<
        IUserRepository,
        "findById" | "findManyByUsernames"
    >;
    let cacheService: Pick<CachePort, "deleteByPattern">;
    let notifyNewPostUseCase: Pick<NotifyNewPostUseCase, "execute">;
    let notifyQuotedAuthorUseCase: Pick<NotifyQuotedAuthorUseCase, "execute">;
    let notifyMentionedUsersUseCase: Pick<
        NotifyMentionedUsersUseCase,
        "execute"
    >;
    let languageDetectionService: LanguageDetectionPort;
    let logger: Pick<LoggerPort, "error">;
    let mediaAssetRepository: Pick<
        IMediaAssetRepository,
        "findByStorageKeys" | "attachToOwner"
    >;

    beforeEach(() => {
        postRepository = {
            create: vi.fn().mockResolvedValue(buildPost()),
            findById: vi.fn().mockResolvedValue(buildPost()),
            incrementQuoteCount: vi.fn().mockResolvedValue(undefined),
        };
        mediaAssetRepository = {
            findByStorageKeys: vi.fn().mockResolvedValue([]),
            attachToOwner: vi.fn().mockResolvedValue(1),
        };
        transactionService = {
            runInTransaction: vi.fn().mockImplementation(async (work) =>
                work({
                    postRepository,
                    mediaAssetRepository,
                } as unknown as TransactionContext),
            ),
        };
        userRepository = {
            findById: vi.fn(),
            findManyByUsernames: vi.fn().mockResolvedValue([]),
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
        notifyMentionedUsersUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        languageDetectionService = {
            detect: vi.fn().mockResolvedValue("tr"),
        };
        logger = { error: vi.fn() };
        useCase = new CreatePostUseCase(
            transactionService as TransactionPort,
            cacheService as CachePort,
            userRepository as IUserRepository,
            notifyNewPostUseCase as NotifyNewPostUseCase,
            notifyQuotedAuthorUseCase as NotifyQuotedAuthorUseCase,
            notifyMentionedUsersUseCase as NotifyMentionedUsersUseCase,
            languageDetectionService,
            mediaAssetRepository as IMediaAssetRepository,
            CDN_URL,
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
                excludeUserIds: [],
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

        it("should accept an empty body when quoting, as a pure repost", async () => {
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0" }),
            );

            await useCase.execute({
                content: "",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            expect(postRepository.create).toHaveBeenCalledOnce();
        });

        it("should reject an empty post that quotes nothing", async () => {
            await expect(
                useCase.execute({
                    content: "",
                    type: PostType.COMMUNITY,
                    authorId: "user-1",
                }),
            ).rejects.toThrow(BadRequestError);

            expect(transactionService.runInTransaction).not.toHaveBeenCalled();
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
    describe("media ownership", () => {
        const KEY = "posts/user-1/abc.jpg";
        const URL = `${CDN_URL}/${KEY}`;

        const uploaded = (
            overrides: Record<string, unknown> = {},
        ): MediaAsset =>
            MediaAsset.with({
                id: "asset-1",
                storageKey: KEY,
                kind: MediaKind.IMAGE,
                mimeType: "image/jpeg",
                byteSize: 100,
                uploaderId: "user-1",
                channel: MediaChannel.POST_MEDIA,
                status: MediaModerationStatus.APPROVED,
                categories: [],
                attempts: 0,
                ...overrides,
            });

        it("should refuse a media URL that no upload produced", async () => {
            // Without this the whole pipeline is decorative: a client can skip
            // the upload endpoint and put any URL it likes in the body.
            await expect(
                useCase.execute({
                    content: "look at this",
                    type: PostType.COMMUNITY,
                    authorId: "user-1",
                    mediaUrls: ["https://evil.example.com/whatever.jpg"],
                }),
            ).rejects.toThrow(MediaNotOwnedError);

            expect(postRepository.create).not.toHaveBeenCalled();
        });

        it("should refuse a key uploaded by someone else", async () => {
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [uploaded({ uploaderId: "user-2" })],
            );

            await expect(
                useCase.execute({
                    content: "look at this",
                    type: PostType.COMMUNITY,
                    authorId: "user-1",
                    mediaUrls: [URL],
                }),
            ).rejects.toThrow(MediaNotOwnedError);
        });

        it("should bind the assets to the post inside the transaction", async () => {
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [uploaded()],
            );
            vi.mocked(postRepository.create).mockResolvedValue(
                buildPost({ id: "post-7" }),
            );

            await useCase.execute({
                content: "look at this",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                mediaUrls: [URL],
            });

            expect(mediaAssetRepository.attachToOwner).toHaveBeenCalledWith(
                [KEY],
                MediaOwnerKind.POST,
                "post-7",
            );
        });

        it("should carry a pending video's state onto the post", async () => {
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [uploaded({ status: MediaModerationStatus.PENDING })],
            );

            await useCase.execute({
                content: "clip",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                mediaUrls: [URL],
            });

            const [stored] = vi.mocked(postRepository.create).mock.calls[0];
            expect(stored.mediaStatus).toBe(MediaModerationStatus.PENDING);
        });

        it("should mark the post sensitive when an asset is borderline", async () => {
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [uploaded({ status: MediaModerationStatus.SENSITIVE })],
            );

            await useCase.execute({
                content: "borderline",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                mediaUrls: [URL],
            });

            const [stored] = vi.mocked(postRepository.create).mock.calls[0];
            expect(stored.isSensitive).toBe(true);
        });
    });

    describe("language detection", () => {
        it("should label the post with the detected language", async () => {
            vi.mocked(languageDetectionService.detect).mockResolvedValue("tr");

            await useCase.execute({
                content: "Bugün yeni bir şey öğrendim",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(languageDetectionService.detect).toHaveBeenCalledWith(
                "Bugün yeni bir şey öğrendim",
            );
            expect(vi.mocked(postRepository.create).mock.calls[0][0].lang).toBe(
                "tr",
            );
        });

        it("should store a null language rather than guessing one", async () => {
            // An undetectable post is ranked language-neutral by the feed. A
            // guess here would push it out of every feed but one.
            vi.mocked(languageDetectionService.detect).mockResolvedValue(null);

            await useCase.execute({
                content: "https://example.com",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(
                vi.mocked(postRepository.create).mock.calls[0][0].lang,
            ).toBeNull();
        });

        it("should detect the language before opening the transaction", async () => {
            const order: string[] = [];
            vi.mocked(languageDetectionService.detect).mockImplementation(
                () => {
                    order.push("detect");
                    return Promise.resolve("en");
                },
            );
            vi.mocked(transactionService.runInTransaction).mockImplementation(
                async (work) => {
                    order.push("transaction");
                    return work({
                        postRepository,
                        mediaAssetRepository,
                    } as unknown as TransactionContext);
                },
            );

            await useCase.execute({
                content: "this is an english post about the feed",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(order).toEqual(["detect", "transaction"]);
        });
    });
    describe("mentions", () => {
        it("should resolve the handles in the content onto the post", async () => {
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "great point @ada",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(userRepository.findManyByUsernames).toHaveBeenCalledWith([
                "ada",
            ]);
            const stored = vi.mocked(postRepository.create).mock.calls[0][0];
            expect(stored.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });

        it("should not look anything up when the content names nobody", async () => {
            await useCase.execute({
                content: "no handles here",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(userRepository.findManyByUsernames).not.toHaveBeenCalled();
            expect(notifyMentionedUsersUseCase.execute).not.toHaveBeenCalled();
        });

        it("should notify the resolved users after the post is stored", async () => {
            const created = buildPost({ id: "post-9" });
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "hey @ada",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith({
                    issuerId: "user-1",
                    mentionedUserIds: ["user-2"],
                    target: { postId: "post-9" },
                    excludeUserIds: [],
                });
            });
        });

        it("should leave the quoted author out, since a QUOTE already tells them", async () => {
            const created = buildPost({ id: "post-9" });
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0", author: { id: "user-2" } }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "agreed @ada",
                type: PostType.COMMUNITY,
                authorId: "user-1",
                quotedPostId: "post-0",
            });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({ excludeUserIds: ["user-2"] }),
                );
            });
        });

        it("should refuse a post naming more people than allowed", async () => {
            const body = Array.from(
                { length: 11 },
                (_, index) => `@user${index}`,
            ).join(" ");

            await expect(
                useCase.execute({
                    content: body,
                    type: PostType.COMMUNITY,
                    authorId: "user-1",
                }),
            ).rejects.toThrow(MentionLimitExceededError);

            expect(postRepository.create).not.toHaveBeenCalled();
        });

        it("should keep a mentioned follower out of the NEW_POST fan-out", async () => {
            // The mention is the more specific signal, so it wins: one post
            // must never raise two rows for the same person.
            vi.mocked(userRepository.findById).mockResolvedValue(
                buildUser({ isBot: true }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "shipping this, thanks @ada",
                type: PostType.TECH_NEWS,
                authorId: "bot-1",
            });

            expect(notifyNewPostUseCase.execute).toHaveBeenCalledWith(
                expect.objectContaining({ excludeUserIds: ["user-2"] }),
            );
        });

        it("should keep the quoted author out of the NEW_POST fan-out too", async () => {
            vi.mocked(userRepository.findById).mockResolvedValue(
                buildUser({ isBot: true }),
            );
            vi.mocked(postRepository.findById).mockResolvedValue(
                buildPost({ id: "post-0", author: { id: "user-3" } }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "worth reading, @ada",
                type: PostType.TECH_NEWS,
                authorId: "bot-1",
                quotedPostId: "post-0",
            });

            expect(notifyNewPostUseCase.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    excludeUserIds: ["user-2", "user-3"],
                }),
            );
        });

        it("should exclude nobody from the fan-out for a plain post", async () => {
            await useCase.execute({
                content: "nothing special here",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(notifyNewPostUseCase.execute).toHaveBeenCalledWith(
                expect.objectContaining({ excludeUserIds: [] }),
            );
        });

        it("should still return the post when the mention notification fails", async () => {
            const created = buildPost({ id: "post-9" });
            vi.mocked(postRepository.create).mockResolvedValue(created);
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);
            vi.mocked(notifyMentionedUsersUseCase.execute).mockRejectedValue(
                new Error("notifier exploded"),
            );

            const result = await useCase.execute({
                content: "hey @ada",
                type: PostType.COMMUNITY,
                authorId: "user-1",
            });

            expect(result).toBe(created);
            await vi.waitFor(() => {
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });
});
