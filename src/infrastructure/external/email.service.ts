import type {
    EmailInput,
    EmailPort,
    OtpEmailInput,
} from "@core/ports/services/email.port";
import type {
    DailyDigestEmail,
    DigestSendResult,
} from "@core/domain/interfaces/digest.interface";
import type { SupportedLanguage } from "@core/domain/constants/language.constants";
import type { FastifyBaseLogger } from "fastify";
import { Resend } from "resend";
import { digestCopyFor } from "./email/digest-copy";
import { escapeHtml } from "./email/escape-html";
import { renderDigestSections } from "./email/digest-template";
import { renderReportDigest, renderReportItem } from "./email/report-template";
import type {
    ReportAlertEmail,
    ReportDigestEmail,
} from "@core/domain/interfaces/report.interface";

export interface EmailConfig {
    from: string;
    apiKey: string;

    /** Most emails handed to the provider in one batch request. */
    digestBatchSize: number;

    /** Pause between batch requests, to stay under the provider's rate limit. */
    digestBatchPauseMs: number;
}

interface BaseEmailTemplate {
    title: string;
    heading: string;
    greeting: string;
    body: string;
    footer: string;

    /**
     * Language the copy is written in, for the document's `lang` attribute.
     *
     * Was hard-coded to Turkish while every template read English; a digest
     * that is genuinely sent in either language cannot carry a fixed one.
     */
    lang: SupportedLanguage;
}

interface OtpEmailTemplate extends BaseEmailTemplate {
    type: "otp";
    otp: string;
}

interface AlertEmailTemplate extends BaseEmailTemplate {
    type: "alert";
    alertTitle: string;
    alertBody: string;
}

interface DigestEmailTemplate extends BaseEmailTemplate {
    type: "digest";

    /** The rendered sections, already escaped. */
    sectionsHtml: string;

    /** One-click unsubscribe link, also sent as a List-Unsubscribe header. */
    unsubscribeUrl: string;

    /** The unsubscribe link's text, in the recipient's language. */
    unsubscribeLabel: string;
}

/**
 * The operator's moderation mail.
 *
 * A digest in shape but not in kind, and kept apart from
 * {@link DigestEmailTemplate} for one reason: there is no unsubscribing from a
 * moderation queue, and a variant that demanded an unsubscribe link would have
 * to be given a fake one.
 */
interface ReportEmailTemplate extends BaseEmailTemplate {
    type: "report";

    /** The rendered queue, already escaped. */
    sectionsHtml: string;
}

type EmailTemplate =
    | OtpEmailTemplate
    | AlertEmailTemplate
    | DigestEmailTemplate
    | ReportEmailTemplate;

function buildEmailHtml(template: EmailTemplate): string {
    const baseStyles = `
            body { margin: 0; padding: 0; background-color: #f5f5f5; }
            .wrapper {
                font-family: 'Courier New', Courier, monospace;
                max-width: 560px;
                margin: 40px auto;
                background: #ffffff;
                border: 1px solid #000000;
            }
            .header {
                background-color: #000000;
                padding: 24px 32px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .header-brand {
                font-size: 22px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 4px;
                text-transform: uppercase;
            }
            .header-divider {
                width: 1px;
                height: 20px;
                background: #444;
                display: inline-block;
                margin: 0 12px;
                vertical-align: middle;
            }
            .header-label {
                font-size: 11px;
                color: #888888;
                letter-spacing: 2px;
                text-transform: uppercase;
                vertical-align: middle;
            }
            .content {
                padding: 32px;
                border-bottom: 1px solid #e0e0e0;
            }
            .greeting {
                font-size: 14px;
                color: #111111;
                margin: 0 0 12px 0;
            }
            .body-text {
                font-size: 14px;
                color: #444444;
                line-height: 1.7;
                margin: 0 0 24px 0;
            }
            .otp-box {
                border: 2px solid #000000;
                padding: 24px;
                text-align: center;
                margin: 24px 0;
            }
            .otp-code {
                font-size: 36px;
                font-weight: 700;
                letter-spacing: 12px;
                color: #000000;
                display: block;
            }
            .alert-box {
                border-left: 4px solid #000000;
                background-color: #f9f9f9;
                padding: 16px 20px;
                margin: 24px 0;
            }
            .alert-title {
                font-size: 13px;
                font-weight: 700;
                color: #000000;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin: 0 0 8px 0;
            }
            .alert-body {
                font-size: 13px;
                color: #555555;
                line-height: 1.6;
                margin: 0;
            }
            .digest-section {
                margin: 0 0 28px 0;
            }
            .section-title {
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 2px;
                color: #000000;
                margin: 0 0 16px 0;
            }
            .digest-item {
                font-size: 13px;
                color: #444444;
                line-height: 1.6;
                margin: 0 0 14px 0;
                padding: 0 0 14px 0;
                border-bottom: 1px solid #eeeeee;
            }
            .digest-link {
                color: #000000;
                text-decoration: underline;
            }
            .digest-meta {
                display: block;
                font-size: 12px;
                color: #777777;
                margin: 4px 0 0 0;
            }
            .footer-link {
                color: #999999;
                text-decoration: underline;
            }
            .footer {
                padding: 20px 32px;
                background-color: #fafafa;
            }
            .footer-text {
                font-size: 11px;
                color: #999999;
                margin: 0;
                line-height: 1.6;
                text-align: center;
                letter-spacing: 0.5px;
            }
        `;

    const otpBlock =
        template.type === "otp"
            ? `<div class="otp-box">
                    <span class="otp-code">${template.otp}</span>
                </div>`
            : "";

    const alertBlock =
        template.type === "alert"
            ? `<div class="alert-box">
                    <p class="alert-title">${template.alertTitle}</p>
                    <p class="alert-body">${template.alertBody}</p>
                </div>`
            : "";

    const digestBlock =
        template.type === "digest" || template.type === "report"
            ? template.sectionsHtml
            : "";

    const unsubscribeBlock =
        template.type === "digest"
            ? `<p class="footer-text">
                    <a class="footer-link" href="${template.unsubscribeUrl}">${template.unsubscribeLabel}</a>
                </p>`
            : "";

    return `
            <!DOCTYPE html>
            <html lang="${template.lang}">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>${template.title}</title>
                <style>${baseStyles}</style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header">
                        <span class="header-brand">tdn</span>
                        <span>
                            <span class="header-divider"></span>
                            <span class="header-label">${template.heading}</span>
                        </span>
                    </div>
                    <div class="content">
                        <p class="greeting">${template.greeting}</p>
                        <p class="body-text">${template.body}</p>
                        ${otpBlock}
                        ${alertBlock}
                        ${digestBlock}
                    </div>
                    <div class="footer">
                        <p class="footer-text">${template.footer}</p>
                        ${unsubscribeBlock}
                    </div>
                </div>
            </body>
            </html>
        `;
}

