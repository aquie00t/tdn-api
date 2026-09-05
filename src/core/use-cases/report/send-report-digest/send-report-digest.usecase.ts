import type { Report } from "@core/domain/entities/report.entity";
import type { IReportDigestDeliveryRepository } from "@core/ports/repositories/report-digest-delivery.repository";
import type { IReportRepository } from "@core/ports/repositories/report.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import { groupReports } from "@core/use-cases/shared/reports/group-reports";
import type { SendReportDigestConfig } from "./send-report-digest.config";
import type { SendReportDigestUseCaseOutput } from "./send-report-digest-usecase.output";

/**
 * Use case for the morning summary of open reports.
 *
 * The email is the current queue rather than the last day's arrivals. A window
 * anchored to the previous send loses whatever it covered whenever that email
 * fails, and a moderation backlog is the last place to build a silent gap
 * into; showing what is still open means a lost morning costs nothing and an
 * ignored report keeps asking until somebody deals with it.
 *
 * Nothing is sent when the queue is empty. An email that says "no reports" is
 * the fastest way to teach an operator to filter the ones that matter.
 */
export class SendReportDigestUseCase {
    /**
     * Creates a new instance of SendReportDigestUseCase.
     *
     * @param reportRepository - Where the open queue is read from
     * @param reportDigestDeliveryRepository - Holds the per-day claim
     * @param userRepository - Used to name the authors in the email
     * @param emailService - Carries the summary
     * @param sendReportDigestConfig - Address, caps and the timezone
     */
    constructor(
        private readonly reportRepository: IReportRepository,
        private readonly reportDigestDeliveryRepository: IReportDigestDeliveryRepository,
        private readonly userRepository: IUserRepository,
        private readonly emailService: EmailPort,
        private readonly sendReportDigestConfig: SendReportDigestConfig,
    ) {}

    /**
     * Sends the operator the reports that are still open.
     *
     * @param now - Reference time, injected so the day boundary is testable
     * @returns What the run did, for the scheduler's log line
     *
     * @remarks
     * The claim is taken last, once there is something to send and the email
     * is assembled. Claiming first would burn the day on a morning with an
     * empty queue, and burn it again on one where the assembly threw.
     */
    async execute(
        now: Date = new Date(),
    ): Promise<SendReportDigestUseCaseOutput> {
        const idle: SendReportDigestUseCaseOutput = {
            sent: false,
            items: 0,
            pending: 0,
            alreadyClaimed: false,
        };

        const { enabled, alertEmail } = this.sendReportDigestConfig;

        if (!enabled || !alertEmail) return idle;

        const open = await this.reportRepository.findPending(
            this.sendReportDigestConfig.maxReports,
        );

        if (open.length === 0) return idle;

        const totalPending = await this.reportRepository.countPending();

        const items = groupReports(open, {
            usernames: await this.resolveUsernames(open),
            frontendUrl: this.sendReportDigestConfig.frontendUrl,
            excerptLength: this.sendReportDigestConfig.excerptLength,
            maxDetails: this.sendReportDigestConfig.maxDetails,
        });

        const claimed = await this.reportDigestDeliveryRepository.claim(
            this.digestDayFor(now),
            open.length,
        );

        if (!claimed)
            return { ...idle, pending: totalPending, alreadyClaimed: true };

        await this.emailService.sendReportDigest({
            to: alertEmail,
            items,
            totalPending,
        });

        return {
            sent: true,
            items: items.length,
            pending: totalPending,
            alreadyClaimed: false,
        };
    }

    /**
     * Resolves the handles of everyone whose content is in this email.
     *
     * One lookup per distinct author rather than a bulk method on the user
     * repository: the email is capped at a couple of dozen items, the lookups
     * run in parallel, and this happens once a morning. A port method added
     * for it would be a permanent widening of the interface for a query with
     * one caller.
     *
     * @param reports - The reports being summarised
     * @returns Author id to current handle, missing ids simply absent
     */
    private async resolveUsernames(
        reports: Report[],
    ): Promise<Map<string, string>> {
        const ids = [
            ...new Set(reports.map((report) => report.targetAuthorId)),
        ];

        const users = await Promise.all(
            ids.map((id) => this.userRepository.findById(id)),
        );

        return new Map(
            users
                .filter((user) => user !== null)
                .map((user) => [user.id, user.username]),
        );
    }

    /**
     * The calendar day a run belongs to, in the summary's timezone.
     *
     * Date-only, because the claim means "this morning's summary has been
     * sent", and the server's own midnight is not necessarily the operator's.
     *
     * @param now - Reference time
     * @returns Midnight UTC of that calendar day, matching the DATE column
     */
    private digestDayFor(now: Date): Date {
        // en-CA formats as YYYY-MM-DD, the one locale that gives an ISO date
        // without hand-assembling the parts.
        const ymd = new Intl.DateTimeFormat("en-CA", {
            timeZone: this.sendReportDigestConfig.timezone,
        }).format(now);

        return new Date(`${ymd}T00:00:00.000Z`);
    }
}
