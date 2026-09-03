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
import { decodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";

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
     * Reads one tab of a user's inbox, most recent activity first.
     *
     * The cursor carries the row's id as well as its timestamp, and the
     * predicate uses both. An `orderBy` tiebreaker alone would not do:
     * ordering decides how a page is sorted, never which rows it contains, so
     * a bare `lastActivityAt < cursor` drops every conversation sharing the
     * boundary timestamp - which is exactly what several messages committing
     * in the same millisecond produce.
     *
     * Ordering is on `lastActivityAt` rather than `lastMessageAt` because the
     * latter is null until a thread has a message. Postgres sorts NULLs first
     * in a DESC order, so empty threads would pin above every active one, and
     * a cursor - which can only carry a value - could never resume from inside
     * that block.
     *
     * A cursor that cannot be decoded is treated as absent rather than as an
     * error, and the reader gets the first page back. That is what somebody
     * holding a truncated or stale cursor actually wants to see.
     */
    async listForUser(input: ListConversationsInput): Promise<Conversation[]> {
        const after = input.cursor ? decodeKeysetCursor(input.cursor) : null;

        const records = await this.prisma.conversation.findMany({
            where: {
                status: input.status as PrismaConversationStatus,
                // Two OR groups cannot sit side by side on one filter object,
                // so membership and the cursor are ANDed explicitly.
                AND: [
                    {
                        OR: [
                            { userAId: input.userId },
                            { userBId: input.userId },
                        ],
                    },
                    ...(after
                        ? [
                              {
                                  OR: [
                                      {
                                          lastActivityAt: {
                                              lt: after.timestamp,
                                          },
                                      },
                                      {
                                          lastActivityAt: after.timestamp,
                                          id: { lt: after.id },
                                      },
                                  ],
                              },
                          ]
                        : []),
                ],
            },
            orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
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
                lastActivityAt: input.sentAt,
                lastMessageAt: input.sentAt,
                lastMessagePreview: input.preview,
                ...(recipientIsA
                    ? { userAUnread: { increment: 1 } }
                    : { userBUnread: { increment: 1 } }),
            },
        });
    }

    /**
     * Records that one participant read the thread.
     *
     * One statement, and it has to be. Re-reading the row to find the reader's
     * side would be a second round-trip for something the caller already
     * holds, and clearing the counter with an assignment would swallow any
     * message that arrived since: `applyNewMessage` increments, so a write of
     * zero landing after it marks a message read that nobody has seen. Taking
     * away exactly the number the reader was shown leaves such a message
     * counted, and the `gte` guard keeps a second concurrent read from
     * subtracting the same messages twice and driving the counter negative.
     */
    async markRead(
        conversation: Conversation,
        userId: string,
        readAt: Date,
    ): Promise<boolean> {
        const side = conversation.sideFor(userId);

        if (!side) return false;

        const seen = conversation.unreadFor(userId);

        const { count } = await this.prisma.conversation.updateMany({
            where:
                side === "A"
                    ? {
                          id: conversation.id,
                          userAId: userId,
                          userAUnread: { gte: seen },
                      }
                    : {
                          id: conversation.id,
                          userBId: userId,
                          userBUnread: { gte: seen },
                      },
            data:
                side === "A"
                    ? {
                          userAUnread: { decrement: seen },
                          userALastReadAt: readAt,
                      }
                    : {
                          userBUnread: { decrement: seen },
                          userBLastReadAt: readAt,
                      },
        });

        return count > 0;
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