export class EmailService implements EmailPort {
    private resend: Resend;

    constructor(
        private readonly config: EmailConfig,
        private readonly logger: FastifyBaseLogger,
    ) {
        this.resend = new Resend(this.config.apiKey);
    }

    private async send(
        to: string,
        subject: string,
        html: string,
    ): Promise<void> {
        try {
            const { data, error } = await this.resend.emails.send({
                from: this.config.from,
                to: [to],
                subject: subject,
                html: html,
            });

            if (error) {
                this.logger.error({ error }, "Resend API Error");
                return;
            }

            this.logger.info(
                { id: data?.id },
                "Email sent successfully via Resend",
            );
        } catch (err) {
            this.logger.error(err, "Unexpected error during email sending");
        }
    }

    async sendVerificationEmail(input: OtpEmailInput): Promise<void> {
        const html = buildEmailHtml({
            type: "otp",
            title: "Email Verification",
            heading: "Account Verification",
            lang: "en",
            greeting: "Hello,",
            body: "Your one-time verification code is below to continue the process.",
            otp: input.otp,
            footer: "This code is valid for 10 minutes. Do not share this code with anyone.",
        });

        await this.send(input.to, "Your Email Verification Code (OTP)", html);
    }

    async sendPasswordResetEmail(input: OtpEmailInput): Promise<void> {
        const html = buildEmailHtml({
            type: "otp",
            title: "Password Reset",
            heading: "Password Reset",
            lang: "en",
            greeting: "Hello,",
            body: "Your one-time verification code for password reset request is below.",
            otp: input.otp,
            footer: "This code is valid for 10 minutes. Do not share this code with anyone.",
        });

        await this.send(input.to, "Password Reset Request", html);
    }

    async sendDeleteUserEmail(input: EmailInput): Promise<void> {
        const html = buildEmailHtml({
            type: "alert",
            title: "Account Deletion",
            heading: "Account Deletion",
            lang: "en",
            greeting: "Hello,",
            body: "We have received your request to delete your account. Your account will be permanently deleted in <strong>30 days</strong>.",
            alertTitle: "Change Your Mind?",
            alertBody:
                "If you log back into your account within 30 days, the process will be canceled.",
            footer: "Thank you for being with us.",
        });

        await this.send(
            input.to,
            "Your Account is Scheduled for Deletion",
            html,
        );
    }
    /**
     * Tells the operator that one piece of content just crossed the reporting
     * threshold.
     *
     * Sent through the same single-recipient path the transactional emails
     * use, which swallows provider failures into the log rather than throwing.
     * That is the right trade here: the alert is a courtesy on top of a report
     * that is already stored and already in the queue, and a moderation
     * endpoint that returns 500 because an email bounced would teach reporters
     * to retry until it stops.
     *
     * @param input - The escalated content and what was said about it.
     */
    async sendReportAlert(input: ReportAlertEmail): Promise<void> {
        const html = buildEmailHtml({
            type: "report",
            title: "Content Reported",
            heading: "Moderation",
            lang: "en",
            greeting: "Heads up,",
            body: `A ${input.item.targetKind.toLowerCase()} has now been reported by ${input.item.reporterCount} people, crossing the alert threshold of ${input.threshold}.`,
            sectionsHtml: renderReportItem(input.item),
            footer: "Nothing has been hidden automatically. docs/reporting.md has the statements for acting on this.",
        });

        await this.send(
            input.to,
            `[TDN] ${input.item.reporterCount} reports on a ${input.item.targetKind.toLowerCase()}`,
            html,
        );
    }

