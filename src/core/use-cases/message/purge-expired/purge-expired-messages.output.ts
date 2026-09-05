/**
 * What one retention pass removed.
 */
export interface PurgeExpiredMessagesOutput {
    /** Messages permanently deleted. */
    deletedMessages: number;

    /** Attachment objects removed from storage. */
    deletedMedia: number;

    /**
     * Attachments storage refused to remove.
     *
     * Reported rather than thrown: an object the bucket has already lost must
     * not stop the pass, but a number that climbs run after run is the signal
     * that storage is failing and files are surviving their messages.
     */
    failedMedia: number;

    /** Conversations whose preview and counters were cleared. */
    clearedConversations: number;
}
