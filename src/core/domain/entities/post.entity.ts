import type { PostType } from "@core/domain/enums/post-type.enum";
import type { PostProps } from "@core/domain/interfaces/post-props.interface";
import type { PostCategory } from "../enums/post-category-enum";
import type { QuotedPostSnapshot } from "../interfaces/quoted-post.interface";

/**
 * Rich domain model for Post entity
 *
 * Encapsulates both data and business logic related to posts.
 * Posts are the main content entities in the application that users
 * can create, share, and interact with through likes and comments.
 *
 * This entity follows domain-driven design principles by encapsulating
 * business logic and validation within the entity itself.
 */
export class Post {
    private constructor(private readonly props: PostProps) {}

    /**
     * Creates a new instance of the Post entity.
     *
     * @param content - The textual content of the post.
     * @param type - The type of the post (e.g., article, image, etc.).
     * @param authorId - The unique identifier of the post's author.
     * @param mediaUrls - Optional. An array of media URLs associated with the post. Defaults to an empty array.
     * @param categories - Optional. An array of categories assigned to the post. Defaults to an empty array.
     * @param quotedPostId - Optional. The id of the post this one quotes.
     * @returns A new Post instance with the specified properties.
     */
    public static create(
        content: string,
        type: PostType,
        authorId: string,
        mediaUrls: string[] = [],
        categories: PostCategory[] = [],
        quotedPostId?: string,
    ): Post {
        return new Post({
            content,
            type,
            mediaUrls,
            author: { id: authorId },
            tags: [],
            categories,
            quotedPostId,
        });
    }

    public static with(props: PostProps): Post {
        return new Post(props);
    }

    /**
     * Get the unique identifier of the post
     * @returns The post ID or undefined if not set
     */
    get id(): string {
        return this.props.id!;
    }

    /**
     * Get the content of the post
     * @returns The post content text
     */
    get content(): string {
        return this.props.content;
    }

    /**
     * Get the type of the post
     * @returns The post type enum value
     */
    get type(): PostType {
        return this.props.type;
    }

    /**
     * Get the media URLs associated with the post
     * @returns Array of media URLs (images, videos, etc.)
     */
    get mediaUrls(): string[] {
        return this.props.mediaUrls;
    }

    /**
     * Get the author information of the post
     * @returns Object containing author ID and optional display details
     */
    get author(): {
        id: string;
        username?: string;
        avatarUrl?: string;
        fullName?: string;
    } {
        return this.props.author;
    }

    /**
     * Get the tags associated with the post
     * @returns Array of tags for categorization and discovery
     */
    get tags(): string[] {
        return this.props.tags;
    }

    /**
     * Get the creation date of the post
     * @returns The creation timestamp
     */
    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Get the last update date of the post
     * @returns The last update timestamp
     */
    get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /**
     * Get the like count of the post
     * @returns The number of likes the post has received
     */
    get likeCount(): number {
        return this.props.likeCount || 0;
    }

    /**
     * Get the comment count of the post
     * @returns The number of comments the post has received
     */
    get commentCount(): number {
        return this.props.commentCount!;
    }

    /**
     * Indicates whether the current user has bookmarked the post
     * @returns True if the post is bookmarked by the current user, false otherwise
     */
    get isBookmarked(): boolean {
        return this.props.isBookmarked ?? false;
    }

    /**
     * Indicates whether the current user has liked the post
     * @returns True if the post is liked by the current user, false otherwise
     */
    get isLiked(): boolean {
        return this.props.isLiked ?? false;
    }

    /**
     * Get the categories associated with the post
     * @returns Array of categories
     */
    get categories(): PostCategory[] {
        return this.props.categories ?? [];
    }

    /**
     * Get the id of the post this one quotes
     * @returns The quoted post ID, or undefined when this is not a quote post
     */
    get quotedPostId(): string | undefined {
        return this.props.quotedPostId;
    }

    /**
     * Get the embedded snapshot of the quoted post
     * @returns The quoted post, or undefined when this post quotes nothing or
     * was loaded without its quote relation
     */
    get quotedPost(): QuotedPostSnapshot | undefined {
        return this.props.quotedPost;
    }

    /**
     * Check if the post has any media attached
     * @returns True if the post has one or more media items
     */
    public hasMedia(): boolean {
        return this.props.mediaUrls.length > 0;
    }

    /**
     * Check if this post quotes another post
     * @returns True if the post was created as a quote of another post
     */
    public isQuote(): boolean {
        return this.props.quotedPostId !== undefined;
    }

    /**
     * Check if the given user is the author of this post
     * @param userId - The user ID to check
     * @returns True if the user is the author of this post
     */
    public isAuthor(userId: string): boolean {
        return this.props.author.id === userId;
    }

    /**
     * Check if the post contains any tags
     * @returns True if the post has one or more tags
     */
    public hasTags(): boolean {
        return this.props.tags.length > 0;
    }

    /**
     * Get the number of media items attached to the post
     * @returns The count of media URLs
     */
    public mediaCount(): number {
        return this.props.mediaUrls.length;
    }

    /**
     * Update the post content and mark as updated
     * This method mutates the entity state to update the content
     * @param newContent - The new content for the post
     */
    public updateContent(newContent: string): void {
        this.props.content = newContent;
        this.props.updatedAt = new Date();
    }

    /**
     * Add a new media URL to the post
     * This method mutates the entity state to add media
     * @param mediaUrl - The URL of the media to add
     */
    public addMedia(mediaUrl: string): void {
        this.props.mediaUrls.push(mediaUrl);
        this.props.updatedAt = new Date();
    }

    /**
     * Remove a media URL from the post
     * This method mutates the entity state to remove media
     * @param mediaUrl - The URL of the media to remove
     */
    public removeMedia(mediaUrl: string): void {
        this.props.mediaUrls = this.props.mediaUrls.filter(
            (url) => url !== mediaUrl,
        );
        this.props.updatedAt = new Date();
    }

    /**
     * Add a tag to the post
     * This method mutates the entity state to add a tag if it doesn't already exist
     * @param tag - The tag to add to the post
     */
    public addTag(tag: string): void {
        if (!this.props.tags.includes(tag)) {
            this.props.tags.push(tag);
            this.props.updatedAt = new Date();
        }
    }

    /**
     * Remove a tag from the post
     * This method mutates the entity state to remove a tag
     * @param tag - The tag to remove from the post
     */
    public removeTag(tag: string): void {
        this.props.tags = this.props.tags.filter((t) => t !== tag);
        this.props.updatedAt = new Date();
    }
}
