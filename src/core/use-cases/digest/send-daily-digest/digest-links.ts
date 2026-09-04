import type { Notification } from "@core/domain/entities/notification.entity";

/**
 * Builds the absolute links a digest email points at.
 *
 * The only place in the codebase that knows the shape of a front-end route:
 * no email has ever contained a link before, so these paths are a contract
 * with the web app rather than something the API can derive. If the front end
 * moves a route, it moves here.
 *
 * @param frontendUrl - Origin the web app is served from, without a trailing slash.
 */
export class DigestLinks {
    constructor(private readonly frontendUrl: string) {}

    /**
     * Joins a path onto the configured origin.
     *
     * @param path - Absolute path beginning with a slash.
     * @returns The absolute URL.
     */
    private absolute(path: string): string {
        return `${this.frontendUrl.replace(/\/+$/, "")}${path}`;
    }

    /**
     * Link to a single post.
     *
     * @param postId - The post's id.
     * @returns The absolute URL.
     */
    post(postId: string): string {
        return this.absolute(`/posts/${postId}`);
    }

    /**
     * Where a notification should take the reader.
     *
     * Follows the same precedence the in-app notification list uses - the most
     * specific target wins - so a reply lands on the comment rather than on
     * the post that happens to hold it.
     *
     * @param notification - The notification being rendered.
     * @returns The absolute URL, or the notifications page when it points at
     * nothing in particular, as a follow does.
     */
    notification(notification: Notification): string {
        if (notification.articleSlug) {
            const path = `/articles/${notification.articleSlug}`;
            return this.absolute(
                notification.commentId
                    ? `${path}#comment-${notification.commentId}`
                    : path,
            );
        }

        if (notification.postId) {
            const path = `/posts/${notification.postId}`;
            return this.absolute(
                notification.commentId
                    ? `${path}#comment-${notification.commentId}`
                    : path,
            );
        }

        if (notification.username) {
            return this.absolute(`/${notification.username}`);
        }

        return this.absolute("/notifications");
    }
}
