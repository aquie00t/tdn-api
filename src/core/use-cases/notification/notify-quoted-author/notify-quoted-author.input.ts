/**
 * Input for the NotifyQuotedAuthorUseCase.
 */
export interface NotifyQuotedAuthorInput {
    /** The post that was just published as a quote, and where the notification leads. */
    quotePostId: string;

    /** The post it quotes, whose author is notified. */
    quotedPostId: string;

    /** The account that published the quote, and the issuer of the notification. */
    issuerId: string;
}
