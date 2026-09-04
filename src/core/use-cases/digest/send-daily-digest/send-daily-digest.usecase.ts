import type { Post } from "@core/domain/entities/post.entity";
import {
    DEFAULT_LANGUAGE,
    normalizeLanguageTag,
    type SupportedLanguage,
} from "@core/domain/constants/language.constants";
import type {
    DailyDigestEmail,
    DigestPostItem,
    DigestRecipient,
} from "@core/domain/interfaces/digest.interface";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import type { IDigestDeliveryRepository } from "@core/ports/repositories/digest-delivery.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import {
    indexInterests,
    scoreCandidate,
    type FeedRankingWeights,
} from "@core/use-cases/post/get-posts/feed-ranking";
import { signUnsubscribeToken } from "@core/use-cases/shared/digest/unsubscribe-token";
import { DigestLinks } from "./digest-links";
import type { SendDailyDigestConfig } from "./send-daily-digest.config";
import type { SendDailyDigestOutput } from "./send-daily-digest.output";

/** Longest lead shown for a post, in characters. */
const EXCERPT_LENGTH = 140;

/** Milliseconds in an hour. */
const HOUR_MS = 3_600_000;

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * One recipient's digest, together with the posts it still has to hydrate.
 */
interface PreparedDigest {
    digest: DailyDigestEmail;
    posts: FeedCandidate[];
}

/**
 * Use case for the morning digest.
 *
 * Answers two questions for each subscriber - what did you miss, and what
 * happened in the topics you care about - and sends nothing at all to anyone
 * for whom both answers are empty. An email that says "nothing happened" is
 * how a digest teaches people to filter it.
 */
export class SendDailyDigestUseCase {
    private readonly links: DigestLinks;

    /**
     * Creates a new instance of SendDailyDigestUseCase.
     *
     * @param userRepository - Source of the eligible audience
     * @param notificationRepository - Source of the "you missed this" section
     * @param userInterestRepository - The affinity profile each user is ranked against
     * @param postRepository - Source of the candidate pool, and hydration of the winners
     * @param digestDeliveryRepository - The per-user, per-day claim
     * @param emailService - Transport, which reports what it accepted
     * @param feedRankingWeights - The same weights the feed ranks with
     * @param sendDailyDigestConfig - Window, page sizes and link origins
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly userInterestRepository: IUserInterestRepository,
        private readonly postRepository: IPostRepository,
        private readonly digestDeliveryRepository: IDigestDeliveryRepository,
        private readonly emailService: EmailPort,
        private readonly feedRankingWeights: FeedRankingWeights,
        private readonly sendDailyDigestConfig: SendDailyDigestConfig,
        private readonly logger: LoggerPort,
    ) {
        this.links = new DigestLinks(sendDailyDigestConfig.frontendUrl);
    }

    /**
     * Assembles and sends this morning's digests.
     *
     * @returns How many recipients were looked at, mailed, passed over and failed
     *
     * @remarks
     * The candidate pool is fetched once for the whole run rather than once
     * per user: every subscriber is ranked against the same day of posts, and
     * the ranker is a pure function, so a single query serves thousands of
     * rankings.
     */
    async execute(): Promise<SendDailyDigestOutput> {
        const now = new Date();
        const digestOn = this.digestDayFor(now);

        const candidates = await this.postRepository.findFeedCandidates({
            since: new Date(
                now.getTime() -
                    this.sendDailyDigestConfig.windowHours * HOUR_MS,
            ),
            limit: this.sendDailyDigestConfig.candidatePoolSize,
        });

        const output: SendDailyDigestOutput = {
            scanned: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
        };

        const prepared: PreparedDigest[] = [];
        let cursor: string | undefined;

        for (;;) {
            const page = await this.userRepository.findDigestRecipients(
                this.sendDailyDigestConfig.userPageSize,
                cursor,
            );

            for (const recipient of page.recipients) {
                output.scanned++;

                try {
                    const one = await this.prepare(
                        recipient,
                        candidates,
                        digestOn,
                        now,
                    );

                    if (!one) {
                        output.skipped++;
                        continue;
                    }

                    prepared.push(one);
                } catch (err: unknown) {
                    // One unreadable profile must not stop the other
                    // thousands, exactly as in the interest rebuild.
                    output.failed++;
                    this.logger.error(
                        { err, userId: recipient.id },
                        "Failed to assemble a user's daily digest",
                    );
                }
            }

            if (!page.nextCursor) break;
            cursor = page.nextCursor;
        }

        if (prepared.length === 0) return output;

        await this.fillPostSections(prepared);

        const result = await this.emailService.sendDailyDigests(
            prepared.map((one) => one.digest),
        );

        output.sent = result.sent;
        output.failed += result.failed.length;

        for (const failure of result.failed) {
            this.logger.error(
                { reason: failure.reason },
                "The provider refused a daily digest",
            );
        }

        return output;
    }

