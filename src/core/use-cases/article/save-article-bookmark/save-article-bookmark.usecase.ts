import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IArticleBookmarkRepository } from "@core/ports/repositories/article-bookmark.repository";
import { NotFoundError } from "@core/errors";
import type { SaveArticleBookmarkUseCaseInput } from "./save-article-bookmark-usecase.input";

/**
 * Use case for bookmarking an article.
 *
 * Idempotent: bookmarking twice leaves one bookmark.
 */
export class SaveArticleBookmarkUseCase {
    /**
     * @param articleRepository - Repository for reading articles
     * @param articleBookmarkRepository - Repository for bookmark rows
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly articleBookmarkRepository: IArticleBookmarkRepository,
    ) {}

    /**
     * Executes the bookmark.
     *
     * @param input - The article and the user bookmarking it
     * @throws NotFoundError - When the article does not exist or is not visible
     */
    async execute(input: SaveArticleBookmarkUseCaseInput): Promise<void> {
        const article = await this.articleRepository.findById(input.articleId);

        if (!article || !article.isPublished()) {
            throw new NotFoundError("Article not found.");
        }

        const already = await this.articleBookmarkRepository.isBookmarked(
            input.articleId,
            input.userId,
        );

        if (already) return;

        await this.articleBookmarkRepository.save(
            input.articleId,
            input.userId,
        );
    }
}
