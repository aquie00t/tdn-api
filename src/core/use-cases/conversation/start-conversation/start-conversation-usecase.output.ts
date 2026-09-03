import type { Conversation } from "@core/domain/entities/conversation.entity";

/**
 * The result of opening a conversation.
 */
export interface StartConversationUseCaseOutput {
    /** The conversation, whether it was just opened or already existed. */
    conversation: Conversation;

    /**
     * Whether this call is what brought the conversation into being.
     *
     * Reported so the endpoint can answer 201 for a creation and 200 for a
     * hand-back, rather than claiming to have created a thread that has been
     * sitting there - possibly declined - for weeks.
     *
     * Derived from whether a conversation was found before writing, so two
     * callers racing to open the same thread can both come back true. The
     * upsert behind them still yields one row; only the status code overstates
     * it, in a window a client cannot act on differently.
     */
    created: boolean;
}
