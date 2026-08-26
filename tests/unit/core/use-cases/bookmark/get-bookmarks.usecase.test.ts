import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetBookmarksUseCase } from "@core/use-cases/bookmark/get-bookmarks/get-bookmarks.usecase";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { ICommentBookmarkRepository } from "@core/ports/repositories/comment-bookmark.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { Post } from "@core/domain/entities/post.entity";
import type { Comment } from "@core/domain/entities/comment.entity";
import type { Article } from "@core/domain/entities/article.entity";

describe("GetBookmarksUseCase", () => {
    let useCase: GetBookmarksUseCase;
    let postRepo: Pick<IPostRepository, "findAll">;
    let commentBookmarkRepo: Pick<
        ICommentBookmarkRepository,
        "findBookmarkedByUserId"
    >;
    let articleRepo: Pick<IArticleRepository, "findAll">;

    const userId = "user-1";

    beforeEach(() => {
        postRepo = { findAll: vi.fn() };
        commentBookmarkRepo = { findBookmarkedByUserId: vi.fn() };
        articleRepo = { findAll: vi.fn() };

        useCase = new GetBookmarksUseCase(
            postRepo as IPostRepository,
            commentBookmarkRepo as ICommentBookmarkRepository,
            articleRepo as IArticleRepository,
        );
    });

    it("should return bookmarked posts, comments and articles", async () => {
        const posts = [{} as Post];
        const comments = [{} as Comment];
        const articles = [{} as Article];

        vi.mocked(postRepo.findAll).mockResolvedValue({ posts, total: 1 });
        vi.mocked(commentBookmarkRepo.findBookmarkedByUserId).mockResolvedValue(
            {
                comments,
                total: 1,
            },
        );
        vi.mocked(articleRepo.findAll).mockResolvedValue({
            articles,
            total: 1,
        });

        const result = await useCase.execute({ userId });

        expect(result.posts).toBe(posts);
        expect(result.postTotal).toBe(1);
        expect(result.comments).toBe(comments);
        expect(result.commentTotal).toBe(1);
        expect(result.articles).toBe(articles);
        expect(result.articleTotal).toBe(1);
    });

    it("should use default page=1 and limit=10 when not provided", async () => {
        vi.mocked(postRepo.findAll).mockResolvedValue({ posts: [], total: 0 });
        vi.mocked(commentBookmarkRepo.findBookmarkedByUserId).mockResolvedValue(
            {
                comments: [],
                total: 0,
            },
        );
        vi.mocked(articleRepo.findAll).mockResolvedValue({
            articles: [],
            total: 0,
        });

        await useCase.execute({ userId });

        expect(postRepo.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1, limit: 10 }),
        );
        expect(commentBookmarkRepo.findBookmarkedByUserId).toHaveBeenCalledWith(
            userId,
            10,
            0, // offset = (1-1) * 10
        );
    });

    it("should calculate correct offset from page and limit", async () => {
        vi.mocked(postRepo.findAll).mockResolvedValue({ posts: [], total: 0 });
        vi.mocked(commentBookmarkRepo.findBookmarkedByUserId).mockResolvedValue(
            {
                comments: [],
                total: 0,
            },
        );
        vi.mocked(articleRepo.findAll).mockResolvedValue({
            articles: [],
            total: 0,
        });

        await useCase.execute({ userId, page: 3, limit: 5 });

        expect(commentBookmarkRepo.findBookmarkedByUserId).toHaveBeenCalledWith(
            userId,
            5,
            10, // offset = (3-1) * 5
        );
    });

    it("should pass savedByUserId and currentUserId to post repository", async () => {
        vi.mocked(postRepo.findAll).mockResolvedValue({ posts: [], total: 0 });
        vi.mocked(commentBookmarkRepo.findBookmarkedByUserId).mockResolvedValue(
            {
                comments: [],
                total: 0,
            },
        );
        vi.mocked(articleRepo.findAll).mockResolvedValue({
            articles: [],
            total: 0,
        });

        await useCase.execute({ userId, page: 2, limit: 20 });

        expect(postRepo.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                savedByUserId: userId,
                currentUserId: userId,
                page: 2,
                limit: 20,
            }),
        );
    });

    it("should pass savedByUserId and currentUserId to article repository", async () => {
        vi.mocked(postRepo.findAll).mockResolvedValue({ posts: [], total: 0 });
        vi.mocked(commentBookmarkRepo.findBookmarkedByUserId).mockResolvedValue(
            {
                comments: [],
                total: 0,
            },
        );
        vi.mocked(articleRepo.findAll).mockResolvedValue({
            articles: [],
            total: 0,
        });

        await useCase.execute({ userId, page: 2, limit: 20 });

        expect(articleRepo.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                savedByUserId: userId,
                currentUserId: userId,
                page: 2,
                limit: 20,
            }),
        );
    });

    it("should fetch posts, comments and articles in parallel", async () => {
        const callOrder: string[] = [];

        vi.mocked(postRepo.findAll).mockImplementation(async () => {
            callOrder.push("posts");
            return { posts: [], total: 0 };
        });
        vi.mocked(
            commentBookmarkRepo.findBookmarkedByUserId,
        ).mockImplementation(async () => {
            callOrder.push("comments");
            return { comments: [], total: 0 };
        });
        vi.mocked(articleRepo.findAll).mockImplementation(async () => {
            callOrder.push("articles");
            return { articles: [], total: 0 };
        });

        await useCase.execute({ userId });

        expect(callOrder).toContain("posts");
        expect(callOrder).toContain("comments");
        expect(callOrder).toContain("articles");
        expect(postRepo.findAll).toHaveBeenCalledOnce();
        expect(
            commentBookmarkRepo.findBookmarkedByUserId,
        ).toHaveBeenCalledOnce();
        expect(articleRepo.findAll).toHaveBeenCalledOnce();
    });
});
