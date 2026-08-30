import { asClass, asFunction } from "awilix";
import { SoftDeleteUserUseCase } from "@core/use-cases/user/soft-delete";
import { CreateUserUseCase } from "@core/use-cases/user/create-user";
import { RegisterUseCase } from "@core/use-cases/auth/register";
import { LoginUseCase } from "@core/use-cases/auth/login";
import { GithubLoginUseCase } from "@core/use-cases/oauth/oauth-github";
import { RefreshUseCase } from "@core/use-cases/auth/refresh";
import { LogoutUseCase } from "@core/use-cases/auth/logout";
import { SendVerificationEmailUseCase } from "@core/use-cases/auth/send-verification-email";
import { VerifyEmailUseCase } from "@core/use-cases/auth/verify-email";
import { ForgotPasswordUseCase } from "@core/use-cases/auth/forgot-password";
import { ResetPasswordUseCase } from "@core/use-cases/auth/reset-password";
import { RecoverAccountUseCase } from "@core/use-cases/auth/recover-account";
import { GoogleLoginUseCase } from "@core/use-cases/oauth/oauth-google";
import { OAuthExchangeUseCase } from "@core/use-cases/oauth/oauth-exchange";
import { PurgeExpiredUsersUseCase } from "@core/use-cases/user/purge-expired-users";
import { PurgeExpiredTokensUseCase } from "@core/use-cases/auth/purge-expired-tokens";
import { GetMeUserUseCase } from "@core/use-cases/user/get-me";
import { ChangePasswordUseCase } from "@core/use-cases/user/change-password";
import { ChangeUsernameUseCase } from "@core/use-cases/user/change-username";
import { ChangeEmailUseCase } from "@core/use-cases/user/change-email";
import { UpdateAvatarUseCase } from "@core/use-cases/profile/update-avatar";
import { UpdateProfileUseCase } from "@core/use-cases/profile/update-profil";
import { UpdateBannerUseCase } from "@core/use-cases/profile/update-banner";
import { GetProfileUseCase } from "@core/use-cases/profile/get-profile";
import { SearchProfilesUseCase } from "@core/use-cases/profile/search-profile";
import { FollowUserUseCase } from "@core/use-cases/follow-user/follow-user";
import { UnfollowUserUseCase } from "@core/use-cases/follow-user/unfollow-user";
import { GetFollowersUseCase } from "@core/use-cases/follow-user/get-followers";
import { GetFollowingUseCase } from "@core/use-cases/follow-user/get-following";
import { GetUserNotificationUseCase } from "@core/use-cases/notification/get-user";
import { MarkAllNotificationsAsReadUseCase } from "@core/use-cases/notification/mark-all";
import { MarkNotificationAsReadUseCase } from "@core/use-cases/notification/mark-one";
import { GetUnreadNotificationCountUseCase } from "@core/use-cases/notification/unread-count";
import { PurgeExpiredNotificationsUseCase } from "@core/use-cases/notification/purge-expired";
import { CreatePostUseCase } from "@core/use-cases/post/create-post";
import { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import { UploadPostMediaUseCase } from "@core/use-cases/post/upload-post-media";
import { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import { DeletePostUseCase } from "@core/use-cases/post/delete-post";
import { LikePostUseCase } from "@core/use-cases/post/like-post";
import { UnlikePostUseCase } from "@core/use-cases/post/unlike-post";
import { CreateCommentUseCase } from "@core/use-cases/comment/create-comment/create-comment.usecase";
import { CreateBookmarkUseCase } from "@core/use-cases/bookmark/create-bookmark/create-bookmark.usecase";
import { RemoveBookmarkUseCase } from "@core/use-cases/bookmark/remove-bookmark/remove-bookmark.usecase";
import { GetBookmarksUseCase } from "@core/use-cases/bookmark/get-bookmarks/get-bookmarks.usecase";
import { DeleteCommentUseCase } from "@core/use-cases/comment/delete-comment/delete-comment.usecase";
import { GetUserPostsUseCase } from "@core/use-cases/post/get-user-posts/get-user.posts.usecase";
import { GetPostDetailUseCase } from "@core/use-cases/post/get-post-detail/get-post-detail.usecase";
import { GetPostQuotesUseCase } from "@core/use-cases/post/get-post-quotes";
import { GetCommentsUseCase } from "@core/use-cases/comment/get-comments/get-comments.usecase";
import { GetCommentUseCase } from "@core/use-cases/comment/get-comment/get-comment.usecase";
import { GetCommentRepliesUseCase } from "@core/use-cases/comment/get-comment-replies/get-comment-replies.usecase";
import { LikeCommentUseCase } from "@core/use-cases/comment/like-comment/like-comment.usecase";
import { UnlikeCommentUseCase } from "@core/use-cases/comment/unlike-comment/unlike-comment.usecase";
import { CheckUserUseCase } from "@core/use-cases/auth/check-user";
import { SaveCommentBookmarkUseCase } from "@core/use-cases/bookmark/save-comment-bookmark/save-comment-bookmark.usecase";
import { RemoveCommentBookmarkUseCase } from "@core/use-cases/bookmark/remove-comment-bookmark/remove-comment-bookmark.usecase";
import { GetTrendsUseCase } from "@core/use-cases/post/get-trends";
import { SearchTagsUseCase } from "@core/use-cases/tag/search-tag";
import { GetSuggestedUsersUseCase } from "@core/use-cases/profile/get-suggested-users";
import { GetBotProfilesUseCase } from "@core/use-cases/profile/get-bot-profiles";
import { TranslateUseCase } from "@core/use-cases/translate";
import { CreateArticleUseCase } from "@core/use-cases/article/create-article";
import { UpdateArticleUseCase } from "@core/use-cases/article/update-article";
import { PublishArticleUseCase } from "@core/use-cases/article/publish-article";
import { ArchiveArticleUseCase } from "@core/use-cases/article/archive-article";
import { DeleteArticleUseCase } from "@core/use-cases/article/delete-article";
import { GetArticlesUseCase } from "@core/use-cases/article/get-articles";
import { GetArticleUseCase } from "@core/use-cases/article/get-article";
import { GetMyArticlesUseCase } from "@core/use-cases/article/get-my-articles";
import { UploadArticleCoverUseCase } from "@core/use-cases/article/upload-article-cover";
import { LikeArticleUseCase } from "@core/use-cases/article/like-article";
import { UnlikeArticleUseCase } from "@core/use-cases/article/unlike-article";
import { SaveArticleBookmarkUseCase } from "@core/use-cases/article/save-article-bookmark";
import { RemoveArticleBookmarkUseCase } from "@core/use-cases/article/remove-article-bookmark";

/**
 * Dependency injection module for use cases
 *
 * shared dependencies across the application.
 */
export const useCasesModule = {
    /**
     * Use case for soft deleting a user account
     */
    softDeleteUserUseCase: asClass(SoftDeleteUserUseCase).singleton(),

    /**
     * Use case for creating a new user
     */
    createUserUseCase: asClass(CreateUserUseCase).singleton(),

    /**
     * Use case for user registration
     */
    registerUseCase: asClass(RegisterUseCase).singleton(),

    /**
     * Use case for user login
     */
    loginUseCase: asClass(LoginUseCase).singleton(),

    /**
     * Use case for GitHub OAuth login
     */
    githubLoginUseCase: asClass(GithubLoginUseCase).singleton(),

    /**
     * Use case for Google OAuth login
     */
    googleLoginUseCase: asClass(GoogleLoginUseCase).singleton(),

    /**
     * Use case for exchanging a short-lived OAuth code for auth tokens
     */
    oauthExchangeUseCase: asClass(OAuthExchangeUseCase).singleton(),

    /**
     * Use case for JWT token refresh
     */
    refreshUseCase: asClass(RefreshUseCase).singleton(),

    /**
     * Use case for user logout
     */
    logoutUseCase: asClass(LogoutUseCase).singleton(),

    /**
     * Use case for sending email verification
     */
    sendVerificationEmailUseCase: asFunction(
        (
            userRepository,
            verificationTokenRepository,
            emailService,
            cryptoService,
            config,
        ) =>
            new SendVerificationEmailUseCase(
                userRepository,
                verificationTokenRepository,
                emailService,
                cryptoService,
                config.OTP_EXPIRY_SECONDS,
            ),
    ).singleton(),

    /**
     * Use case for verifying email address
     */
    verifyEmailUseCase: asFunction(
        (
            userRepository,
            verificationTokenRepository,
            cryptoService,
            transactionService,
        ) =>
            new VerifyEmailUseCase(
                userRepository,
                verificationTokenRepository,
                cryptoService,
                transactionService,
            ),
    ).singleton(),

    /**
     * Use case for password reset request
     */
    forgotPasswordUseCase: asFunction(
        (
            userRepository,
            verificationTokenRepository,
            emailService,
            cryptoService,
            config,
        ) =>
            new ForgotPasswordUseCase(
                userRepository,
                verificationTokenRepository,
                emailService,
                cryptoService,
                config.OTP_EXPIRY_SECONDS,
            ),
    ).singleton(),

    /**
     * Use case for password reset confirmation
     */
    resetPasswordUseCase: asFunction(
        (
            userRepository,
            verificationTokenRepository,
            passwordService,
            cryptoService,
            transactionService,
        ) =>
            new ResetPasswordUseCase(
                userRepository,
                verificationTokenRepository,
                passwordService,
                cryptoService,
                transactionService,
            ),
    ).singleton(),

    /**
     * Use case for account recovery
     */
    recoverAccountUseCase: asClass(RecoverAccountUseCase).singleton(),

    /**
     * Use case for purging expired user accounts
     */
    purgeExpiredUsersUseCase: asClass(PurgeExpiredUsersUseCase).singleton(),

    /**
     * Use case for purging expired refresh tokens
     */
    purgeExpiredTokensUseCase: asClass(PurgeExpiredTokensUseCase).singleton(),

    /**
     * Use case for getting current user information
     */
    getMeUserUseCase: asClass(GetMeUserUseCase).singleton(),

    /**
     * Use case for changing user password
     */
    changePasswordUseCase: asClass(ChangePasswordUseCase).singleton(),

    /**
     * Use case for changing username
     */
    changeUsernameUseCase: asClass(ChangeUsernameUseCase).singleton(),

    /**
     * Use case for changing email address
     */
    changeEmailUseCase: asClass(ChangeEmailUseCase).singleton(),

    /**
     * Use case for updating user avatar
     */
    updateAvatarUseCase: asClass(UpdateAvatarUseCase).singleton(),

    /**
     * Use case for updating user profile
     */
    updateProfileUseCase: asClass(UpdateProfileUseCase).singleton(),

    /**
     * Use case for updating user banner
     */
    updateBannerUseCase: asClass(UpdateBannerUseCase).singleton(),

    /**
     * Use case for getting user profile
     */
    getProfileUseCase: asClass(GetProfileUseCase).singleton(),

    /**
     * Use case for searching user profiles
     */
    searchProfileUseCase: asClass(SearchProfilesUseCase).singleton(),

    /**
     * Use case for following another user
     */
    followUserUseCase: asClass(FollowUserUseCase).singleton(),

    /**
     * Use case for unfollowing another user
     */
    unfollowUserUseCase: asClass(UnfollowUserUseCase).singleton(),

    /**
     * Use case for getting user followers
     */
    getFollowersUseCase: asClass(GetFollowersUseCase).singleton(),

    /**
     * Use case for getting users being followed
     */
    getFollowingUseCase: asClass(GetFollowingUseCase).singleton(),

    /**
     * Use case for getting user notifications
     */
    getUserNotificationsUseCase: asClass(
        GetUserNotificationUseCase,
    ).singleton(),

    /**
     * Use case for reading the unread notification count
     */
    getUnreadNotificationCountUseCase: asClass(
        GetUnreadNotificationCountUseCase,
    ).singleton(),

    /**
     * Use case for marking a single notification as read
     */
    markNotificationReadUseCase: asClass(
        MarkNotificationAsReadUseCase,
    ).singleton(),

    /**
     * Use case for marking all notifications as read
     */
    markAllReadUseCase: asClass(MarkAllNotificationsAsReadUseCase).singleton(),

    /**
     * Use case for purging expired notifications
     */
    purgeExpiredNotificationsUseCase: asClass(
        PurgeExpiredNotificationsUseCase,
    ).singleton(),

    /**
     * Use case for creating a new post
     */
    createPostUseCase: asFunction(
        (
            transactionService,
            cacheService,
            userRepository,
            notifyNewPostUseCase,
            notifyQuotedAuthorUseCase,
            logger,
        ) =>
            new CreatePostUseCase(
                transactionService,
                cacheService,
                userRepository,
                notifyNewPostUseCase,
                notifyQuotedAuthorUseCase,
                logger,
            ),
    ).singleton(),

    /**
     * Use case for notifying followers that an account published a post
     */
    notifyNewPostUseCase: asClass(NotifyNewPostUseCase).singleton(),

    /**
     * Use case for telling an author that one of their posts was quoted
     */
    notifyQuotedAuthorUseCase: asClass(NotifyQuotedAuthorUseCase).singleton(),

    /**
     * Use case for uploading post media files
     */
    uploadPostMediaUseCase: asClass(UploadPostMediaUseCase).singleton(),

    /**
     * Use case for retrieving posts
     */
    getPostsUseCase: asFunction(
        (postRepository, cacheService, followUserRepository) =>
            new GetPostsUseCase(
                postRepository,
                cacheService,
                followUserRepository,
            ),
    ).singleton(),

    /**
     * Use case for deleting a post
     */
    deletePostUseCase: asFunction(
        (
            postRepository,
            storageService,
            logger,
            cacheService,
            transactionService,
        ) =>
            new DeletePostUseCase(
                postRepository,
                storageService,
                logger,
                cacheService,
                transactionService,
            ),
    ).singleton(),

    /**
     * Use case for liking a post
     */
    likePostUseCase: asClass(LikePostUseCase).singleton(),

    /**
     * Use case for unliking a post
     */
    unlikePostUseCase: asClass(UnlikePostUseCase).singleton(),

    /**
     * Use case for creating a comment on a post
     */
    createCommentUseCase: asClass(CreateCommentUseCase).singleton(),
    /**
     *
     */
    createBookmarkUseCase: asClass(CreateBookmarkUseCase).singleton(),
    /**
     *
     */
    removeBookmarkUseCase: asClass(RemoveBookmarkUseCase).singleton(),
    /**
     *
     */
    getSavedPostsUseCase: asClass(GetPostsUseCase).singleton(),
    /**
     *
     */
    getBookmarksUseCase: asClass(GetBookmarksUseCase).singleton(),
    /**
     *
     */
    deleteCommentUseCase: asClass(DeleteCommentUseCase).singleton(),
    /**
     *
     */
    getUserPostsUseCase: asClass(GetUserPostsUseCase).singleton(),
    /**
     *
     */
    getPostDetailUseCase: asClass(GetPostDetailUseCase).singleton(),

    /**
     * Use case for listing the posts quoting a post
     */
    getPostQuotesUseCase: asClass(GetPostQuotesUseCase).singleton(),
    /**
     *
     */
    getCommentsUseCase: asClass(GetCommentsUseCase).singleton(),
    /**
     *
     */
    getCommentUseCase: asClass(GetCommentUseCase).singleton(),
    /**
     *
     */
    getCommentRepliesUseCase: asClass(GetCommentRepliesUseCase).singleton(),
    /**
     *
     */
    likeCommentUseCase: asClass(LikeCommentUseCase).singleton(),
    /**
     *
     */
    unlikeCommentUseCase: asClass(UnlikeCommentUseCase).singleton(),
    /**
     *
     */
    checkUserUseCase: asClass(CheckUserUseCase).singleton(),
    saveCommentBookmarkUseCase: asClass(SaveCommentBookmarkUseCase).singleton(),
    removeCommentBookmarkUseCase: asClass(
        RemoveCommentBookmarkUseCase,
    ).singleton(),

    getTrendsUseCase: asClass(GetTrendsUseCase).singleton(),
    searchTagsUseCase: asClass(SearchTagsUseCase).singleton(),
    getSuggestedUsersUseCase: asClass(GetSuggestedUsersUseCase).singleton(),
    getBotProfilesUseCase: asClass(GetBotProfilesUseCase).singleton(),
    translateUseCase: asClass(TranslateUseCase).singleton(),

    /**
     * Use case for creating a draft article
     */
    createArticleUseCase: asClass(CreateArticleUseCase).singleton(),

    /**
     * Use case for editing an article
     */
    updateArticleUseCase: asClass(UpdateArticleUseCase).singleton(),

    /**
     * Use case for publishing an article
     */
    publishArticleUseCase: asClass(PublishArticleUseCase).singleton(),

    /**
     * Use case for archiving an article
     */
    archiveArticleUseCase: asClass(ArchiveArticleUseCase).singleton(),

    /**
     * Use case for deleting an article
     */
    deleteArticleUseCase: asClass(DeleteArticleUseCase).singleton(),

    /**
     * Use case for the public article list
     */
    getArticlesUseCase: asClass(GetArticlesUseCase).singleton(),

    /**
     * Use case for reading a single article by slug
     */
    getArticleUseCase: asClass(GetArticleUseCase).singleton(),

    /**
     * Use case for an author's own article list
     */
    getMyArticlesUseCase: asClass(GetMyArticlesUseCase).singleton(),

    /**
     * Use case for storing an article cover image
     */
    uploadArticleCoverUseCase: asClass(UploadArticleCoverUseCase).singleton(),

    /**
     * Use case for liking an article
     */
    likeArticleUseCase: asClass(LikeArticleUseCase).singleton(),

    /**
     * Use case for removing a like from an article
     */
    unlikeArticleUseCase: asClass(UnlikeArticleUseCase).singleton(),

    /**
     * Use case for bookmarking an article
     */
    saveArticleBookmarkUseCase: asClass(SaveArticleBookmarkUseCase).singleton(),

    /**
     * Use case for removing an article bookmark
     */
    removeArticleBookmarkUseCase: asClass(
        RemoveArticleBookmarkUseCase,
    ).singleton(),
};
