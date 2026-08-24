import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input for creating a new article.
 *
 * Articles are always created as drafts; there is no way to publish in the same
 * request, so a half-finished piece cannot reach the public list by accident.
 */
export interface CreateArticleUseCaseInput {
    /** The authenticated author */
    authorId: string;

    /** Title, also the source of the slug */
    title: string;

    /** Raw markdown body */
    body: string;

    /** Optional author-written summary; derived from the body when omitted */
    excerpt?: string;

    /** Optional cover image storage key under the author own prefix */
    coverImageKey?: string;

    /** Optional accessibility text for the cover image */
    coverImageAlt?: string;

    /** Optional tag names, normalized by the use case */
    tags?: string[];

    /** Optional categories */
    categories?: PostCategory[];
}
