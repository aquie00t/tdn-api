import type { FastifyReply, FastifyRequest } from "fastify";
import type { UnsubscribeDigestUseCase } from "@core/use-cases/digest/unsubscribe-digest";
import { escapeHtml } from "@infrastructure/external/email/escape-html";

/**
 * The query an unsubscribe link carries.
 */
export interface UnsubscribeQuery {
    /** The account the link is for. */
    u: string;

    /** The signature proving the link was issued by us. */
    t: string;

    /** Whether to leave, or to undo leaving. */
    action?: "unsubscribe" | "resubscribe";
}

/**
 * Controller for the endpoints an email links to.
 *
 * The only controller that answers in HTML: a reader arrives here by clicking
 * a link in their inbox, so the reply is a page they read, not a payload for
 * the web app to render.
 */
export class EmailController {
    /**
     * Creates a new instance of EmailController.
     *
     * @param unsubscribeDigestUseCase - Use case applying the reader's choice
     * @param frontendUrl - Origin the confirmation page links back to
     */
    constructor(
        private readonly unsubscribeDigestUseCase: UnsubscribeDigestUseCase,
        private readonly frontendUrl: string,
    ) {}

    /**
     * Applies an unsubscribe, or an undo, from a signed link.
     *
     * Accepts both GET and POST: a person clicking the link sends a GET, and a
     * mail client's own unsubscribe button sends a bodyless POST, which is
     * what RFC 8058 one-click requires.
     *
     * @param request - The request carrying the signed query
     * @param reply - The reply to render the page into
     */
    async unsubscribe(
        request: FastifyRequest<{ Querystring: UnsubscribeQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { u, t, action } = request.query;

        const subscribed = await this.unsubscribeDigestUseCase.execute({
            userId: u,
            token: t,
            action: action === "resubscribe" ? "resubscribe" : "unsubscribe",
        });

        const undoUrl = `${request.protocol}://${request.hostname}${request.url.split("?")[0]}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&action=${subscribed ? "unsubscribe" : "resubscribe"}`;

        await reply
            .status(200)
            .type("text/html; charset=utf-8")
            .send(this.page(subscribed, undoUrl));
    }

    /**
     * Renders the confirmation page.
     *
     * Bilingual in one page rather than negotiated: the reader arrives from an
     * email with no session and no reliable `Accept-Language`, and two short
     * lines cost less than guessing wrong.
     *
     * @param subscribed - Whether the account is subscribed after the change
     * @param undoUrl - Link that reverses what just happened
     * @returns The HTML page
     */
    private page(subscribed: boolean, undoUrl: string): string {
        const heading = subscribed
            ? "Aboneliğin geri açıldı · You are subscribed again"
            : "Abonelikten çıktın · You have been unsubscribed";

        const body = subscribed
            ? "Günlük özet mailini tekrar alacaksın. · You will receive the daily digest again."
            : "Artık günlük özet maili almayacaksın. · You will no longer receive the daily digest.";

        const undoLabel = subscribed
            ? "Yine de çık · Unsubscribe anyway"
            : "Yanlışlıkla mı tıkladın? Geri al · Undo";

        return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
    <style>
        body { margin: 0; padding: 0; background: #f5f5f5; font-family: 'Courier New', Courier, monospace; }
        .card { max-width: 520px; margin: 64px auto; background: #fff; border: 1px solid #000; }
        .head { background: #000; color: #fff; padding: 20px 28px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; }
        .content { padding: 28px; }
        h1 { font-size: 16px; margin: 0 0 12px 0; color: #111; }
        p { font-size: 13px; line-height: 1.7; color: #444; margin: 0 0 20px 0; }
        a { color: #000; }
    </style>
</head>
<body>
    <div class="card">
        <div class="head">tdn</div>
        <div class="content">
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(body)}</p>
            <p><a href="${escapeHtml(undoUrl)}">${escapeHtml(undoLabel)}</a></p>
            <p><a href="${escapeHtml(this.frontendUrl)}">The Developer Network</a></p>
        </div>
    </div>
</body>
</html>`;
    }
}
