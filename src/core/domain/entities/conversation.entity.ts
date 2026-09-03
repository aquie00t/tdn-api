import { ConversationStatus } from "../enums";
import type {
    ConversationParticipant,
    ConversationProps,
} from "../interfaces/conversation-props.interface";

/**
 * Rich domain model for a one-to-one conversation.
 *
 * The participant pair is held ordered so that (a,b) and (b,a) are the same
 * conversation, which is the only thing making the unique constraint on the
 * pair mean anything. That ordering is storage detail, though, and every
 * question a caller actually asks - who is the other person, how many unread
 * messages do I have, may I write here - is answered per-viewer by this
 * entity. Callers never touch the A/B fields, so nothing outside this file
 * has to remember which side a given user landed on.
 */
export class Conversation {
    private constructor(private readonly props: ConversationProps) {}

    /**
     * Opens a conversation between two users.
     *
     * The pair is sorted here rather than by the caller: a conversation that
     * stored its participants in the order they happened to arrive would let
     * the same two people open two separate threads by writing to each other
     * at the same time.
     *
     * @param initiatorId - The user opening the conversation
     * @param recipientId - The user being written to
     * @param status - PENDING for a request, ACCEPTED when the recipient
     * already follows the initiator
     * @returns A new Conversation entity
     */
    public static create(
        initiatorId: string,
        recipientId: string,
        status: ConversationStatus,
    ): Conversation {
        const [userAId, userBId] = Conversation.orderPair(
            initiatorId,
            recipientId,
        );

        return new Conversation({
            userAId,
            userBId,
            initiatorId,
            status,
            userALastReadAt: null,
            userBLastReadAt: null,
            userAUnread: 0,
            userBUnread: 0,
            lastMessageAt: null,
            lastMessagePreview: null,
        });
    }

    public static with(props: ConversationProps): Conversation {
        return new Conversation(props);
    }

    /**
     * Sorts a participant pair into the order the row stores it in.
     *
     * Exposed so a repository can build a lookup key for two users without
     * having to construct an entity first.
     *
     * @param first - One participant's id
     * @param second - The other participant's id
     * @returns The two ids, smallest first
     */
    public static orderPair(first: string, second: string): [string, string] {
        return first < second ? [first, second] : [second, first];
    }

    get id(): string {
        return this.props.id!;
    }

    get userAId(): string {
        return this.props.userAId;
    }

    get userBId(): string {
        return this.props.userBId;
    }

    get initiatorId(): string {
        return this.props.initiatorId;
    }

    get status(): ConversationStatus {
        return this.props.status;
    }

    /**
     * The key the inbox is ordered and paged on. Always set on a conversation
     * that was read back from storage.
     */
    get lastActivityAt(): Date {
        return this.props.lastActivityAt!;
    }

    get lastMessageAt(): Date | null {
        return this.props.lastMessageAt ?? null;
    }

    get lastMessagePreview(): string | null {
        return this.props.lastMessagePreview ?? null;
    }

    get createdAt(): Date {
        return this.props.createdAt!;
    }

    get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /**
     * Whether the given user is one of the two participants.
     *
     * @param userId - The user to check
     * @returns True when they are in this conversation
     */
    public includes(userId: string): boolean {
        return this.props.userAId === userId || this.props.userBId === userId;
    }

    /**
     * The participant who is not the given user.
     *
     * @param userId - The viewer
     * @returns The other participant's id
     * @throws Error - When the viewer is not in this conversation, which is a
     * programming mistake rather than a request the caller can recover from:
     * every read path checks membership before it gets here.
     */
    public otherParticipantId(userId: string): string {
        if (this.props.userAId === userId) return this.props.userBId;
        if (this.props.userBId === userId) return this.props.userAId;

        throw new Error(
            "otherParticipantId called with a user outside the conversation",
        );
    }

    /**
     * How many messages the given user has not read.
     *
     * @param userId - The viewer
     * @returns Their unread count, zero for a non-participant
     */
    public unreadFor(userId: string): number {
        if (this.props.userAId === userId) return this.props.userAUnread;
        if (this.props.userBId === userId) return this.props.userBUnread;

        return 0;
    }

    /**
     * When the given user last read the thread.
     *
     * The sender reads the *other* side's value to decide whether their own
     * messages have been seen.
     *
     * @param userId - The participant to look up
     * @returns Their read watermark, or null if they never opened the thread
     */
    public lastReadAtFor(userId: string): Date | null {
        if (this.props.userAId === userId)
            return this.props.userALastReadAt ?? null;
        if (this.props.userBId === userId)
            return this.props.userBLastReadAt ?? null;

        return null;
    }

    /**
     * Display information for the participant who is not the given user.
     *
     * @param userId - The viewer
     * @returns The other participant, or null when the conversation was read
     * without them
     */
    public otherParticipant(userId: string): ConversationParticipant | null {
        const otherId = this.otherParticipantId(userId);

        return (
            this.props.participants?.find(
                (participant) => participant.id === otherId,
            ) ?? null
        );
    }

    /**
     * Whether this conversation is an unanswered request addressed to the
     * given user.
     *
     * @param userId - The viewer
     * @returns True when they are the one who has to accept or decline
     */
    public isRequestFor(userId: string): boolean {
        return (
            this.props.status === ConversationStatus.PENDING &&
            this.includes(userId) &&
            this.props.initiatorId !== userId
        );
    }

    /**
     * Whether the given user may post a message here.
     *
     * A pending conversation is one-directional on purpose: the initiator may
     * make their case, and the recipient's first reply is the accept. Letting
     * the recipient write without accepting would leave a thread that is live
     * in one direction and refused in the other.
     *
     * @param userId - The user attempting to write
     * @returns True when the message is allowed
     */
    public canSend(userId: string): boolean {
        if (!this.includes(userId)) return false;

        switch (this.props.status) {
            case ConversationStatus.ACCEPTED:
                return true;
            case ConversationStatus.PENDING:
                return this.props.initiatorId === userId;
            case ConversationStatus.DECLINED:
                return false;
        }
    }

    /**
     * Whether the given user may accept or decline this conversation.
     *
     * @param userId - The user responding
     * @returns True when they are the recipient of a still-pending request
     */
    public canRespond(userId: string): boolean {
        return this.isRequestFor(userId);
    }
}
