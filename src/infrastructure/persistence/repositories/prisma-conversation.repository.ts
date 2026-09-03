import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import type {
    ApplyNewMessageInput,
    IConversationRepository,
    ListConversationsInput,
} from "@core/ports/repositories/conversation.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import {
    ConversationPrismaMapper,
    conversationParticipantSelect,
} from "@infrastructure/persistence/mappers/conversation-prisma.mapper";
import type { ConversationStatus as PrismaConversationStatus } from "@generated/prisma/client";

/**
 * Prisma-backed implementation of {@link IConversationRepository}.
 *
 * Owns the ordered-pair storage detail entirely: callers hand over two user
 * ids in whatever order they hold them, and every query here sorts them before
 * it touches the table.
 */
export class PrismaConversationRepository implements IConversationRepository {
    /**
     * Loaded on every read so the mapper can render either side of the thread.
     */
    private readonly include = {
        userA: { select: conversationParticipantSelect },
        userB: { select: conversationParticipantSelect },
    };

    constructor(private readonly prisma: PrismaTransactionalClient) {}

    async findById(id: string): Promise<Conversation | null> {
        const record = await this.prisma.conversation.findUnique({
            where: { id },
            include: this.include,
        });

        return record ? ConversationPrismaMapper.toDomain(record) : null;
    }

    async findBetween(
        firstUserId: string,
        secondUserId: string,
    ): Promise<Conversation | null> {
        const [userAId, userBId] = Conversation.orderPair(
            firstUserId,
            secondUserId,
        );

        const record = await this.prisma.conversation.findUnique({
            where: { userAId_userBId: { userAId, userBId } },
            include: this.include,
        });

        return record ? ConversationPrismaMapper.toDomain(record) : null;
    }

    /**
     * Opens a conversation, or hands back the one that is already there.
     *
     * An upsert rather than a create because two people can write to each
     * other at the same moment: both find nothing, both insert, and the loser
     * of that race would otherwise get a unique-constraint failure instead of
     * the thread the winner just opened. `update: {}` keeps the existing row
     * exactly as it is - in particular it does not resurrect a declined
     * conversation.
     */
    async create(conversation: Conversation): Promise<Conversation> {
        const data = ConversationPrismaMapper.toPrismaCreate(conversation);

        const record = await this.prisma.conversation.upsert({
            where: {
                userAId_userBId: {
                    userAId: conversation.userAId,
                    userBId: conversation.userBId,
                },
            },
            create: data,
            update: {},
            include: this.include,
        });

        return ConversationPrismaMapper.toDomain(record);
    }

    /**
     * Reads one tab of a user's inbox.
     *
     * Ordered by the newest message with the id as a tiebreaker, because two
     * conversations can share a `lastMessageAt` to the millisecond and a
     * cursor over a non-unique column would then skip whichever one the
     * database happened to put second.
     */
    async listForUser(input: ListConversationsInput): Promise<Conversation[]> {
        const records = await this.prisma.conversation.findMany({
            where: {
                status: input.status as PrismaConversationStatus,
                OR: [{ userAId: input.userId }, { userBId: input.userId }],
                ...(input.cursor
                    ? { lastMessageAt: { lt: new Date(input.cursor) } }
                    : {}),
            },
            orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
            take: input.limit,
            include: this.include,
        });

        return records.map((record) =>
            ConversationPrismaMapper.toDomain(record),
        );
    }

    async updateStatus(id: string, status: ConversationStatus): Promise<void> {
        await this.prisma.conversation.update({
            where: { id },
            data: { status: status as PrismaConversationStatus },
        });
    }

    /**
     * Bumps the recipient's unread count and refreshes the inbox line.
     *
     * The counter is incremented rather than recomputed: a count query would
     * race every other message being written to the same thread, and the
     * increment is already inside the transaction that wrote the message.
     */
    async applyNewMessage(
        id: string,
        input: ApplyNewMessageInput,
    ): Promise<void> {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id },
            select: { userAId: true },
        });

        if (!conversation) return;

        const recipientIsA = conversation.userAId === input.recipientId;

        await this.prisma.conversation.update({
            where: { id },
            data: {
                lastMessageAt: input.sentAt,
                lastMessagePreview: input.preview,
                ...(recipientIsA
                    ? { userAUnread: { increment: 1 } }
                    : { userBUnread: { increment: 1 } }),
            },
        });
    }

    async markRead(id: string, userId: string, readAt: Date): Promise<boolean> {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id },
            select: { userAId: true, userBId: true },
        });

        if (!conversation) return false;

        const isA = conversation.userAId === userId;

        if (!isA && conversation.userBId !== userId) return false;

        await this.prisma.conversation.update({
            where: { id },
            data: isA
                ? { userAUnread: 0, userALastReadAt: readAt }
                : { userBUnread: 0, userBLastReadAt: readAt },
        });

        return true;
    }

    /**
     * Sums a user's unread messages.
     *
     * Two aggregates rather than one: which column holds a given user's count
     * depends on which side of the ordered pair they landed on, and that is
     * not something a single `sum` can express.
     */
    async getTotalUnreadCount(userId: string): Promise<number> {
        const [asA, asB] = await Promise.all([
            this.prisma.conversation.aggregate({
                where: {
                    userAId: userId,
                    status: ConversationStatus.ACCEPTED,
                },
                _sum: { userAUnread: true },
            }),
            this.prisma.conversation.aggregate({
                where: {
                    userBId: userId,
                    status: ConversationStatus.ACCEPTED,
                },
                _sum: { userBUnread: true },
            }),
        ]);

        return (asA._sum.userAUnread ?? 0) + (asB._sum.userBUnread ?? 0);
    }
}
