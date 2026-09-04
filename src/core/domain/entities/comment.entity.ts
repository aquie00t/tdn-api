/**
 * Comment entity representing a user comment on a post or an article
 * Supports nested comments through optional parent-child relationships
 */
import { MediaModerationStatus } from "@core/domain/enums";
import type { CommentProps } from "@core/domain/interfaces/comment-props.interface";
import type { MentionedUser } from "@core/domain/interfaces/mentioned-user.interface";
import type { CommentTarget } from "@core/ports/repositories/comment.repository";

export class Comment {
    /**
     * Private constructor to enforce creation through factory methods
     * @param props - Comment properties
     */
    private constructor(private readonly props: CommentProps) {}

    /**
     * Gets the unique identifier of the comment
     * @returns The comment ID
     */
    public get id(): string {
        return this.props.id!;
    }

    /**
     * Gets the content of the comment
     * @returns The comment text content
     */
    public get content(): string {
        return this.props.content;
    }

    /**
     * Gets the media URLs attached to the comment
     * @returns Array of media URL strings, or an empty array if none exist
     */
    public get mediaUrls(): string[] {
        return this.props.mediaUrls || [];
    }

    /**
     * Whether moderation judged the attached media borderline
     * @returns True when the client should blur the media behind a tap
     */
    public get isSensitive(): boolean {
        return this.props.isSensitive ?? false;
    }

    /**
     * Moderation state of the comment's own media
     * @returns The stored status, defaulting to APPROVED for a text-only comment
     */
    public get mediaStatus(): MediaModerationStatus {
        return this.props.mediaStatus ?? MediaModerationStatus.APPROVED;
    }

    /**
     * Whether the read path may serve this comment's media URLs.
     *
     * A comment whose video has not been cleared is still served - the text
     * was never in question - but its media is held back until a verdict
     * exists.
     *
     * @returns True once the attached media has been cleared
     */
    public get isMediaServable(): boolean {
        return this.mediaStatus === MediaModerationStatus.APPROVED;
    }

    /**
     * Gets the ID of the post this comment belongs to
     * @returns The post ID, or null when the comment belongs to an article
     */
    public get postId(): string | null {
        return this.props.postId;
    }

    /**
     * Gets the ID of the article this comment belongs to
     * @returns The article ID, or null when the comment belongs to a post
     */
    public get articleId(): string | null {
        return this.props.articleId;
    }

    /**
     * Gets what this comment is attached to.
     *
     * Callers branch on this rather than on which id happens to be null, so the
     * two-nullable-columns representation stays inside the entity.
     *
     * @returns The comment target
     */
    public get target(): CommentTarget {
        return this.props.postId !== null
            ? { type: "POST", id: this.props.postId }
            : { type: "ARTICLE", id: this.props.articleId as string };
    }

    /**
     * Gets the ID of the user who authored this comment
     * @returns The author user ID
     */
    public get authorId(): string {
        return this.props.authorId;
    }

    /**
     * Gets the ID of the parent comment if this is a nested comment
     * @returns Parent comment ID or null if this is a top-level comment
     */
    public get parentId(): string | null {
        return this.props.parentId;
    }

    /**
     * Gets the creation timestamp of the comment
     * @returns The creation date
     */
    public get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Gets the last update timestamp of the comment
     * @returns The last update date
     */
    public get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /**
     * Factory method to create a new comment on a post.
     *
     * Retained as a delegate to createForPost so existing post comment code
     * and its tests keep working unchanged.
     *
     * @param content - The text content of the comment
     * @param postId - The ID of the post this comment belongs to
     * @param authorId - The ID of the user who authored this comment
     * @param parentId - Optional parent comment ID for nested comments
     * @param mediaUrls - Optional array of media URLs attached to the comment
     * @returns A new Comment instance
     */
    public static create(
        content: string,
        postId: string,
        authorId: string,
        parentId: string | null = null,
        mediaUrls: string[] = [],
    ): Comment {
        return Comment.createForPost(
            content,
            postId,
            authorId,
            parentId,
            mediaUrls,
        );
    }

    /**
     * Factory method to create a comment on a post
     * @param content - The text content of the comment
     * @param postId - The ID of the post this comment belongs to
     * @param authorId - The ID of the user who authored this comment
     * @param parentId - Optional parent comment ID for nested comments
     * @param mediaUrls - Optional array of media URLs attached to the comment
     * @param isSensitive - Whether moderation judged the media borderline
     * @param mediaStatus - Moderation state of the attached media
     * @param mentions - The users named with an @handle in the content
     * @returns A new Comment instance targeting a post
     */
    public static createForPost(
        content: string,
        postId: string,
        authorId: string,
        parentId: string | null = null,
        mediaUrls: string[] = [],
        isSensitive = false,
        mediaStatus: MediaModerationStatus = MediaModerationStatus.APPROVED,
        mentions: MentionedUser[] = [],
    ): Comment {
        return new Comment({
            content,
            postId,
            articleId: null,
            authorId,
            parentId,
            mediaUrls,
            isSensitive,
            mediaStatus,
            mentions,
        });
    }

    /**
     * Factory method to create a comment on an article
     * @param content - The text content of the comment
     * @param articleId - The ID of the article this comment belongs to
     * @param authorId - The ID of the user who authored this comment
     * @param parentId - Optional parent comment ID for nested comments
     * @param mediaUrls - Optional array of media URLs attached to the comment
     * @param isSensitive - Whether moderation judged the media borderline
     * @param mediaStatus - Moderation state of the attached media
     * @param mentions - The users named with an @handle in the content
     * @returns A new Comment instance targeting an article
     */
    public static createForArticle(
        content: string,
        articleId: string,
        authorId: string,
        parentId: string | null = null,
        mediaUrls: string[] = [],
        isSensitive = false,
        mediaStatus: MediaModerationStatus = MediaModerationStatus.APPROVED,
        mentions: MentionedUser[] = [],
    ): Comment {
        return new Comment({
            content,
            postId: null,
            articleId,
            authorId,
            parentId,
            mediaUrls,
            isSensitive,
            mediaStatus,
            mentions,
        });
    }

    /**
     * Gets the author details of the comment
     * @returns An object containing the author's id and optional profile fields,
     *          or undefined if author data is not populated
     */
    public get author():
        | {
              id: string;
              username: string;
              avatarUrl?: string;
              fullName?: string;
          }
        | undefined {
        return this.props.author;
    }

    /**
     * Gets the users mentioned in the comment content
     * @returns Array of mentioned users, empty when the comment names nobody
     */
    public get mentions(): MentionedUser[] {
        return this.props.mentions ?? [];
    }

    /**
     * Gets the total number of likes on the comment
     * @returns The like count, or 0 if not set
     */
    public get likeCount(): number {
        return this.props.likeCount || 0;
    }

    /**
     * Gets the total number of replies to the comment
     * @returns The reply count, or 0 if not set
     */
    public get replyCount(): number {
        return this.props.replyCount || 0;
    }

    /**
     * Indicates whether the current user has liked the comment
     * @returns True if the comment is liked by the current user, false otherwise
     */
    public get isLiked(): boolean {
        return this.props.isLiked || false;
    }

    /**
     * Indicates whether the current user has bookmarked the comment
     * @returns True if the comment is bookmarked by the current user, false otherwise
     */
    public get isBookmarked(): boolean {
        return this.props.isBookmarked || false;
    }

    /**
     * Factory method to create a comment from existing properties
     * @param props - Comment properties including optional ID and timestamps
     * @returns A Comment instance with the provided properties
     */
    public static with(props: CommentProps): Comment {
        return new Comment(props);
    }
}
