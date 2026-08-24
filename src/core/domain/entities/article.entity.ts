import { ArticleStatus } from "@core/domain/enums";
import type { PostCategory } from "../enums/post-category-enum";
import type { ArticleProps } from "../interfaces/article-props.interface";

/** Words per minute used to estimate reading time. */
const WORDS_PER_MINUTE = 200;

/** Longest slug body accepted before the random suffix is appended. */
const MAX_SLUG_BASE_LENGTH = 80;

/** Longest excerpt that will be stored, in characters. */
const MAX_EXCERPT_LENGTH = 300;

/** Target length of an excerpt derived from the body. */
const DERIVED_EXCERPT_LENGTH = 200;

/** Marker that opens and closes a fenced code block. */
const CODE_FENCE = "```";

/**
 * Characters Unicode normalization will not fold for us. Dotless i in
 * particular has no combining-mark decomposition, so NFKD alone would drop it.
 */
const TRANSLITERATIONS: Record<string, string> = {
    ı: "i",
    İ: "i",
    ğ: "g",
    Ğ: "g",
    ş: "s",
    Ş: "s",
    ö: "o",
    Ö: "o",
    ü: "u",
    Ü: "u",
    ç: "c",
    Ç: "c",
};

/**
 * Input accepted by {@link Article.create}.
 */
export interface CreateArticleData {
    /** Human-readable title; also the source of the slug */
    title: string;

    /** Raw markdown body */
    body: string;

    /** Identifier of the authoring user */
    authorId: string;

    /**
     * Random, URL-safe suffix appended to the slug. Supplied by the caller
     * (via CryptoPort.generateRandomHex) so the entity stays free of I/O and
     * so slug generation is deterministic under test.
     */
    slugSuffix: string;

    /** Author-supplied summary; derived from the body when omitted */
    excerpt?: string | null;

    /** Storage key of the cover image, never a URL */
    coverImageKey?: string | null;

    /** Accessibility text for the cover image */
    coverImageAlt?: string | null;

    /** Explicit tag names, already normalized by the caller */
    tags?: string[];

    /** Categories the article belongs to */
    categories?: PostCategory[];
}

/**
 * Rich domain model for the Article entity.
 *
 * An article is Medium-style long-form content with a markdown body, a cover
 * image, tags and a draft/publish lifecycle. The body is stored and returned as
 * raw markdown and is never rendered to HTML by the API, so the entity performs
 * no escaping — rendering, and therefore sanitization, is the client's job.
 */
export class Article {
    private constructor(private readonly props: ArticleProps) {}

    /**
     * Creates a new article in DRAFT state.
     *
     * Reading time and, when not supplied, the excerpt are derived from the
     * body at construction time so they never drift from the content.
     *
     * @param data - The article content and its author
     * @returns A new draft Article
     */
    public static create(data: CreateArticleData): Article {
        const body = data.body;

        return new Article({
            slug: Article.slugify(data.title, data.slugSuffix),
            title: data.title,
            body,
            excerpt: Article.resolveExcerpt(body, data.excerpt),
            coverImageKey: data.coverImageKey ?? null,
            coverImageAlt: data.coverImageAlt ?? null,
            status: ArticleStatus.DRAFT,
            publishedAt: null,
            readingTimeMinutes: Article.calculateReadingTime(body),
            author: { id: data.authorId },
            tags: data.tags ?? [],
            categories: data.categories ?? [],
        });
    }

    /**
     * Rehydrates an article from persisted or cached properties.
     *
     * @param props - The full property set
     * @returns An Article carrying exactly those properties
     */
    public static with(props: ArticleProps): Article {
        return new Article(props);
    }

    /**
     * Builds a URL-safe slug from a title.
     *
     * Turkish characters are transliterated explicitly before normalization,
     * the remainder is folded to ASCII, and everything outside a-z0-9 collapses
     * to a single hyphen. The caller-supplied suffix keeps slugs unique without
     * a retry loop on the unique index, and removes the enumeration signal a
     * sequential counter would leak.
     *
     * @param title - The title to derive from
     * @param suffix - Random, already URL-safe suffix
     * @returns A slug of the form my-title-1a2b3c4d
     */
    public static slugify(title: string, suffix: string): string {
        let transliterated = "";
        for (const char of title) {
            transliterated += TRANSLITERATIONS[char] ?? char;
        }

        const base = transliterated
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+/, "")
            .slice(0, MAX_SLUG_BASE_LENGTH)
            .replace(/-+$/, "");

