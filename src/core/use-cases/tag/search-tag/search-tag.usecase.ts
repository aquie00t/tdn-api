import type { ITagRepository } from "@core/ports/repositories/tag.repository";
import type { SearchTagInput } from "./search-tag-usecase.input";
import type { SearchTagOutput } from "./search-tag-usecase.output";

export class SearchTagsUseCase {
    constructor(private readonly tagRepository: ITagRepository) {}

    async execute(input: SearchTagInput): Promise<SearchTagOutput[]> {
        const sanitizedQuery = input.query.trim();
        if (sanitizedQuery.length < 1) {
            return [];
        }

        const tags = await this.tagRepository.search(
            sanitizedQuery,
            input.limit,
        );

        return tags.map((tag) => ({
            name: tag.name,
            postCount: tag.postCount,
            articleCount: tag.articleCount,
            category: tag.category,
        }));
    }
}
