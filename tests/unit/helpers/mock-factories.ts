import { vi } from "vitest";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import { User } from "@core/domain/entities/user.entity";
import type { UserProps } from "@core/domain/interfaces/user-props.interface";
import { RefreshToken } from "@core/domain/entities/refresh-token.entity";
import type { RefreshTokenProps } from "@core/domain/interfaces/refresh-token.props.interface";
import { VerificationToken } from "@core/domain/entities/verification-token.entity";
import type { VerificationTokenProps } from "@core/domain/interfaces/verification-token.props.interface";
import { Comment } from "@core/domain/entities/comment.entity";
import type { CommentProps } from "@core/domain/interfaces/comment-props.interface";
import { Profile } from "@core/domain/entities/profile.entity";
import type { ProfileProps } from "@core/domain/interfaces/profile-props.interface";
import { Notification } from "@core/domain/entities/notification.entity";
import type { NotificationProps } from "@core/domain/interfaces/notification-props.interface";
import { Post } from "@core/domain/entities/post.entity";
import type { PostProps } from "@core/domain/interfaces/post-props.interface";
import { TokenType } from "@core/domain/enums/token-type.enum";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { PostType } from "@core/domain/enums/post-type.enum";
import { Article } from "@core/domain/entities/article.entity";
import type { ArticleProps } from "@core/domain/interfaces/article-props.interface";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";

export function buildUser(overrides: Partial<UserProps> = {}): User {
    return User.with({
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        passwordHash: "hashed_password",
        isEmailVerified: true,
        isBot: false,
        deletedAt: null,
        bannedAt: null,
        digestOptOutAt: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildVerificationToken(
    overrides: Partial<VerificationTokenProps> = {},
): VerificationToken {
    return VerificationToken.with({
        id: "vtoken-1",
        tokenHash: "hashed_otp",
        userId: "user-1",
        type: TokenType.EMAIL_VERIFICATION,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildRefreshToken(
    overrides: Partial<RefreshTokenProps> = {},
): RefreshToken {
    return RefreshToken.with({
        id: "token-1",
        tokenHash: "hashed_token",
        userId: "user-1",
        deviceIp: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildComment(overrides: Partial<CommentProps> = {}): Comment {
    return Comment.with({
        id: "comment-1",
        content: "Test comment",
        postId: "post-1",
        articleId: null,
        authorId: "user-1",
        parentId: null,
        mentions: [],
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildProfile(overrides: Partial<ProfileProps> = {}): Profile {
    return Profile.with({
        id: "profile-1",
        userId: "user-1",
        username: "testuser",
        fullName: "Test User",
        bio: null,
        location: null,
        avatarUrl: "https://example.com/avatar.png",
        bannerUrl: "https://example.com/banner.png",
        socials: null,
        categories: [],
        languages: [],
        followersCount: 0,
        followingCount: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildNotification(
    overrides: Partial<NotificationProps> = {},
): Notification {
    return Notification.with({
        recipientId: "user-1",
        issuerId: "user-2",
        type: NotificationType.FOLLOW,
        referenceId: undefined,
        username: "issuer",
        avatarUrl: undefined,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        isRead: false,
        ...overrides,
    });
}

export function buildPost(overrides: Partial<PostProps> = {}): Post {
    return Post.with({
        id: "post-1",
        content: "Test post content",
        type: PostType.COMMUNITY,
        mediaUrls: [],
        author: {
            id: "user-1",
            username: "testuser",
        },
        tags: [],
        mentions: [],
        categories: [],
        likeCount: 0,
        commentCount: 0,
        isLiked: false,
        isBookmarked: false,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

export function buildArticle(overrides: Partial<ArticleProps> = {}): Article {
    return Article.with({
        id: "article-1",
        slug: "test-article-1a2b3c4d",
        title: "Test article",
        body: "# Heading\n\nSome markdown body for tests.",
        excerpt: "Some markdown body for tests.",
        coverImageKey: null,
        coverImageAlt: null,
        status: ArticleStatus.DRAFT,
        publishedAt: null,
        readingTimeMinutes: 1,
        author: {
            id: "user-1",
            username: "testuser",
        },
        tags: [],
        mentions: [],
        categories: [],
        likeCount: 0,
        commentCount: 0,
        isLiked: false,
        isBookmarked: false,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    });
}

/**
 * A block repository that blocks nobody.
 *
 * Almost every use case now asks this port a question, and almost every test
 * wants the same answer: no block stands, carry on. Building it here keeps
 * that default in one place, so a test that cares about blocking overrides one
 * method and a test that does not says nothing about it at all.
 *
 * @param overrides - Methods to replace, for the tests that do care.
 * @returns A fully stubbed IBlockRepository.
 */
export function buildBlockRepository(
    overrides: Partial<IBlockRepository> = {},
): IBlockRepository {
    return {
        block: vi.fn().mockResolvedValue(true),
        unblock: vi.fn().mockResolvedValue(true),
        existsBetween: vi.fn().mockResolvedValue(false),
        findPairState: vi
            .fn()
            .mockResolvedValue({ isBlocked: false, isBlockedBy: false }),
        getInvisibleUserIds: vi.fn().mockResolvedValue([]),
        listBlocked: vi.fn().mockResolvedValue([]),
        countBlocked: vi.fn().mockResolvedValue(0),
        ...overrides,
    };
}