        return `${base.length > 0 ? base : "article"}-${suffix}`;
    }

    /**
     * Estimates reading time in minutes.
     *
     * Counts whitespace-delimited word groups with a single character scan.
     * Splitting on a whitespace regex would allocate a five-figure array for a
     * 100 KB body for no benefit.
     *
     * @param body - The markdown body
     * @returns Reading time in whole minutes, never below 1
     */
    public static calculateReadingTime(body: string): number {
        let words = 0;
        let inWord = false;

        for (let i = 0; i < body.length; i++) {
            const code = body.charCodeAt(i);
            const isSpace =
                code === 32 || code === 9 || code === 10 || code === 13;

            if (isSpace) {
                inWord = false;
            } else if (!inWord) {
                inWord = true;
                words++;
            }
        }

        return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
    }

    /**
     * Derives a plain-text excerpt from a markdown body.
     *
     * Fenced code blocks are skipped and leading block markers are trimmed, so
     * the excerpt reads as prose rather than markup. Every pass is linear and
     * the scan stops as soon as enough text has been gathered, so no unbounded
     * regex ever runs over the full body.
     *
     * @param body - The markdown body
     * @returns A summary of at most DERIVED_EXCERPT_LENGTH characters
     */
    public static deriveExcerpt(body: string): string {
        const collected: string[] = [];
        let collectedLength = 0;
        let insideFence = false;

        for (const rawLine of body.split("\n")) {
            const line = rawLine.trim();

            if (line.startsWith(CODE_FENCE)) {
                insideFence = !insideFence;
                continue;
            }
            if (insideFence || line.length === 0) continue;

            const cleaned = Article.stripLeadingMarkers(line);
            if (cleaned.length === 0) continue;

            collected.push(cleaned);
            collectedLength += cleaned.length + 1;

            if (collectedLength >= DERIVED_EXCERPT_LENGTH + 60) break;
        }

        const text = collected.join(" ").replace(/\s+/g, " ").trim();
        if (text.length <= DERIVED_EXCERPT_LENGTH) return text;

        const truncated = text.slice(0, DERIVED_EXCERPT_LENGTH);
        const lastSpace = truncated.lastIndexOf(" ");
        const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;

        return `${cut.trimEnd()}…`;
    }

    /**
     * Removes leading markdown block markers from a line.
     *
     * @param line - A single trimmed line
     * @returns The line without its leading heading, quote or bullet markers
     */
    private static stripLeadingMarkers(line: string): string {
        let index = 0;
        while (index < line.length) {
            const char = line[index];
            if (
                char === "#" ||
                char === ">" ||
                char === "-" ||
                char === "*" ||
                char === " "
            ) {
                index++;
                continue;
            }
            break;
        }
        return line.slice(index);
    }

    /**
     * Chooses between an author-supplied excerpt and a derived one.
     *
     * @param body - The markdown body
     * @param supplied - The author's excerpt, if any
     * @returns The excerpt to store, or null when the body yields nothing
     */
    private static resolveExcerpt(
        body: string,
        supplied?: string | null,
    ): string | null {
        const trimmed = supplied?.trim();
        if (trimmed !== undefined && trimmed.length > 0) {
            return trimmed.slice(0, MAX_EXCERPT_LENGTH);
        }

        const derived = Article.deriveExcerpt(body);
        return derived.length > 0 ? derived : null;
    }

    /** The article's unique identifier */
    get id(): string {
        return this.props.id!;
    }

    /** The URL-safe slug, immutable once assigned */
    get slug(): string {
        return this.props.slug;
    }

    /** The article title */
    get title(): string {
        return this.props.title;
    }

    /** The raw markdown body */
    get body(): string {
        return this.props.body;
    }

    /** The stored excerpt, if any */
    get excerpt(): string | null {
        return this.props.excerpt;
    }

    /** Storage key of the cover image, if any */
    get coverImageKey(): string | null {
        return this.props.coverImageKey;
    }

    /** Accessibility text for the cover image, if any */
    get coverImageAlt(): string | null {
        return this.props.coverImageAlt;
    }

    /** The current lifecycle state */
    get status(): ArticleStatus {
        return this.props.status;
    }

    /** Timestamp of the first publish, null while unpublished */
    get publishedAt(): Date | null {
        return this.props.publishedAt;
    }

    /** Estimated reading time in minutes */
    get readingTimeMinutes(): number {
        return this.props.readingTimeMinutes;
    }

    /** Author information */
    get author(): ArticleProps["author"] {
        return this.props.author;
    }

    /** Tag names attached to this article */
    get tags(): string[] {
        return this.props.tags;
    }

    /** Categories this article belongs to */
    get categories(): PostCategory[] {
        return this.props.categories;
    }

    /** Creation timestamp */
    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /** Last update timestamp */
    get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /** Cached like count */
    get likeCount(): number {
        return this.props.likeCount ?? 0;
    }

    /** Comment count, derived from a relation count at read time */
    get commentCount(): number {
        return this.props.commentCount ?? 0;
    }

    /** Whether the current viewer has liked this article */
    get isLiked(): boolean {
        return this.props.isLiked ?? false;
    }

    /** Whether the current viewer has bookmarked this article */
    get isBookmarked(): boolean {
        return this.props.isBookmarked ?? false;
    }

    /**
     * Whether the article is publicly readable.
     *
     * @returns True when the article is published
     */
    public isPublished(): boolean {
        return this.props.status === ArticleStatus.PUBLISHED;
    }

    /**
     * Whether the given user wrote this article.
     *
     * @param userId - The user to check
     * @returns True when the user is the author
     */
    public isAuthor(userId: string): boolean {
        return this.props.author.id === userId;
    }

    /**
     * Whether a viewer may read this article.
     *
     * Drafts and archived articles are visible to their author only. Callers
     * must translate a false result into a 404 rather than a 403 — confirming
     * that a draft slug exists is itself a leak.
     *
     * @param viewerId - The authenticated viewer, or undefined for a guest
     * @returns True when the article may be returned to this viewer
     */
    public isVisibleTo(viewerId?: string): boolean {
        if (this.isPublished()) return true;
        return viewerId !== undefined && this.isAuthor(viewerId);
    }

    /**
     * Whether a publish transition is currently legal.
     *
     * @returns True unless the article is already published
     */
    public canPublish(): boolean {
        return this.props.status !== ArticleStatus.PUBLISHED;
    }

    /**
     * Whether an archive transition is currently legal.
     *
     * @returns True only for a published article
     */
    public canArchive(): boolean {
        return this.props.status === ArticleStatus.PUBLISHED;
    }

    /**
     * Publishes the article.
     *
     * The publication timestamp is stamped only on the first publish, so
     * re-publishing an archived article keeps its original date.
     */
    public publish(): void {
        this.props.status = ArticleStatus.PUBLISHED;
        this.props.publishedAt ??= new Date();
        this.props.updatedAt = new Date();
    }

    /**
     * Archives the article, hiding it from everyone but its author while
     * keeping the slug reserved.
     */
    public archive(): void {
        this.props.status = ArticleStatus.ARCHIVED;
        this.props.updatedAt = new Date();
    }

    /**
     * Applies an author's edit.
     *
     * The slug is deliberately not recomputed: it is part of a published URL.
     * Reading time and a derived excerpt follow the body whenever it changes.
     *
     * @param changes - The fields to update; omitted fields are left untouched
     */
    public applyEdit(changes: {
        title?: string;
        body?: string;
        excerpt?: string | null;
        coverImageKey?: string | null;
        coverImageAlt?: string | null;
        tags?: string[];
        categories?: PostCategory[];
    }): void {
        if (changes.title !== undefined) this.props.title = changes.title;

        if (changes.body !== undefined) {
            this.props.body = changes.body;
            this.props.readingTimeMinutes = Article.calculateReadingTime(
                changes.body,
            );
        }

        if (changes.excerpt !== undefined) {
            this.props.excerpt = Article.resolveExcerpt(
                this.props.body,
                changes.excerpt,
            );
        } else if (changes.body !== undefined) {
            this.props.excerpt = Article.resolveExcerpt(
                this.props.body,
                this.props.excerpt,
            );
        }

        if (changes.coverImageKey !== undefined) {
            this.props.coverImageKey = changes.coverImageKey;
        }
        if (changes.coverImageAlt !== undefined) {
            this.props.coverImageAlt = changes.coverImageAlt;
        }
        if (changes.tags !== undefined) this.props.tags = changes.tags;
        if (changes.categories !== undefined) {
            this.props.categories = changes.categories;
        }

        this.props.updatedAt = new Date();
    }
}
