import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetPostCommentsUseCase } from "@core/use-cases/comment/get-post-comments/get-post-comments.usecase";
import { NotFoundError } from "@core/errors";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { Post } from "@core/domain/entities/post.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { buildComment, buildArticle } from "../../../helpers/mock-factories";

const buildPost = (): Post => ({ id: "post-1" }) as unknown as Post;

const POST_TARGET = { type: "POST" as const, id: "post-1" };
const ARTICLE_TARGET = { type: "ARTICLE" as const, id: "article-1" };

describe("GetPostCommentsUseCase", () => {
    let useCase: GetPostCommentsUseCase;
    let postRepo: Pick<IPostRepository, "findById">;
    let articleRepo: Pick<IArticleRepository, "findById">;
    let commentRepo: Pick<ICommentRepository, "findTopLevelByTarget">;

    beforeEach(() => {
        postRepo = { findById: vi.fn() };
        articleRepo = { findById: vi.fn() };
        commentRepo = { findTopLevelByTarget: vi.fn().mockResolvedValue([]) };

        useCase = new GetPostCommentsUseCase(
            commentRepo as ICommentRepository,
            postRepo as IPostRepository,
            articleRepo as IArticleRepository,
        );
    });

    describe("post target", () => {
        it("should throw NotFoundError when the post does not exist", async () => {
            vi.mocked(postRepo.findById).mockResolvedValue(null);

            await expect(
                useCase.execute({ target: POST_TARGET }),
            ).rejects.toThrow(NotFoundError);
        });

        it("should return top-level comments for the post", async () => {
            const comments = [
                buildComment(),
                buildComment({ id: "comment-2" }),
            ];
            vi.mocked(postRepo.findById).mockResolvedValue(buildPost());
            vi.mocked(commentRepo.findTopLevelByTarget).mockResolvedValue(
                comments,
            );

            const result = await useCase.execute({ target: POST_TARGET });

            expect(result).toBe(comments);
            expect(commentRepo.findTopLevelByTarget).toHaveBeenCalledWith(
                POST_TARGET,
                10,
                0,
                undefined,
            );
        });

        it("should calculate offset correctly for pagination", async () => {
            vi.mocked(postRepo.findById).mockResolvedValue(buildPost());

            await useCase.execute({
                target: POST_TARGET,
                page: 2,
                limit: 20,
            });

            expect(commentRepo.findTopLevelByTarget).toHaveBeenCalledWith(
                POST_TARGET,
                20,
                20,
                undefined,
            );
        });

        it("should pass currentUserId to the repository", async () => {
            vi.mocked(postRepo.findById).mockResolvedValue(buildPost());

            await useCase.execute({
                target: POST_TARGET,
                currentUserId: "user-5",
            });

            expect(commentRepo.findTopLevelByTarget).toHaveBeenCalledWith(
                POST_TARGET,
                10,
                0,
                "user-5",
            );
        });

        it("should not consult the article repository", async () => {
            vi.mocked(postRepo.findById).mockResolvedValue(buildPost());

            await useCase.execute({ target: POST_TARGET });

            expect(articleRepo.findById).not.toHaveBeenCalled();
        });
    });

    describe("article target", () => {
        it("should return comments for a published article", async () => {
            const comments = [buildComment()];
            vi.mocked(articleRepo.findById).mockResolvedValue(
                buildArticle({ status: ArticleStatus.PUBLISHED }),
            );
            vi.mocked(commentRepo.findTopLevelByTarget).mockResolvedValue(
                comments,
            );

            const result = await useCase.execute({ target: ARTICLE_TARGET });

            expect(result).toBe(comments);
            expect(commentRepo.findTopLevelByTarget).toHaveBeenCalledWith(
                ARTICLE_TARGET,
                10,
                0,
                undefined,
            );
        });

        it("should throw NotFoundError when the article does not exist", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(null);

            await expect(
                useCase.execute({ target: ARTICLE_TARGET }),
            ).rejects.toThrow(NotFoundError);
        });

        it("should not let a comment list expose someone else's draft", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(
                buildArticle({
                    status: ArticleStatus.DRAFT,
                    author: { id: "author-1" },
                }),
            );

            await expect(
                useCase.execute({
                    target: ARTICLE_TARGET,
                    currentUserId: "stranger",
                }),
            ).rejects.toThrow(NotFoundError);

            expect(commentRepo.findTopLevelByTarget).not.toHaveBeenCalled();
        });

        it("should let an author read the comments on their own draft", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(
                buildArticle({
                    status: ArticleStatus.DRAFT,
                    author: { id: "author-1" },
                }),
            );

            await useCase.execute({
                target: ARTICLE_TARGET,
                currentUserId: "author-1",
            });

            expect(commentRepo.findTopLevelByTarget).toHaveBeenCalled();
        });

        it("should not consult the post repository", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(
                buildArticle({ status: ArticleStatus.PUBLISHED }),
            );

            await useCase.execute({ target: ARTICLE_TARGET });

            expect(postRepo.findById).not.toHaveBeenCalled();
        });
    });
});
