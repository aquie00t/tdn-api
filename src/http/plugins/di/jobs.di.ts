import { asClass, asFunction } from "awilix";
import { UserPurgeJob } from "@infrastructure/jobs/user/user-purge.job";
import { RefreshTokenPurgeJob } from "@infrastructure/jobs/refresh-token/refresh-token-purge.job";
import { UserPurgeScheduler } from "@infrastructure/jobs/user/user-purge.scheduler";
import { RefreshTokenPurgeScheduler } from "@infrastructure/jobs/refresh-token/refresh-token-purge.scheduler";
import { NotificationPurgeJob } from "@infrastructure/jobs/notification/notification-purge.job";
import { NotificationPurgeScheduler } from "@infrastructure/jobs/notification/notification-purge.scheduler";
import { UserInterestRebuildJob } from "@infrastructure/jobs/user-interest/user-interest-rebuild.job";
import { UserInterestRebuildScheduler } from "@infrastructure/jobs/user-interest/user-interest-rebuild.scheduler";

export const jobsModule = {
    // --- Jobs ---
    userPurgeJob: asClass(UserPurgeJob).singleton(),
    refreshTokenPurgeJob: asClass(RefreshTokenPurgeJob).singleton(),
    notificationPurgeJob: asClass(NotificationPurgeJob),
    userInterestRebuildJob: asClass(UserInterestRebuildJob).singleton(),

    // --- Schedulers ---
    userPurgeScheduler: asFunction((userPurgeJob, config, logger) => {
        return new UserPurgeScheduler(
            userPurgeJob,
            { cronExpression: config.USER_PURGE_CRON },
            logger,
        );
    }).singleton(),

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

    userInterestRebuildScheduler: asFunction(
        (userInterestRebuildJob, config, logger) => {
            return new UserInterestRebuildScheduler(
                userInterestRebuildJob,
                { cronExpression: config.USER_INTEREST_REBUILD_CRON },
                logger,
            );
        },
    ).singleton(),
};
