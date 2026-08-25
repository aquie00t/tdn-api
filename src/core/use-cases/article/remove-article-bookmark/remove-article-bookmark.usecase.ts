import type { IArticleBookmarkRepository } from "@core/ports/repositories/article-bookmark.repository";
import type { RemoveArticleBookmarkUseCaseInput } from "./remove-article-bookmark-usecase.input";

/**
 * Use case for removing an article bookmark.
 *
 * The article itself is not loaded: a bookmark is the user's own row, so
 * removing one they hold must keep working even if the article has since been
 * archived. Removing a bookmark that does not exist is a no-op.
 */
export class RemoveArticleBookmarkUseCase {
    /**
     * @param articleBookmarkRepository - Repository for bookmark rows
     */
    constructor(
        private readonly articleBookmarkRepository: IArticleBookmarkRepository,
    ) {}

    /**
     * Executes the removal.
     *
     * @param input - The article and the user removing their bookmark
     */
    async execute(input: RemoveArticleBookmarkUseCaseInput): Promise<void> {
        const bookmarked = await this.articleBookmarkRepository.isBookmarked(
            input.articleId,
            input.userId,
        );

        if (!bookmarked) return;

        await this.articleBookmarkRepository.remove(
            input.articleId,
            input.userId,
        );
    }
}
