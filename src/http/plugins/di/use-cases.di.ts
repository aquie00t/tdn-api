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
import { SendDailyDigestUseCase } from "@core/use-cases/digest/send-daily-digest";
import { UnsubscribeDigestUseCase } from "@core/use-cases/digest/unsubscribe-digest";
import { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import { UploadPostMediaUseCase } from "@core/use-cases/post/upload-post-media";
import { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import { ModeratePendingMediaUseCase } from "@core/use-cases/media/moderate-pending-media";
import { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import type { FeedRankingWeights } from "@core/use-cases/post/get-posts/feed-ranking";
import { RebuildUserInterestsUseCase } from "@core/use-cases/user-interest/rebuild-user-interests";
import type { InterestScoringWeights } from "@core/use-cases/user-interest/rebuild-user-interests";
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
import { StartConversationUseCase } from "@core/use-cases/conversation/start-conversation";
import { ListConversationsUseCase } from "@core/use-cases/conversation/list-conversations";
import { RespondToRequestUseCase } from "@core/use-cases/conversation/respond-to-request";
import { MarkConversationReadUseCase } from "@core/use-cases/conversation/mark-conversation-read";
import { GetUnreadMessageCountUseCase } from "@core/use-cases/conversation/get-unread-count";
import { SendMessageUseCase } from "@core/use-cases/message/send-message";
import { GetMessagesUseCase } from "@core/use-cases/message/get-messages";
import { DeleteMessageUseCase } from "@core/use-cases/message/delete-message";
import { UploadMessageMediaUseCase } from "@core/use-cases/message/upload-message-media";

/**
 * Dependency injection module for use cases
 *
 * shared dependencies across the application.
 */
export const useCasesModule = {
    /**
     * Use case for the morning digest email
     */
    sendDailyDigestUseCase: asFunction(
        (
            userRepository,
            notificationRepository,
            userInterestRepository,
            postRepository,
            digestDeliveryRepository,
            emailService,
            feedRankingWeights,
            config,
            logger,
        ) =>
            new SendDailyDigestUseCase(
                userRepository,
                notificationRepository,
                userInterestRepository,
                postRepository,
                digestDeliveryRepository,
                emailService,
                feedRankingWeights,
                {
                    windowHours: config.DAILY_DIGEST_WINDOW_HOURS,
                    maxWindowDays: config.DAILY_DIGEST_MAX_WINDOW_DAYS,
                    userPageSize: config.DAILY_DIGEST_USER_PAGE_SIZE,
                    maxNotifications: config.DAILY_DIGEST_MAX_NOTIFICATIONS,
                    maxPosts: config.DAILY_DIGEST_MAX_POSTS,
                    candidatePoolSize: config.DAILY_DIGEST_CANDIDATE_POOL_SIZE,
                    frontendUrl: config.FRONTEND_URL,
                    apiUrl: config.API_URL,
                    unsubscribeSecret: config.ACCESS_TOKEN_SECRET_KEY,
                    timezone: config.DAILY_DIGEST_TIMEZONE,
                },
                logger,
            ),
    ).singleton(),

    /**
     * Use case for leaving, or rejoining, the daily digest
     */
    unsubscribeDigestUseCase: asFunction(
        (userRepository, config) =>
            new UnsubscribeDigestUseCase(
                userRepository,
                config.ACCESS_TOKEN_SECRET_KEY,
            ),
    ).singleton(),

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
            notifyMentionedUsersUseCase,
            languageDetectionService,
            mediaAssetRepository,
            config,
            logger,
        ) =>
            new CreatePostUseCase(
                transactionService,
                cacheService,
                userRepository,
                notifyNewPostUseCase,
                notifyQuotedAuthorUseCase,
                notifyMentionedUsersUseCase,
                languageDetectionService,
                mediaAssetRepository,
                config.R2_PUBLIC_URL,
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
     * Use case for telling the users named with an @handle in a body
     */
    notifyMentionedUsersUseCase: asClass(
        NotifyMentionedUsersUseCase,
    ).singleton(),

    /**
     * Use case for uploading post media files
     */
    uploadPostMediaUseCase: asClass(UploadPostMediaUseCase).singleton(),

    /**
     * Shared upload path behind every media endpoint: byte-level type
     * detection, moderation, storage and the asset record.
     */
    uploadModeratedMediaUseCase: asClass(
        UploadModeratedMediaUseCase,
    ).singleton(),

    /**
     * Background worker resolving the videos waiting for a verdict.
     */
    moderatePendingMediaUseCase: asFunction(
        (
            mediaAssetRepository,
            mediaModerationService,
            storageService,
            postRepository,
            commentRepository,
            messageRepository,
            notificationRepository,
            realtimeService,
            config,
            logger,
        ) =>
            new ModeratePendingMediaUseCase(
                mediaAssetRepository,
                mediaModerationService,
                storageService,
                postRepository,
                commentRepository,
                messageRepository,
                notificationRepository,
                realtimeService,
                {
                    batchSize: config.MEDIA_MODERATION_BATCH_SIZE,
                    maxAttempts: config.MEDIA_MODERATION_MAX_ATTEMPTS,
                    leaseSeconds: config.MEDIA_MODERATION_LEASE_SECONDS,
                    r2PublicUrl: config.R2_PUBLIC_URL,
                },
                logger,
            ),
    ).singleton(),

    /**
     * Tuning weights for the feed ranker.
     *
     * Registered as a value rather than resolved inside the use case so the
     * ranker stays a pure function of its inputs, and so the mix can be read
     * straight off the environment in one place.
     */
    feedRankingWeights: asFunction((config): FeedRankingWeights => {
        return {
            language: config.FEED_WEIGHT_LANGUAGE,
            social: config.FEED_WEIGHT_SOCIAL,
            affinity: config.FEED_WEIGHT_AFFINITY,
            engagement: config.FEED_WEIGHT_ENGAGEMENT,
            halfLifeHours: config.FEED_HALF_LIFE_HOURS,
            maxPostsPerAuthor: config.FEED_MAX_POSTS_PER_AUTHOR,
            foreignLanguageQuota: config.FEED_FOREIGN_LANGUAGE_QUOTA,
            explorationRate: config.FEED_EXPLORATION_RATE,
        };
    }).singleton(),

    /** Hard cap on the pool of posts the feed ranker scores per build */
    feedCandidatePoolSize: asFunction(
        (config): number => config.FEED_CANDIDATE_POOL_SIZE,
    ).singleton(),

    /** How far back the feed ranker draws its candidates from */
    feedCandidateWindowDays: asFunction(
        (config): number => config.FEED_CANDIDATE_WINDOW_DAYS,
    ).singleton(),

    /** Tuning weights for the nightly interest profile scorer */
    interestScoringWeights: asFunction((config): InterestScoringWeights => {
        return {
            halfLifeDays: config.USER_INTEREST_HALF_LIFE_DAYS,
            maxInterests: config.USER_INTEREST_MAX,
            minWeight: config.USER_INTEREST_MIN_WEIGHT,
        };
    }).singleton(),

    /** How far back the interest job reads a user's interactions */
    interestWindowDays: asFunction(
        (config): number => config.USER_INTEREST_WINDOW_DAYS,
    ).singleton(),

    /** Cap on signals the interest job reads per interaction type */
    interestSignalLimit: asFunction(
        (config): number => config.USER_INTEREST_SIGNAL_LIMIT,
    ).singleton(),

    /**
     * Use case that rebuilds the materialised interest profiles the feed
     * ranks on
     */
    rebuildUserInterestsUseCase: asFunction(
        (
            userInterestRepository,
            interestScoringWeights,
            interestWindowDays,
            interestSignalLimit,
            logger,
        ) =>
            new RebuildUserInterestsUseCase(
                userInterestRepository,
                interestScoringWeights,
                interestWindowDays,
                interestSignalLimit,
                logger,
            ),
    ).singleton(),

    /**
     * Use case for retrieving posts
     */
    getPostsUseCase: asFunction(
        (
            postRepository,
            cacheService,
            followUserRepository,
            profileRepository,
            userInterestRepository,
            cryptoService,
            seenPostsService,
            logger,
            feedRankingWeights,
            feedCandidatePoolSize,
            feedCandidateWindowDays,
        ) =>
            new GetPostsUseCase(
                postRepository,
                cacheService,
                followUserRepository,
                profileRepository,
                userInterestRepository,
                cryptoService,
                seenPostsService,
                logger,
                feedRankingWeights,
                feedCandidatePoolSize,
                feedCandidateWindowDays,
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
    createCommentUseCase: asFunction(
        (
            transactionService,
            realtimeService,
            mediaAssetRepository,
            config,
            userRepository,
            notifyMentionedUsersUseCase,
            logger,
        ) =>
            new CreateCommentUseCase(
                transactionService,
                realtimeService,
                mediaAssetRepository,
                config.R2_PUBLIC_URL,
                userRepository,
                notifyMentionedUsersUseCase,
                logger,
            ),
    ).singleton(),
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

    // --- Direct messages ---

    /**
     * Use case for opening a conversation with another user
     */
    startConversationUseCase: asClass(StartConversationUseCase).singleton(),

    /**
     * Use case for reading one tab of the message inbox
     */
    listConversationsUseCase: asClass(ListConversationsUseCase).singleton(),

    /**
     * Use case for accepting or declining a conversation request
     */
    respondToRequestUseCase: asClass(RespondToRequestUseCase).singleton(),

    /**
     * Use case for clearing a thread's unread state
     */
    markConversationReadUseCase: asClass(
        MarkConversationReadUseCase,
    ).singleton(),

    /**
     * Use case for the unread message badge
     */
    getUnreadMessageCountUseCase: asClass(
        GetUnreadMessageCountUseCase,
    ).singleton(),

    /**
     * Use case for writing a message.
     *
     * Registered as a function because it needs the CDN origin to recover the
     * storage key behind a submitted media URL, the same way comment creation
     * does.
     */
    sendMessageUseCase: asFunction(
        (
            transactionService,
            conversationRepository,
            mediaAssetRepository,
            realtimeService,
            config,
        ) =>
            new SendMessageUseCase(
                transactionService,
                conversationRepository,
                mediaAssetRepository,
                realtimeService,
                config.R2_PUBLIC_URL,
            ),
    ).singleton(),

    /**
     * Use case for reading a message thread
     */
    getMessagesUseCase: asClass(GetMessagesUseCase).singleton(),

    /**
     * Use case for withdrawing a message
     */
    deleteMessageUseCase: asClass(DeleteMessageUseCase).singleton(),

    /**
     * Use case for storing a file to attach to a message
     */
    uploadMessageMediaUseCase: asClass(UploadMessageMediaUseCase).singleton(),
};
