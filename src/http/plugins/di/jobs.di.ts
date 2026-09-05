import { asClass, asFunction } from "awilix";
import { UserPurgeJob } from "@infrastructure/jobs/user/user-purge.job";
import { RefreshTokenPurgeJob } from "@infrastructure/jobs/refresh-token/refresh-token-purge.job";
import { UserPurgeScheduler } from "@infrastructure/jobs/user/user-purge.scheduler";
import { RefreshTokenPurgeScheduler } from "@infrastructure/jobs/refresh-token/refresh-token-purge.scheduler";
import { NotificationPurgeJob } from "@infrastructure/jobs/notification/notification-purge.job";
import { NotificationPurgeScheduler } from "@infrastructure/jobs/notification/notification-purge.scheduler";
import { UserInterestRebuildJob } from "@infrastructure/jobs/user-interest/user-interest-rebuild.job";
import { DailyDigestJob } from "@infrastructure/jobs/digest/daily-digest.job";
import { DailyDigestScheduler } from "@infrastructure/jobs/digest/daily-digest.scheduler";
import { UserInterestRebuildScheduler } from "@infrastructure/jobs/user-interest/user-interest-rebuild.scheduler";
import { MediaModerationJob } from "@infrastructure/jobs/media-moderation/media-moderation.job";
import { MediaModerationScheduler } from "@infrastructure/jobs/media-moderation/media-moderation.scheduler";
import { ReportDigestJob } from "@infrastructure/jobs/report/report-digest.job";
import { ReportDigestScheduler } from "@infrastructure/jobs/report/report-digest.scheduler";
import { ReportPurgeJob } from "@infrastructure/jobs/report/report-purge.job";
import { ReportPurgeScheduler } from "@infrastructure/jobs/report/report-purge.scheduler";
import { MessageRetentionJob } from "@infrastructure/jobs/message/message-retention.job";
import { MessageRetentionScheduler } from "@infrastructure/jobs/message/message-retention.scheduler";

export const jobsModule = {
    // --- Jobs ---
    userPurgeJob: asClass(UserPurgeJob).singleton(),
    refreshTokenPurgeJob: asClass(RefreshTokenPurgeJob).singleton(),
    notificationPurgeJob: asClass(NotificationPurgeJob),
    userInterestRebuildJob: asClass(UserInterestRebuildJob).singleton(),
    mediaModerationJob: asClass(MediaModerationJob).singleton(),
    messageRetentionJob: asClass(MessageRetentionJob).singleton(),
    reportDigestJob: asClass(ReportDigestJob).singleton(),
    reportPurgeJob: asClass(ReportPurgeJob).singleton(),

    // --- Schedulers ---
    userPurgeScheduler: asFunction((userPurgeJob, config, logger) => {
        return new UserPurgeScheduler(
            userPurgeJob,
            { cronExpression: config.USER_PURGE_CRON },
            logger,
        );
    }).singleton(),

    messageRetentionScheduler: asFunction(
        (messageRetentionJob, config, logger) => {
            return new MessageRetentionScheduler(
                messageRetentionJob,
                {
                    cronExpression: config.MESSAGE_RETENTION_CRON,
                    retentionDays: config.MESSAGE_RETENTION_DAYS,
                },
                logger,
            );
        },
    ).singleton(),

    refreshTokenPurgeScheduler: asFunction(
        (refreshTokenPurgeJob, config, logger) => {
            return new RefreshTokenPurgeScheduler(
                refreshTokenPurgeJob,
                { cronExpression: config.REFRESH_TOKEN_PURGE_CRON },
                logger,
            );
        },
    ).singleton(),

    notificationPurgeScheduler: asFunction(
        (notificationPurgeJob, config, logger) => {
            return new NotificationPurgeScheduler(
                notificationPurgeJob,
                {
                    cronExpression: config.NOTIFICATION_PURGE_CRON,
                    gracePeriodDays:
                        config.NOTIFICATION_PURGE_GRACE_PERIOD_DAYS,
                },
                logger,
            );
        },
    ),

    mediaModerationScheduler: asFunction(
        (mediaModerationJob, config, logger) => {
            return new MediaModerationScheduler(
                mediaModerationJob,
                { cronExpression: config.MEDIA_MODERATION_CRON },
                logger,
            );
        },
    ).singleton(),

    userInterestRebuildScheduler: asFunction(
        (userInterestRebuildJob, config, logger) => {
            return new UserInterestRebuildScheduler(
                userInterestRebuildJob,
                { cronExpression: config.USER_INTEREST_REBUILD_CRON },
                logger,
            );
        },
    ).singleton(),

    dailyDigestJob: asClass(DailyDigestJob).singleton(),

    reportDigestScheduler: asFunction((reportDigestJob, config, logger) => {
        return new ReportDigestScheduler(
            reportDigestJob,
            {
                cronExpression: config.REPORT_DIGEST_CRON,
                timezone: config.REPORT_DIGEST_TIMEZONE,
                // The address is the real switch: without somewhere to send
                // the summary there is nothing for the schedule to do.
                enabled:
                    config.REPORT_DIGEST_ENABLED &&
                    config.MODERATION_ALERT_EMAIL.length > 0,
            },
            logger,
        );
    }).singleton(),

    reportPurgeScheduler: asFunction((reportPurgeJob, config, logger) => {
        return new ReportPurgeScheduler(
            reportPurgeJob,
            {
                cronExpression: config.REPORT_PURGE_CRON,
                retentionDays: config.REPORT_RETENTION_DAYS,
            },
            logger,
        );
    }).singleton(),

    dailyDigestScheduler: asFunction((dailyDigestJob, config, logger) => {
        return new DailyDigestScheduler(
            dailyDigestJob,
            {
                cronExpression: config.DAILY_DIGEST_CRON,
                timezone: config.DAILY_DIGEST_TIMEZONE,
                enabled: config.DAILY_DIGEST_ENABLED,
            },
            logger,
        );
    }).singleton(),
};
