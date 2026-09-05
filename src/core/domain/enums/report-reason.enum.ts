/**
 * Why a reporter says the content should not be there.
 *
 * Deliberately short, and close to the categories the media moderation tiers
 * already use, so a human reading the queue is answering the same question the
 * automated pipeline answers. `OTHER` exists because the alternative is people
 * picking the nearest wrong label and the queue losing its meaning.
 *
 * Mirrors the `ReportReason` enum in the Prisma schema exactly.
 */
export enum ReportReason {
    SPAM = "SPAM",
    HARASSMENT = "HARASSMENT",
    HATE = "HATE",
    SEXUAL = "SEXUAL",
    VIOLENCE = "VIOLENCE",
    SELF_HARM = "SELF_HARM",
    MISINFORMATION = "MISINFORMATION",
    ILLEGAL = "ILLEGAL",
    OTHER = "OTHER",
}