    /**
     * Works out whether one recipient has anything worth an email.
     *
     * The claim is taken last, once there is something to send: claiming a
     * recipient with an empty digest would burn their slot for the day and
     * lose them tomorrow's window.
     *
     * @param recipient - The subscriber being considered
     * @param candidates - The pool shared by the whole run
     * @param digestOn - The calendar day being claimed
     * @param now - Reference time for ranking and for the window
     * @returns The assembled digest, or null when there is nothing to say or
     * another instance already claimed this recipient today
     */
    private async prepare(
        recipient: DigestRecipient,
        candidates: FeedCandidate[],
        digestOn: Date,
        now: Date,
    ): Promise<PreparedDigest | null> {
        const since = await this.windowStart(recipient.id, now);

        const unread = await this.notificationRepository.findUnreadSince(
            recipient.id,
            since,
            this.sendDailyDigestConfig.maxNotifications,
        );

        const interests = await this.userInterestRepository.findByUserId(
            recipient.id,
        );

        const languages = this.languagesFor(recipient);
        const indexed = indexInterests(interests);

        // An empty interest profile needs no special case: every affinity term
        // scores zero and the order falls back to freshness and engagement,
        // which is the right digest for somebody the platform has not learnt
        // anything about yet.
        const posts = candidates
            .map((candidate) => ({
                candidate,
                score: scoreCandidate(
                    candidate,
                    {
                        languages,
                        // Deliberately empty. The digest answers "what
                        // happened in your topics"; who you follow is the
                        // feed's question, and resolving it here would cost a
                        // query per recipient for a signal this email is not
                        // about.
                        followingIds: new Set<string>(),
                        interests: indexed,
                        now,
                        random: Math.random,
                    },
                    this.feedRankingWeights,
                ),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, this.sendDailyDigestConfig.maxPosts)
            .map((scored) => scored.candidate);

        if (unread.length === 0 && posts.length === 0) return null;

        const claimed = await this.digestDeliveryRepository.claim(
            recipient.id,
            digestOn,
        );

        if (!claimed) return null;

        return {
            posts,
            digest: {
                to: recipient.email,
                language: this.languageFor(recipient),
                unsubscribeUrl: this.unsubscribeUrlFor(recipient.id),
                notifications: unread.map((notification) => ({
                    type: notification.type,
                    issuerUsername: notification.username ?? "",
                    url: this.links.notification(notification),
                    createdAt: notification.createdAt,
                })),
                // Filled once the whole run's winners are hydrated together.
                posts: [],
            },
        };
    }

    /**
     * Hydrates every post the run selected, in one query, and renders each
     * recipient's cards from it.
     *
     * @param prepared - The assembled digests and the candidates they won
     */
    private async fillPostSections(prepared: PreparedDigest[]): Promise<void> {
        const wanted = new Set<string>();
        for (const one of prepared) {
            for (const candidate of one.posts) wanted.add(candidate.id);
        }

        if (wanted.size === 0) return;

        const hydrated = await this.postRepository.findByIds([...wanted]);
        const byId = new Map(hydrated.map((post) => [post.id, post]));

        for (const one of prepared) {
            one.digest.posts = one.posts
                .map((candidate) => byId.get(candidate.id))
                .filter((post): post is Post => post !== undefined)
                .map((post): DigestPostItem => ({
                    authorUsername: post.author.username ?? "",
                    excerpt: this.excerpt(post.content),
                    url: this.links.post(post.id),
                }));
        }
    }

    /**
     * Where this recipient's window starts.
     *
     * Resuming from the last delivery rather than always looking back a fixed
     * day is what keeps a skipped morning - one where they had nothing waiting
     * - from swallowing the day before it.
     *
     * @param userId - The recipient
     * @param now - Reference time
     * @returns The oldest moment this digest reports on
     */
    private async windowStart(userId: string, now: Date): Promise<Date> {
        const lastSentAt =
            await this.digestDeliveryRepository.findLastSentAt(userId);

        const ceiling = new Date(
            now.getTime() - this.sendDailyDigestConfig.maxWindowDays * DAY_MS,
        );

        const start =
            lastSentAt ??
            new Date(
                now.getTime() -
                    this.sendDailyDigestConfig.windowHours * HOUR_MS,
            );

        return start > ceiling ? start : ceiling;
    }

    /**
     * The calendar day a run belongs to, in the digest timezone.
     *
     * Date-only, because the claim means "this user has had today's digest",
     * and the server's own midnight is not the one the reader lives in.
     *
     * @param now - Reference time
     * @returns Midnight UTC of that calendar day, matching the DATE column
     */
    private digestDayFor(now: Date): Date {
        // en-CA formats as YYYY-MM-DD, which is the one locale that gives an
        // ISO date without hand-assembling the parts.
        const ymd = new Intl.DateTimeFormat("en-CA", {
            timeZone: this.sendDailyDigestConfig.timezone,
        }).format(now);

        return new Date(`${ymd}T00:00:00.000Z`);
    }

    /**
     * The languages this recipient's ranking should favour.
     *
     * @param recipient - The subscriber
     * @returns Supported codes, never empty
     */
    private languagesFor(recipient: DigestRecipient): SupportedLanguage[] {
        const supported = recipient.languages
            .map((tag) => normalizeLanguageTag(tag))
            .filter((code): code is SupportedLanguage => code !== null);

        return supported.length > 0 ? supported : [DEFAULT_LANGUAGE];
    }

    /**
     * The language this recipient's copy is written in.
     *
     * @param recipient - The subscriber
     * @returns Their first supported language, or the platform default
     */
    private languageFor(recipient: DigestRecipient): SupportedLanguage {
        return this.languagesFor(recipient)[0];
    }

    /**
     * Builds the signed, session-free unsubscribe link.
     *
     * Points at the API rather than at the web app: it has to work straight
     * from an inbox, including from a mail client's own one-click button,
     * which never loads a page.
     *
     * @param userId - The subscriber
     * @returns The absolute URL
     */
    private unsubscribeUrlFor(userId: string): string {
        const token = signUnsubscribeToken(
            userId,
            this.sendDailyDigestConfig.unsubscribeSecret,
        );
        const base = this.sendDailyDigestConfig.apiUrl.replace(/\/+$/, "");
        const user = encodeURIComponent(userId);

        return `${base}/api/v1/emails/unsubscribe?u=${user}&t=${token}`;
    }

    /**
     * Trims a post body down to a lead.
     *
     * @param content - The raw post content
     * @returns A single-line excerpt, ellipsised when it was cut
     */
    private excerpt(content: string): string {
        const flattened = content.replace(/\s+/g, " ").trim();

        return flattened.length > EXCERPT_LENGTH
            ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}...`
            : flattened;
    }
}