    /**
     * Sends the operator the morning summary of open reports.
     *
     * @param input - The open queue, collected per target.
     */
    async sendReportDigest(input: ReportDigestEmail): Promise<void> {
        const html = buildEmailHtml({
            type: "report",
            title: "Open Reports",
            heading: "Moderation",
            lang: "en",
            greeting: "Good morning,",
            body: "These reports are still open. They stay in this email until they are dealt with.",
            sectionsHtml: renderReportDigest(input.items, input.totalPending),
            footer: "docs/reporting.md has the statements for acting on these.",
        });

        await this.send(
            input.to,
            `[TDN] ${input.totalPending} open report${input.totalPending === 1 ? "" : "s"}`,
            html,
        );
    }

    /**
     * Sends a morning digest to many recipients at once.
     *
     * Batched rather than looped: the provider accepts up to a hundred emails
     * per request and rate-limits requests, so a per-recipient loop would take
     * minutes and trip that limit long before it finished. `permissive`
     * validation is what makes the batch survive one bad address - the default
     * rejects the whole request - and the idempotency key means a retried
     * request cannot deliver the same batch twice.
     *
     * @param digests - One assembled digest per recipient.
     * @returns How many the provider accepted, and which it refused.
     */
    async sendDailyDigests(
        digests: DailyDigestEmail[],
    ): Promise<DigestSendResult> {
        const result: DigestSendResult = { sent: 0, failed: [] };
        if (digests.length === 0) return result;

        const day = new Date().toISOString().slice(0, 10);
        const size = Math.max(1, this.config.digestBatchSize);

        for (let start = 0; start < digests.length; start += size) {
            const chunk = digests.slice(start, start + size);

            if (start > 0) await this.pause(this.config.digestBatchPauseMs);

            await this.sendDigestChunk(
                chunk,
                `daily-digest:${day}:${start}`,
                result,
            );
        }

        return result;
    }

    /**
     * Hands one batch to the provider and folds the answer into the result.
     *
     * A whole chunk failing is reported per recipient rather than as one line:
     * the caller counts emails, not requests, and a hundred people silently
     * missing their digest should not look like a single failure.
     *
     * @param chunk - The digests in this batch.
     * @param idempotencyKey - Key making a retry of this batch a no-op.
     * @param result - The accumulating run result.
     */
    private async sendDigestChunk(
        chunk: DailyDigestEmail[],
        idempotencyKey: string,
        result: DigestSendResult,
    ): Promise<void> {
        try {
            const { data, error } = await this.resend.batch.send(
                chunk.map((digest) => this.toBatchEmail(digest)),
                { batchValidation: "permissive", idempotencyKey },
            );

            if (error) {
                this.logger.error({ error }, "Resend batch API error");
                for (const digest of chunk) {
                    result.failed.push({
                        to: digest.to,
                        reason: error.message,
                    });
                }
                return;
            }

            const refused = new Map(
                (data?.errors ?? []).map((item) => [item.index, item.message]),
            );

            chunk.forEach((digest, index) => {
                const reason = refused.get(index);

                if (reason === undefined) {
                    result.sent++;
                    return;
                }

                result.failed.push({ to: digest.to, reason });
            });
        } catch (err: unknown) {
            this.logger.error(err, "Unexpected error sending a digest batch");
            for (const digest of chunk) {
                result.failed.push({
                    to: digest.to,
                    reason: "Unexpected error",
                });
            }
        }
    }

    /**
     * Renders one digest into the shape the batch endpoint takes.
     *
     * The List-Unsubscribe headers are what let a mail client show its own
     * unsubscribe button, which is the one people actually trust; without them
     * the alternative they reach for is the spam button, and that costs the
     * whole domain.
     *
     * @param digest - The assembled digest.
     * @returns One batch entry.
     */
    private toBatchEmail(digest: DailyDigestEmail): {
        from: string;
        to: string[];
        subject: string;
        html: string;
        headers: Record<string, string>;
    } {
        const copy = digestCopyFor(digest.language);

        return {
            from: this.config.from,
            to: [digest.to],
            subject: copy.subject,
            html: buildEmailHtml({
                type: "digest",
                title: copy.subject,
                heading: copy.heading,
                lang: digest.language,
                greeting: copy.greeting,
                body: copy.intro,
                footer: copy.footer,
                sectionsHtml: renderDigestSections(digest, copy),
                unsubscribeUrl: digest.unsubscribeUrl,
                unsubscribeLabel: escapeHtml(copy.unsubscribe),
            }),
            headers: {
                "List-Unsubscribe": `<${digest.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        };
    }

    /**
     * Waits between batch requests, keeping the run under the rate limit.
     *
     * @param ms - How long to wait.
     */
    private async pause(ms: number): Promise<void> {
        if (ms <= 0) return;
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
