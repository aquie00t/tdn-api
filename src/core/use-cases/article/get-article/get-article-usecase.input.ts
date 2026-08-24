/**
 * Input for reading a single article by slug.
 */
export interface GetArticleUseCaseInput {
    /** The article slug from the URL */
    slug: string;

    /** The viewer, when authenticated */
    viewerId?: string;
}
