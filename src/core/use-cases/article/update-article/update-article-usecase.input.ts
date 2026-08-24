import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input for editing an existing article.
 *
 * Every content field is optional; omitted fields are left untouched. The slug
 * is not editable because it is part of a published URL.
 */
export interface UpdateArticleUseCaseInput {
    /** Identifier of the article being edited */
    articleId: string;

    /** The authenticated user, who must be the author */
    userId: string;

    /** New title */
    title?: string;

    /** New markdown body */
    body?: string;

    /** New excerpt; null clears it and re-derives from the body */
    excerpt?: string | null;

    /** New cover image storage key; null clears it */
    coverImageKey?: string | null;

    /** New cover image accessibility text; null clears it */
    coverImageAlt?: string | null;

    /** Replacement tag set */
    tags?: string[];

    /** Replacement category set */
    categories?: PostCategory[];
}
