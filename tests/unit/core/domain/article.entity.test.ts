import { describe, it, expect } from "vitest";
import { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { buildArticle } from "../../helpers/mock-factories";

describe("Article entity", () => {
    describe("slugify()", () => {
        it("should lowercase, hyphenate and append the supplied suffix", () => {
            expect(Article.slugify("Hello Brave World", "1a2b3c4d")).toBe(
                "hello-brave-world-1a2b3c4d",
            );
        });

        it("should transliterate Turkish characters instead of dropping them", () => {
            expect(
                Article.slugify("Işık Hızında Sıralama Öğütleri", "deadbeef"),
            ).toBe("isik-hizinda-siralama-ogutleri-deadbeef");
        });

        it("should fold accented Latin characters to ASCII", () => {
            expect(Article.slugify("Café Naïve Résumé", "cafe0001")).toBe(
                "cafe-naive-resume-cafe0001",
            );
        });

        it("should collapse runs of punctuation into a single hyphen", () => {
            expect(Article.slugify("What?!  Really... yes", "0f0f0f0f")).toBe(
                "what-really-yes-0f0f0f0f",
            );
        });

        it("should not leave a leading or trailing hyphen on the base", () => {
            expect(Article.slugify("  --Hello--  ", "abcd1234")).toBe(
                "hello-abcd1234",
            );
        });

        it("should fall back to a static base when the title has no slug-able characters", () => {
            expect(Article.slugify("!!! ??? ###", "cafe0000")).toBe(
                "article-cafe0000",
            );
        });

        it("should cap the base so the slug stays within the route pattern length", () => {
            const slug = Article.slugify("a".repeat(300), "12345678");

            expect(slug).toBe(`${"a".repeat(80)}-12345678`);
            expect(slug.length).toBe(89);
        });

        it("should only ever emit characters the slug route pattern accepts", () => {
            const slug = Article.slugify(
                "Ünlü Yazılım Mühendisliği: 10 İpucu!",
                "9f8e7d6c",
            );

            expect(slug).toMatch(/^[a-z0-9-]+$/);
        });
    });

    describe("calculateReadingTime()", () => {
        it("should never return less than one minute", () => {
            expect(Article.calculateReadingTime("")).toBe(1);
            expect(Article.calculateReadingTime("tiny")).toBe(1);
        });

        it("should round up to the next whole minute", () => {
            const body = Array(201).fill("word").join(" ");

            expect(Article.calculateReadingTime(body)).toBe(2);
        });

        it("should treat any whitespace run as a single separator", () => {
            const body = Array(400).fill("word").join("\n\n   \t");

            expect(Article.calculateReadingTime(body)).toBe(2);
        });
    });

    describe("deriveExcerpt()", () => {
        it("should skip fenced code blocks", () => {
            const body = [
                "# Title",
                "",
                "```ts",
                "const secret = 42;",
                "```",
                "",
                "The actual prose.",
            ].join("\n");

            const excerpt = Article.deriveExcerpt(body);

            expect(excerpt).toContain("The actual prose.");
            expect(excerpt).not.toContain("secret");
        });

        it("should strip leading markdown block markers", () => {
            const body = "### Heading\n> quoted\n- bullet";

            expect(Article.deriveExcerpt(body)).toBe("Heading quoted bullet");
        });

        it("should truncate on a word boundary and append an ellipsis", () => {
            const body = Array(120).fill("alpha").join(" ");
            const excerpt = Article.deriveExcerpt(body);

            expect(excerpt.length).toBeLessThanOrEqual(201);
            expect(excerpt.endsWith("…")).toBe(true);
            expect(excerpt).not.toContain("alph…");
        });

        it("should return an empty string for a body with no prose", () => {
            expect(Article.deriveExcerpt("```\ncode only\n```")).toBe("");
        });
    });

    describe("create()", () => {
        it("should start as a draft with no publication date", () => {
            const article = Article.create({
                title: "My First Article",
                body: "Some words here.",
                authorId: "user-1",
                slugSuffix: "abcd1234",
            });

            expect(article.status).toBe(ArticleStatus.DRAFT);
            expect(article.publishedAt).toBeNull();
            expect(article.slug).toBe("my-first-article-abcd1234");
        });

        it("should derive reading time and excerpt from the body", () => {
            const article = Article.create({
                title: "Derived",
                body: Array(400).fill("word").join(" "),
                authorId: "user-1",
                slugSuffix: "abcd1234",
            });

            expect(article.readingTimeMinutes).toBe(2);
            expect(article.excerpt).toContain("word");
        });

        it("should prefer an author-supplied excerpt over the derived one", () => {
            const article = Article.create({
                title: "Supplied",
                body: "Body prose that would otherwise be summarized.",
                authorId: "user-1",
                slugSuffix: "abcd1234",
                excerpt: "  Hand written summary  ",
            });

            expect(article.excerpt).toBe("Hand written summary");
        });

        it("should ignore a blank author excerpt and derive instead", () => {
            const article = Article.create({
                title: "Blank",
                body: "Real prose.",
                authorId: "user-1",
                slugSuffix: "abcd1234",
                excerpt: "   ",
            });

            expect(article.excerpt).toBe("Real prose.");
        });

        it("should default the optional collections to empty", () => {
            const article = Article.create({
                title: "Defaults",
                body: "Body.",
                authorId: "user-1",
                slugSuffix: "abcd1234",
            });

            expect(article.tags).toEqual([]);
            expect(article.categories).toEqual([]);
            expect(article.coverImageKey).toBeNull();
            expect(article.coverImageAlt).toBeNull();
        });

        it("should store the markdown body byte for byte", () => {
            const body = '# Title\n\n<script>alert("xss")</script>\n\n[l](u)';
            const article = Article.create({
                title: "Raw",
                body,
                authorId: "user-1",
                slugSuffix: "abcd1234",
            });

            expect(article.body).toBe(body);
        });
    });

    describe("isVisibleTo()", () => {
        it("should hide a draft from guests and from other users", () => {
            const draft = buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: "author-1" },
            });

            expect(draft.isVisibleTo()).toBe(false);
            expect(draft.isVisibleTo("someone-else")).toBe(false);
        });

        it("should show a draft to its author", () => {
            const draft = buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: "author-1" },
            });

            expect(draft.isVisibleTo("author-1")).toBe(true);
        });

        it("should show a published article to everyone", () => {
            const published = buildArticle({
                status: ArticleStatus.PUBLISHED,
                author: { id: "author-1" },
            });

            expect(published.isVisibleTo()).toBe(true);
            expect(published.isVisibleTo("someone-else")).toBe(true);
        });

        it("should hide an archived article from everyone but its author", () => {
            const archived = buildArticle({
                status: ArticleStatus.ARCHIVED,
                author: { id: "author-1" },
            });

            expect(archived.isVisibleTo("someone-else")).toBe(false);
            expect(archived.isVisibleTo("author-1")).toBe(true);
        });
    });

    describe("publish() and archive()", () => {
        it("should stamp the publication date on first publish", () => {
            const article = buildArticle({ status: ArticleStatus.DRAFT });

            article.publish();

            expect(article.status).toBe(ArticleStatus.PUBLISHED);
            expect(article.publishedAt).toBeInstanceOf(Date);
        });

        it("should keep the original publication date when re-published", () => {
            const article = buildArticle({ status: ArticleStatus.DRAFT });
            article.publish();
            const firstPublishedAt = article.publishedAt;

            article.archive();
            article.publish();

            expect(article.publishedAt?.getTime()).toBe(
                firstPublishedAt?.getTime(),
            );
        });

        it("should report the legal transitions for each state", () => {
            const draft = buildArticle({ status: ArticleStatus.DRAFT });
            const published = buildArticle({ status: ArticleStatus.PUBLISHED });
            const archived = buildArticle({ status: ArticleStatus.ARCHIVED });

            expect(draft.canPublish()).toBe(true);
            expect(draft.canArchive()).toBe(false);
            expect(published.canPublish()).toBe(false);
            expect(published.canArchive()).toBe(true);
            expect(archived.canPublish()).toBe(true);
            expect(archived.canArchive()).toBe(false);
        });
    });

    describe("applyEdit()", () => {
        it("should never change the slug", () => {
            const article = buildArticle({ slug: "original-slug-1a2b3c4d" });

            article.applyEdit({ title: "A Completely Different Title" });

            expect(article.slug).toBe("original-slug-1a2b3c4d");
            expect(article.title).toBe("A Completely Different Title");
        });

        it("should recompute reading time when the body changes", () => {
            const article = buildArticle({ readingTimeMinutes: 1 });

            article.applyEdit({ body: Array(600).fill("word").join(" ") });

            expect(article.readingTimeMinutes).toBe(3);
        });

        it("should leave untouched fields alone", () => {
            const article = buildArticle({
                title: "Keep me",
                coverImageKey: "articles/covers/user-1/abc.png",
                tags: ["typescript"],
            });

            article.applyEdit({ body: "New body." });

            expect(article.title).toBe("Keep me");
            expect(article.coverImageKey).toBe(
                "articles/covers/user-1/abc.png",
            );
            expect(article.tags).toEqual(["typescript"]);
        });

        it("should replace tags and categories when supplied", () => {
            const article = buildArticle({ tags: ["old"] });

            article.applyEdit({
                tags: ["fastify", "prisma"],
                categories: [PostCategory.BACKEND],
            });

            expect(article.tags).toEqual(["fastify", "prisma"]);
            expect(article.categories).toEqual([PostCategory.BACKEND]);
        });

        it("should allow clearing the cover image", () => {
            const article = buildArticle({
                coverImageKey: "articles/covers/user-1/abc.png",
            });

            article.applyEdit({ coverImageKey: null });

            expect(article.coverImageKey).toBeNull();
        });
    });
});
