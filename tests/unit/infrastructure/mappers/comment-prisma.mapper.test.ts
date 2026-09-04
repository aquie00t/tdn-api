import { describe, expect, it } from "vitest";
import {
    CommentPrismaMapper,
    type CommentWithRelations,
} from "@infrastructure/persistence/mappers/comment-prisma.mapper";
import { Comment } from "@core/domain/entities/comment.entity";
import { MediaModerationStatus } from "@core/domain/enums";

const CDN = "https://cdn.example.com";
const now = new Date("2025-01-01T00:00:00.000Z");

function makeDbComment(
    overrides: Partial<CommentWithRelations> = {},
): CommentWithRelations {
    return {
        id: "comment-1",
        content: "Test comment",
        postId: "post-1",
        authorId: "user-1",
        parentId: null,
        mediaUrls: [],
        likeCount: 0,
        replyCount: 0,
        createdAt: now,
        updatedAt: now,
        author: {
            id: "user-1",
            username: "testuser",
            profile: { avatarUrl: "uploads/avatar.jpg", fullName: "Test User" },
        },
        mentionedUsers: [{ id: "user-2", username: "ada" }],
        likes: [],
        bookmarks: [],
        isSensitive: false,
        mediaStatus: MediaModerationStatus.APPROVED,
        ...overrides,
    } as unknown as CommentWithRelations;
}

describe("CommentPrismaMapper", () => {
    describe("mentions", () => {
        it("should map the mentioned users onto the entity", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());

            expect(comment.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });

        it("should read a comment that mentions nobody as an empty list", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ mentionedUsers: [] }),
            );

            expect(comment.mentions).toEqual([]);
        });

        it("should serve the mentions as id and handle pairs", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });
    });

    describe("toDomainComment", () => {
        it("should map all base fields correctly", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());

            expect(comment.id).toBe("comment-1");
            expect(comment.content).toBe("Test comment");
            expect(comment.postId).toBe("post-1");
            expect(comment.authorId).toBe("user-1");
            expect(comment.createdAt).toBe(now);
        });

        it("should set parentId to null for top-level comments", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());

            expect(comment.parentId).toBeNull();
        });

        it("should set parentId for nested replies", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ parentId: "comment-0" }),
            );

            expect(comment.parentId).toBe("comment-0");
        });

        it("should set isLiked true when likes array is non-empty", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ likes: [{ id: "l1" }] as never }),
            );

            expect(comment.isLiked).toBe(true);
        });

        it("should set isLiked false when likes array is empty", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());

            expect(comment.isLiked).toBe(false);
        });

        it("should set isBookmarked true when bookmarks array is non-empty", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ bookmarks: [{ id: "b1" }] as never }),
            );

            expect(comment.isBookmarked).toBe(true);
        });

        it("should map author relations safely when profile is null", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: null,
                    } as never,
                }),
            );

            expect(comment.author?.avatarUrl).toBeUndefined();
            expect(comment.author?.fullName).toBeUndefined();
        });
    });

    describe("toResponse — CDN URL normalization", () => {
        it("should prefix storage path with CDN URL", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.avatarUrl).toBe(`${CDN}/uploads/avatar.jpg`);
        });

        it("should not double-prefix when avatarUrl is already an http URL", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: {
                            avatarUrl: "https://github.com/avatar.jpg",
                            fullName: null,
                        },
                    },
                }),
            );
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.avatarUrl).toBe(
                "https://github.com/avatar.jpg",
            );
        });

        it("should append ?v=1 for default_profile avatars", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
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
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.avatarUrl).toBe(
                `${CDN}/default_profile/avatar.jpg?v=1`,
            );
        });

        it("should fall back to default-avatar.png when avatarUrl is undefined", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
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
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.avatarUrl).toBe(`${CDN}/default-avatar.png`);
        });

        it("should set isMe true when currentUserId matches author", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());
            const result = CommentPrismaMapper.toResponse(
                comment,
                CDN,
                "user-1",
            );

            expect(result.author.isMe).toBe(true);
        });

        it("should set isMe false when currentUserId is not provided", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.isMe).toBe(false);
        });

        it("should map fullName as undefined when null", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
                    author: {
                        id: "user-1",
                        username: "testuser",
                        profile: { avatarUrl: "uploads/a.jpg", fullName: null },
                    },
                }),
            );
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.author.fullName).toBeUndefined();
        });
    });

    describe("toListResponse", () => {
        it("should map an array of comments using toResponse", () => {
            const comments = [
                CommentPrismaMapper.toDomainComment(makeDbComment()),
                CommentPrismaMapper.toDomainComment(
                    makeDbComment({ id: "comment-2", content: "Reply" }),
                ),
            ];
            const results = CommentPrismaMapper.toListResponse(comments, CDN);

            expect(results).toHaveLength(2);
            expect(results[0].id).toBe("comment-1");
            expect(results[1].id).toBe("comment-2");
        });

        it("should return empty array for empty input", () => {
            expect(CommentPrismaMapper.toListResponse([], CDN)).toEqual([]);
        });
    });

    describe("author handle guarantee", () => {
        it("should serialize the author handle", () => {
            const comment =
                CommentPrismaMapper.toDomainComment(makeDbComment());

            expect(
                CommentPrismaMapper.toResponse(comment, CDN).author.username,
            ).toBe("testuser");
        });

        it("should throw rather than serialize a comment with no author", () => {
            // Reachable only if a new query forgets the author include. The
            // response schema declares username required, so emitting the key
            // as undefined would break the contract silently.
            const comment = Comment.createForPost(
                "content",
                "post-1",
                "user-1",
                null,
                [],
            );

            expect(() => CommentPrismaMapper.toResponse(comment, CDN)).toThrow(
                /loaded with its author/,
            );
        });
    });
    describe("moderated media", () => {
        const MEDIA = ["https://cdn.example.com/posts/user-1/clip.mp4"];

        it("should serve media once it has been cleared", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ mediaUrls: MEDIA } as never),
            );
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.mediaUrls).toEqual(MEDIA);
            expect(result.mediaPending).toBe(false);
            expect(result.isSensitive).toBe(false);
        });

        it("should withhold unscanned media but keep the text", () => {
            // Comment media comes off the same upload endpoint as post media,
            // so it is withheld on the same terms.
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({
                    mediaUrls: MEDIA,
                    mediaStatus: MediaModerationStatus.PENDING,
                } as never),
            );
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.mediaUrls).toEqual([]);
            expect(result.mediaPending).toBe(true);
            expect(result.content).toBe("Test comment");
        });

        it("should serve borderline media with the sensitive flag set", () => {
            const comment = CommentPrismaMapper.toDomainComment(
                makeDbComment({ mediaUrls: MEDIA, isSensitive: true } as never),
            );
            const result = CommentPrismaMapper.toResponse(comment, CDN);

            expect(result.mediaUrls).toEqual(MEDIA);
            expect(result.isSensitive).toBe(true);
        });
    });
});
