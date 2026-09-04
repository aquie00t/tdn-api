import type { DailyDigestEmail } from "@core/domain/interfaces/digest.interface";
import type { DigestCopy } from "./digest-copy";
import { escapeHtml } from "./escape-html";

/**
 * Inline styles repeated on every item.
 *
 * The shared stylesheet is a `<style>` block, which several mail clients strip
 * outright. The transactional emails survive that - they are a paragraph and a
 * code box - but a stripped digest would collapse into an unreadable run of
 * links, so the properties that carry its structure are written twice: once in
 * the stylesheet, once here.
 */
const ITEM_STYLE =
    "margin:0 0 14px 0;padding:0 0 14px 0;border-bottom:1px solid #eeeeee;";

const LINK_STYLE = "color:#000000;text-decoration:underline;";

const SECTION_TITLE_STYLE =
    "font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000000;margin:0 0 16px 0;";

const META_STYLE = "font-size:12px;color:#777777;margin:4px 0 0 0;";

/**
 * Renders the body of a digest: the two sections, in order.
 *
 * A section with nothing in it is omitted entirely rather than rendered with
 * an "and nothing else" line - the use case already guarantees at least one of
 * them has content, so an empty heading would only ever be noise.
 *
 * @param digest - The assembled digest for one recipient.
 * @param copy - The copy table for that recipient's language.
 * @returns The inner HTML for the email's content area.
 */
export function renderDigestSections(
    digest: DailyDigestEmail,
    copy: DigestCopy,
): string {
    const sections: string[] = [];

    if (digest.notifications.length > 0) {
        const items = digest.notifications
            .map((item) => {
                const handle = item.issuerUsername
                    ? `<strong>@${escapeHtml(item.issuerUsername)}</strong> `
                    : "";

                return `<p class="digest-item" style="${ITEM_STYLE}">
                    ${handle}${escapeHtml(copy.notification[item.type])}
                    <br />
                    <a class="digest-link" style="${LINK_STYLE}" href="${escapeHtml(item.url)}">${escapeHtml(copy.seeAll)}</a>
                </p>`;
            })
            .join("");

        sections.push(`<div class="digest-section">
            <p class="section-title" style="${SECTION_TITLE_STYLE}">${escapeHtml(copy.notificationsTitle)}</p>
            ${items}
        </div>`);
    }

    if (digest.posts.length > 0) {
        const items = digest.posts
            .map(
                (item) => `<p class="digest-item" style="${ITEM_STYLE}">
                    <a class="digest-link" style="${LINK_STYLE}" href="${escapeHtml(item.url)}">${escapeHtml(item.excerpt)}</a>
                    <span class="digest-meta" style="${META_STYLE}">@${escapeHtml(item.authorUsername)}</span>
                </p>`,
            )
            .join("");

        sections.push(`<div class="digest-section">
            <p class="section-title" style="${SECTION_TITLE_STYLE}">${escapeHtml(copy.postsTitle)}</p>
            ${items}
        </div>`);
    }

    return sections.join("");
}
