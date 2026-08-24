import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import { NotFoundError, UnauthorizedActionError } from "@core/errors";

/**
 * Loads an article that the given user is allowed to modify.
 *
 * The two failure modes are deliberately different:
 *
 * - An article the caller cannot even see (someone else's draft, or nothing at
 *   all) is a 404. Returning 403 would confirm that the id exists, which is
 *   exactly the leak drafts must not have.
 * - An article the caller can see but does not own is a 403.
 *
 * @param articleRepository - Repository used to load the article
 * @param articleId - Identifier of the article being modified
 * @param userId - The authenticated user
 * @returns The article, guaranteed to belong to the user
 * @throws NotFoundError - When the article does not exist or is not visible
 * @throws UnauthorizedActionError - When the article is visible but not owned
 */
export async function loadOwnArticle(
    articleRepository: IArticleRepository,
    articleId: string,
    userId: string,
): Promise<Article> {
    const article = await articleRepository.findById(articleId, userId);

    if (!article || !article.isVisibleTo(userId)) {
        throw new NotFoundError("Article not found.");
    }

    if (!article.isAuthor(userId)) {
        throw new UnauthorizedActionError(
            "You can only modify your own articles.",
        );
    }

    return article;
}
