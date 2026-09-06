import { asClass, asFunction } from "awilix";
import { UserController } from "@controllers/user.controller";
import { AuthController } from "@controllers/auth.controller";
import { OAuthController } from "@controllers/oauth.controller";
import { NotificationController } from "@controllers/notification.controller";
import { PostController } from "@controllers/post.controller";
import { LikeController } from "@controllers/like.controller";
import { ProfileController } from "@controllers/profile.controller";
import { FollowUserController } from "@controllers/follow-user.controller";
import { BlockController } from "@controllers/block.controller";
import { ReportController } from "@controllers/report.controller";
import { MetaController } from "@controllers/meta.controller";
import { DeviceController } from "@controllers/device.controller";
import { CommentController } from "@controllers/comment.controller";
import { BookmarkController } from "@controllers/bookmark.controller";
import { TrendController } from "@controllers/trend.controller";
import { TranslationController } from "@controllers/translation.controller";
import { ArticleController } from "@controllers/article.controller";
import { EmailController } from "@controllers/email.controller";
import { ConversationController } from "@controllers/conversation.controller";

/**
 * Dependency injection module for controllers
 * Registers all HTTP controllers as singleton instances
 */
export const controllersModule = {
    // --- Controllers ---
    userController: asClass(UserController).singleton(),
    authController: asClass(AuthController).singleton(),
    oauthController: asClass(OAuthController).singleton(),
    profileController: asFunction(
        (
            updateAvatarUseCase,
            updateProfileUseCase,
            updateBannerUseCase,
            getProfileUseCase,
            searchProfileUseCase,
            getFollowersUseCase,
            getFollowingUseCase,
            getSuggestedUsersUseCase,
            getBotProfilesUseCase,
            config,
        ) => {
            return new ProfileController(
                updateAvatarUseCase,
                updateProfileUseCase,
                updateBannerUseCase,
                getProfileUseCase,
                searchProfileUseCase,
                getFollowersUseCase,
                getFollowingUseCase,
                getSuggestedUsersUseCase,
                getBotProfilesUseCase,
                config.R2_PUBLIC_URL,
            );
        },
    ),
    followUserController: asClass(FollowUserController).singleton(),
    blockController: asClass(BlockController).singleton(),
    reportController: asClass(ReportController).singleton(),
    metaController: asClass(MetaController).singleton(),
    deviceController: asClass(DeviceController).singleton(),
    notificationController: asClass(NotificationController).singleton(),
    postController: asClass(PostController).singleton(),
    commentController: asClass(CommentController).singleton(),
    likeController: asFunction(
        (likePostUseCase, unlikePostUseCase) =>
            new LikeController(likePostUseCase, unlikePostUseCase),
    ).singleton(),
    bookmarkController: asClass(BookmarkController).singleton(),
    trendController: asClass(TrendController).singleton(),
    translationController: asClass(TranslationController).singleton(),
    articleController: asClass(ArticleController).singleton(),
    conversationController: asClass(ConversationController).singleton(),
    emailController: asFunction(
        (unsubscribeDigestUseCase, config) =>
            new EmailController(unsubscribeDigestUseCase, config.FRONTEND_URL),
    ).singleton(),
};
