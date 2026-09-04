/**
 * Input for the UnsubscribeDigestUseCase.
 */
export interface UnsubscribeDigestInput {
    /** The account the link claims to be for. */
    userId: string;

    /** The signature carried by the link. */
    token: string;

    /**
     * What the reader asked for. Resubscribing uses the same signed link, so
     * somebody who clicks by accident can undo it from the page they land on
     * rather than having to find the setting.
     */
    action: "unsubscribe" | "resubscribe";
}
