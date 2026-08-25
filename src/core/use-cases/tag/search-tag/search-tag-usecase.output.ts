export interface SearchTagOutput {
    name: string;

    /** Posts carrying this tag */
    postCount: number;

    /** Published articles carrying this tag */
    articleCount: number;

    category: string | null;
}
