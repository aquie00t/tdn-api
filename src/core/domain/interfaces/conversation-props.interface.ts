import type { ConversationStatus } from "../enums";

/**
 * The bit of a participant a conversation list has to render.
 *
 * Carried on the conversation rather than fetched separately, the same way a
 * notification carries its issuer's handle: an inbox is a list of people, and
 * resolving each one afterwards would turn one query into a page of them.
 */
export interface ConversationParticipant {
    /** The participant's user id */
    id: string;

    /** Their handle */
    username: string;

    /** Their display name, when they set one */
    fullName?: string;

    /** Their stored avatar key or URL, when they have one */
    avatarUrl?: string;
}

/**
 * Props interface for the Conversation entity.
 *
 * The participant pair is stored ordered - `userAId` sorts before `userBId` -
 * which is what makes (a,b) and (b,a) the same conversation. The A/B naming
 * is an artefact of that ordering and carries no meaning of its own: nothing
 * outside the entity and its mapper should read these fields directly, and
 * the entity exposes everything per-viewer instead.
 */
export interface ConversationProps {
    /** The unique identifier of the conversation, absent until persisted */
    id?: string;

    /** The participant whose id sorts first */
    userAId: string;

    /** The participant whose id sorts second */
    userBId: string;

    /** The participant who opened the conversation */
    initiatorId: string;

    /** Whether the conversation is a request, accepted, or refused */
    status: ConversationStatus;

    /** When the first participant last read the thread */
    userALastReadAt?: Date | null;

    /** When the second participant last read the thread */
    userBLastReadAt?: Date | null;

    /** Messages the first participant has not read */
    userAUnread: number;

    /** Messages the second participant has not read */
    userBUnread: number;

    /** When the newest message arrived, absent while the thread is empty */
    lastMessageAt?: Date | null;

    /** Truncated text of the newest message, for the inbox list */
    lastMessagePreview?: string | null;

    /**
     * Both participants' display information, populated when the conversation
     * is read. Absent on a conversation that was just constructed to be
     * written.
     */
    participants?: ConversationParticipant[];

    /** Creation timestamp, absent until persisted */
    createdAt?: Date;

    /** Last update timestamp, absent until persisted */
    updatedAt?: Date;
}
