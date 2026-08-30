import { describe, expect, it } from "vitest";
import {
    PostPrismaMapper,
    type PostWithRelations,
} from "@infrastructure/persistence/mappers/post-prisma.mapper";
import { Post } from "@core/domain/entities/post.entity";
import { PostType } from "@core/domain/enums/post-type.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";

const CDN = "https://cdn.example.com";
const now = new Date("2025-01-01T00:00:00.000Z");

function makeDbPost(
    overrides: Partial<PostWithRelations> = {},
): PostWithRelations {
    return {
        id: "post-1",
        content: "Hello world",
        type: PostType.COMMUNITY,
        mediaUrls: [],
        authorId: "user-1",
        category: [],
        likeCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        author: {
            id: "user-1",
            username: "testuser",
            profile: { avatarUrl: "uploads/avatar.jpg", fullName: "Test User" },
        },
        tags: [
            { id: "t1", name: "typescript", postId: "post-1", createdAt: now },
        ],
        likes: [],
        bookmarks: [],
        ...overrides,
    } as unknown as PostWithRelations;
}

describe("PostPrismaMapper", () => {
    describe("toDomainPost", () => {
        it("should map all base fields correctly", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(post.id).toBe("post-1");
            expect(post.content).toBe("Hello world");
            expect(post.type).toBe(PostType.COMMUNITY);
            expect(post.createdAt).toBe(now);
        });

        it("should map DB category (singular) to entity categories (plural)", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({ category: [PostCategory.FRONTEND] }),
            );

            expect(post.categories).toEqual([PostCategory.FRONTEND]);
        });

        it("should map tags array to name strings", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(post.tags).toEqual(["typescript"]);
        });

        it("should set isLiked true when likes array is non-empty", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    likes: [
                        {
                            id: "l1",
                            userId: "user-2",
                            postId: "post-1",
                            createdAt: now,
                        },
                    ] as never,
                }),
            );

            expect(post.isLiked).toBe(true);
        });

        it("should set isLiked false when likes array is empty", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({ likes: [] }),
            );

            expect(post.isLiked).toBe(false);
        });

        it("should set isBookmarked true when bookmarks array is non-empty", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    bookmarks: [
                        {
                            id: "b1",
                            userId: "user-2",
                            postId: "post-1",
                            createdAt: now,
                        },
                    ] as never,
                }),
            );

            expect(post.isBookmarked).toBe(true);
        });

        it("should carry the author handle through, since the column is NOT NULL", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: null,
                    } as never,
                }),
            );

            expect(post.author.id).toBe("user-1");
            expect(post.author.username).toBe("testuser");
        });

        it("should leave avatarUrl undefined when the user has no profile", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: null,
                    } as never,
                }),
            );

            expect(post.author.avatarUrl).toBeUndefined();
        });
    });

    describe("toPrismaPost", () => {
        it("should map content, type, mediaUrls, authorId, categories", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({ category: [PostCategory.BACKEND] }),
            );
            const result = PostPrismaMapper.toPrismaPost(post);

            expect(result.content).toBe("Hello world");
            expect(result.type).toBe(PostType.COMMUNITY);
            expect(result.authorId).toBe("user-1");
            expect(result.category).toEqual([PostCategory.BACKEND]);
        });

        it("should not include tags, likeCount or commentCount", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());
            const result = PostPrismaMapper.toPrismaPost(post);

            expect(result).not.toHaveProperty("tags");
            expect(result).not.toHaveProperty("likeCount");
            expect(result).not.toHaveProperty("commentCount");
        });
    });

    describe("toResponse — CDN URL normalization", () => {
        it("should prefix storage path with CDN URL", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.author.avatarUrl).toBe(`${CDN}/uploads/avatar.jpg`);
        });

        it("should not double-prefix when avatarUrl is already an http URL", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: {
                            avatarUrl:
                                "https://lh3.googleusercontent.com/photo.jpg",
                            fullName: null,
                        },
                    },
                }),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.author.avatarUrl).toBe(
                "https://lh3.googleusercontent.com/photo.jpg",
            );
        });

        it("should append ?v=1 for default_profile avatars", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: {
                            avatarUrl: "default_profile/avatar.jpg",
                            fullName: null,
                        },
                    },
                }),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.author.avatarUrl).toBe(
                `${CDN}/default_profile/avatar.jpg?v=1`,
            );
        });

        it("should fall back to default-avatar.png when avatarUrl is undefined", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: {
                            avatarUrl: undefined as never,
                            fullName: null,
                        },
                    },
                }),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.author.avatarUrl).toBe(`${CDN}/default-avatar.png`);
        });

        it("should set isMe true when currentUserId matches author", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());
            const result = PostPrismaMapper.toResponse(post, CDN, "user-1");

            expect(result.author.isMe).toBe(true);
        });

        it("should set isMe false when currentUserId differs from author", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());
            const result = PostPrismaMapper.toResponse(post, CDN, "user-99");

            expect(result.author.isMe).toBe(false);
        });

        it("should set isMe false when currentUserId is not provided", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.author.isMe).toBe(false);
        });

        it("should map tags and categories to name objects", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({ category: [PostCategory.FRONTEND] }),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.tags).toEqual([{ name: "typescript" }]);
            expect(result.categories).toEqual([
                { name: PostCategory.FRONTEND },
            ]);
        });
    });

    describe("toFeedResponse", () => {
        it("should map an array of posts using toResponse", () => {
            const posts = [
                PostPrismaMapper.toDomainPost(makeDbPost()),
                PostPrismaMapper.toDomainPost(
                    makeDbPost({ id: "post-2", content: "Second" }),
                ),
            ];
            const results = PostPrismaMapper.toFeedResponse(posts, CDN);

            expect(results).toHaveLength(2);
            expect(results[0].id).toBe("post-1");
            expect(results[1].id).toBe("post-2");
        });

        it("should return empty array for empty input", () => {
            expect(PostPrismaMapper.toFeedResponse([], CDN)).toEqual([]);
        });
    });

    describe("author handle guarantee", () => {
        it("should serialize the author handle", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(PostPrismaMapper.toResponse(post, CDN).author.username).toBe(
                "testuser",
            );
        });

        it("should throw rather than serialize a post with no author handle", () => {
            // Reachable only if a new query forgets the author include. The
            // response schema declares username required, so emitting the key
            // as undefined would break the contract silently.
            const post = Post.create(
                "content",
                PostType.COMMUNITY,
                "user-1",
                [],
                [],
            );

            expect(() => PostPrismaMapper.toResponse(post, CDN)).toThrow(
                /loaded with its author/,
            );
        });
    });

    describe("quote posts", () => {
        const quotedRelation = {
            id: "post-0",
            content: "The quoted post",
            mediaUrls: ["uploads/quoted.png"],
            createdAt: now,
            authorId: "user-9",
            author: {
                id: "user-9",
                username: "quoted-author",
                profile: {
                    avatarUrl: "uploads/quoted-avatar.jpg",
                    fullName: "Quoted Author",
                },
            },
        };

        it("should map the quoted relation onto the entity", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    quotedPostId: "post-0",
                    quotedPost: quotedRelation,
                } as never),
            );

            expect(post.isQuote()).toBe(true);
            expect(post.quotedPostId).toBe("post-0");
            expect(post.quotedPost?.content).toBe("The quoted post");
            expect(post.quotedPost?.author.username).toBe("quoted-author");
        });

        it("should leave the entity without a quote when nothing is quoted", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(post.isQuote()).toBe(false);
            expect(post.quotedPost).toBeUndefined();
        });

        it("should carry quotedPostId through to the Prisma payload", () => {
            const quote = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    quotedPostId: "post-0",
                    quotedPost: quotedRelation,
                } as never),
            );
            const plain = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(PostPrismaMapper.toPrismaPost(quote).quotedPostId).toBe(
                "post-0",
            );
            expect(PostPrismaMapper.toPrismaPost(plain).quotedPostId).toBeNull();
        });

        it("should render the quote card with a CDN-resolved avatar", () => {
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    quotedPostId: "post-0",
                    quotedPost: quotedRelation,
                } as never),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.quotedPost).toEqual({
                id: "post-0",
                content: "The quoted post",
                mediaUrls: ["uploads/quoted.png"],
                createdAt: now,
                author: {
                    id: "user-9",
                    username: "quoted-author",
                    avatarUrl: `${CDN}/uploads/quoted-avatar.jpg`,
                    fullName: "Quoted Author",
                },
            });
        });

        it("should send quotedPost as null for a post that quotes nothing", () => {
            const post = PostPrismaMapper.toDomainPost(makeDbPost());

            expect(PostPrismaMapper.toResponse(post, CDN).quotedPost).toBeNull();
        });

        it("should not nest a second level of quotes in the card", () => {
            // The include stops at one level, so a quote of a quote carries the
            // post it quotes and nothing behind it.
            const post = PostPrismaMapper.toDomainPost(
                makeDbPost({
                    quotedPostId: "post-0",
                    quotedPost: quotedRelation,
                } as never),
            );
            const result = PostPrismaMapper.toResponse(post, CDN);

            expect(result.quotedPost).not.toHaveProperty("quotedPost");
        });
    });
});
