import type { Prisma } from "@generated/prisma/client";
import { Conversation } from "@core/domain/entities/conversation.entity";
import type { ConversationStatus } from "@core/domain/enums";

/**
 * The participant selection every conversation query shares.
 *
 * Both sides are loaded rather than just the other one: the row does not know
 * who is reading it, and picking a side in SQL would mean two variants of
 * every query.
 */
export const conversationParticipantSelect = {
    id: true,
    username: true,
    profile: { select: { avatarUrl: true, fullName: true } },
} as const;

export type ConversationWithParticipants = Prisma.ConversationGetPayload<{
    include: {
        userA: { select: typeof conversationParticipantSelect };
        userB: { select: typeof conversationParticipantSelect };
    };
}>;

export interface ConversationResponse {
    id: string;

    /** Whether this is a request, an accepted thread, or a refused one. */
    status: ConversationStatus;

    /** True when the reader is the one who has to accept or decline. */
    isRequest: boolean;

    /** True when the reader may write here. */
    canSend: boolean;

    /** The person on the other end. */
    participant: {
        id: string;
        username: string;
        fullName?: string;
        avatarUrl: string;
    };

    /** How many messages the reader has not seen. */
    unreadCount: number;

    /** Truncated text of the newest message, null while the thread is empty. */
    lastMessagePreview: string | null;

    /** When the newest message arrived, null while the thread is empty. */
    lastMessageAt: Date | null;

    /**
     * When the other participant last opened the thread, null if never. What
     * a client turns into a "seen" marker on the reader's own messages.
     */
    otherLastReadAt: Date | null;

    createdAt: Date;
}

/**
 * Mapper class responsible for transforming Conversation data across layers.
 */
export class ConversationPrismaMapper {
    /**
     * Maps a Prisma record to the domain entity.
     */
    static toDomain(record: ConversationWithParticipants): Conversation {
        return Conversation.with({
            id: record.id,
            userAId: record.userAId,
            userBId: record.userBId,
            initiatorId: record.initiatorId,
            status: record.status as ConversationStatus,
            userALastReadAt: record.userALastReadAt,
            userBLastReadAt: record.userBLastReadAt,
            userAUnread: record.userAUnread,
            userBUnread: record.userBUnread,
            lastMessageAt: record.lastMessageAt,
            lastMessagePreview: record.lastMessagePreview,
            participants: [record.userA, record.userB].map((user) => ({
                id: user.id,
                username: user.username,
                fullName: user.profile?.fullName ?? undefined,
                avatarUrl: user.profile?.avatarUrl ?? undefined,
            })),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        });
    }

    /**
     * Maps a domain entity onto the shape Prisma inserts.
     */
    static toPrismaCreate(
        conversation: Conversation,
    ): Prisma.ConversationUncheckedCreateInput {
        return {
            userAId: conversation.userAId,
            userBId: conversation.userBId,
            initiatorId: conversation.initiatorId,
            status: conversation.status,
        };
    }

    /**
     * Maps a domain entity onto the client-facing shape.
     *
     * Everything is answered from the reader's side - who the other person is,
     * how many messages they have not seen, whether they may write - so no
     * client ever has to know that the row stores its pair in sorted order.
     *
     * @param conversation - The conversation to serialise
     * @param cdnUrl - CDN origin avatar keys are rewritten onto
     * @param viewerId - The reader
     * @returns The response body for one conversation
     */
    static toResponse(
        conversation: Conversation,
        cdnUrl: string,
        viewerId: string,
    ): ConversationResponse {
        const other = conversation.otherParticipant(viewerId);

        // Every repository query that produces a Conversation loads both
        // participants, so this only trips if a new one forgets the include.
        // Failing here beats serialising a thread with nobody on the far end.
        if (!other) {
            throw new Error(
                "ConversationPrismaMapper.toResponse requires a conversation loaded with its participants.",
            );
        }

        return {
            id: conversation.id,
            status: conversation.status,
            isRequest: conversation.isRequestFor(viewerId),
            canSend: conversation.canSend(viewerId),
            participant: {
                id: other.id,
                username: other.username,
                fullName: other.fullName,
                avatarUrl: this.resolveAvatarUrl(other.avatarUrl, cdnUrl),
            },
            unreadCount: conversation.unreadFor(viewerId),
            lastMessagePreview: conversation.lastMessagePreview,
            lastMessageAt: conversation.lastMessageAt,
            otherLastReadAt: conversation.lastReadAtFor(other.id),
            createdAt: conversation.createdAt,
        };
    }

    static toListResponse(
        conversations: Conversation[],
        cdnUrl: string,
        viewerId: string,
    ): ConversationResponse[] {
        return conversations.map((conversation) =>
            this.toResponse(conversation, cdnUrl, viewerId),
        );
    }

    /**
     * Resolves a stored avatar value into something the client can render.
     *
     * An absolute URL is passed through, the seeded default gets a
     * cache-busting suffix, and anything else is a key under the CDN base -
     * the same three cases the post and comment mappers handle.
     *
     * @param avatarUrl - The stored avatar key or URL, if any
     * @param cdnUrl - Base URL for the CDN
     * @returns A URL the client can render directly
     */
    private static resolveAvatarUrl(
        avatarUrl: string | undefined,
        cdnUrl: string,
    ): string {
        if (!avatarUrl) return `${cdnUrl}/default-avatar.png`;
        if (avatarUrl.startsWith("http")) return avatarUrl;
        if (avatarUrl.includes("default_profile")) {
            return `${cdnUrl}/${avatarUrl}?v=1`;
        }
        return `${cdnUrl}/${avatarUrl}`;
    }
}
