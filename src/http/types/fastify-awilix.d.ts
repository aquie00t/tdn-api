import type AuthController from "@services/auth.controller";
import type OAuthController from "@services/oauth.controller";
import type UserController from "@services/user.controller";
import type { UserPurgeJob } from "@infrastructure/jobs/user/user-purge.job";
import type { UserPurgeScheduler } from "@infrastructure/jobs/user/user-purge.scheduler";
import type { RefreshTokenPurgeScheduler } from "@infrastructure/jobs/refresh-token/refresh-token-purge.scheduler";
import type { ProfileController } from "@services/profile.controller";
import type { FollowUserController } from "@services/follow-user.controller";
import type { WebSocketManager } from "@infrastructure/realtime/websocket/websocket-manager";
import type { NotificationController } from "@controllers/notification.controller";
import type { NotificationPurgeScheduler } from "@infrastructure/jobs/notification/notification-purge.scheduler";
import type { UserInterestRebuildScheduler } from "@infrastructure/jobs/user-interest/user-interest-rebuild.scheduler";
import type PostController from "@services/post.controller";
import type { CommentController } from "@controllers/comment.controller";
import type { LikeController } from "@controllers/like.controller";
import type { BookmarkController } from "@controllers/bookmark.controller";
import type { TrendController } from "@controllers/trend.controller";
import type { CachePort } from "@core/ports/services/cache.port";
import type { SeenPostsPort } from "@core/ports/services/seen-posts.port";
import type { TranslationController } from "@controllers/translation.controller";
import type { ArticleController } from "@controllers/article.controller";
/**
 * Fastify Awilix cradle interface for dependency injection
 * Defines all injectable services and components available in the application
 */
declare module "@fastify/awilix" {
    interface Cradle {
        /** Controller for user management operations */
        userController: UserController;

        /** Controller for authentication operations */
        authController: AuthController;

        /** Controller for OAuth operations */
        oauthController: OAuthController;

        /** Controller for user profile operations */
        profileController: ProfileController;

        /** Job for purging expired user accounts */
        userPurgeJob: UserPurgeJob;

        /** Scheduler for user purge jobs */
        userPurgeScheduler: UserPurgeScheduler;

        /** Scheduler for refresh token purge jobs */
        refreshTokenPurgeScheduler: RefreshTokenPurgeScheduler;

        /** Controller for follow/unfollow operations */
        followUserController: FollowUserController;

        /** WebSocket manager for real-time communication */
        wsManager: WebSocketManager;

        /** Controller for notification operations */
        notificationController: NotificationController;

        /** Scheduler for notification purge jobs */
        notificationPurgeScheduler: NotificationPurgeScheduler;

        /** Scheduler for the nightly interest profile rebuild */
        userInterestRebuildScheduler: UserInterestRebuildScheduler;

        /** Controller for post operations */
        postController: PostController;

        /** Controller for comment operations */
        commentController: CommentController;

        /** Controller for like operations */
        likeController: LikeController;

        /** Controller for bookmark operations */
        bookmarkController: BookmarkController;

        /** Controller for trending tag operations */
        trendController: TrendController;

        /** Redis-backed cache service */
        cacheService: CachePort;

        /** Redis-backed record of what each reader has already been shown */
        seenPostsService: SeenPostsPort;

        /** Controller for translation operations */
        translationController: TranslationController;

        /** Controller for article write operations */
        articleController: ArticleController;
    }
}

export {};
