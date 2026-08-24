import { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { CreateArticleUseCaseInput } from "./create-article-usecase.input";
import {
    normalizeBody,
    normalizeTags,
    normalizeTitle,
    validateCoverImageKey,
} from "../article-input";

/** Bytes of randomness appended to a slug, hex encoded. */
const SLUG_SUFFIX_BYTES = 4;

/**
 * Use case for creating an article.
 *
 * The article is always stored as a draft. Nothing is invalidated in the cache
 * because a draft never enters a cached list.
 */
export class CreateArticleUseCase {
    /**
     * Creates a new instance of CreateArticleUseCase.
     *
     * @param articleRepository - Repository for managing article data
     * @param cryptoService - Source of the random slug suffix
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cryptoService: CryptoPort,
    ) {}

    /**
     * Executes the article creation process.
     *
     * @param input - The article content and its author
     * @returns The stored draft article
     *
     * @throws BadRequestError - When the title, body, tags or cover key are invalid
     */
    async execute(input: CreateArticleUseCaseInput): Promise<Article> {
        const article = Article.create({
            title: normalizeTitle(input.title),
            body: normalizeBody(input.body),
            authorId: input.authorId,
            slugSuffix: this.cryptoService.generateRandomHex(SLUG_SUFFIX_BYTES),
            excerpt: input.excerpt,
            coverImageKey: validateCoverImageKey(
                input.coverImageKey,
                input.authorId,
            ),
            coverImageAlt: input.coverImageAlt ?? null,
            tags: normalizeTags(input.tags),
            categories: input.categories ?? [],
        });

        return await this.articleRepository.create(article);
    }
}
