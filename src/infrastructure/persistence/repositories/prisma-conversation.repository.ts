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
import type { EncryptionPort } from "@core/ports/services/encryption.port";
import {
    decryptNullableColumn,
    encryptColumn,
    EncVersion,
} from "@infrastructure/persistence/encryption/encrypted-column";

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

    /**
     * Creates a new PrismaConversationRepository instance.
     *
     * @param prisma - The Prisma client, or a transaction-scoped client.
     * @param messageEncryptionService - Cipher for the denormalised preview,
     * which is a copy of message text and so is held the same way.
     */
    constructor(
        private readonly prisma: PrismaTransactionalClient,
        private readonly messageEncryptionService: EncryptionPort,
    ) {}

    /**
     * Rebuilds the entity from a row, decrypting the preview as it goes.
     *
     * @param record - The stored row, with both participants loaded.
     * @returns The domain entity, holding a plaintext preview.
     */
    private toDomain(
        record: Parameters<typeof ConversationPrismaMapper.toDomain>[0],
    ): Conversation {
        return ConversationPrismaMapper.toDomain({
            ...record,
            lastMessagePreview: decryptNullableColumn(
                this.messageEncryptionService,
                record.lastMessagePreview,
                record.previewEncVersion,
            ),
        });
    }

    async findById(id: string): Promise<Conversation | null> {
        const record = await this.prisma.conversation.findUnique({
            where: { id },
            include: this.include,
        });

        return record ? this.toDomain(record) : null;
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

        return record ? this.toDomain(record) : null;
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

        return this.toDomain(record);
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
                    // A blocked counterpart is filtered here rather than
                    // after the read: the page fetches one extra row to detect
                    // a next page, and removing rows afterwards would break
                    // both the page size and that signal.
                    ...(input.excludeUserIds && input.excludeUserIds.length > 0
                        ? [
                              {
                                  NOT: {
                                      OR: [
                                          {
                                              userAId: {
                                                  in: input.excludeUserIds,
                                              },
                                          },
                                          {
                                              userBId: {
                                                  in: input.excludeUserIds,
                                              },
                                          },
                                      ],
                                  },
                              },
                          ]
                        : []),
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

        return records.map((record) => this.toDomain(record));
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

        // The preview is a copy of the message text, so it is protected the
        // same way. Leaving it in the clear would hand a reader of this table
        // the first 140 characters of every conversation on the platform,
        // which is most of what encrypting the messages was for.
        const preview = encryptColumn(
            this.messageEncryptionService,
            input.preview,
        );

        await this.prisma.conversation.update({
            where: { id },
            data: {
                lastActivityAt: input.sentAt,
                lastMessageAt: input.sentAt,
                lastMessagePreview: preview.value,
                previewEncVersion: preview.encVersion,
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
     * Clears the preview and counters of threads whose messages have expired.
     *
     * One statement rather than a read-then-write loop: the predicate is the
     * same `lastMessageAt` the purge used to pick its rows, so the database can
     * find them without this having to name them.
     *
     * `lastActivityAt` is deliberately left alone. It is the inbox's sort key
     * and is never null; resetting it would reshuffle somebody's inbox as a
     * side effect of a cleanup job.
     */
    async clearExpiredPreviews(cutoff: Date): Promise<number> {
        const { count } = await this.prisma.conversation.updateMany({
            where: { lastMessageAt: { lt: cutoff } },
            data: {
                lastMessagePreview: null,
                previewEncVersion: EncVersion.PLAINTEXT,
                lastMessageAt: null,
                userAUnread: 0,
                userBUnread: 0,
            },
        });

        return count;
    }

    /**
     * Sums a user's unread messages.
     *
     * Two aggregates rather than one: which column holds a given user's count
     * depends on which side of the ordered pair they landed on, and that is
     * not something a single `sum` can express.
     */
    async getTotalUnreadCount(
        userId: string,
        excludeUserIds: string[] = [],
    ): Promise<number> {
        // The viewer sits on one side of the pair, so the counterpart to
        // exclude is always the other column.
        const hasExclusions = excludeUserIds.length > 0;

        const [asA, asB] = await Promise.all([
            this.prisma.conversation.aggregate({
                where: {
                    userAId: userId,
                    status: ConversationStatus.ACCEPTED,
                    ...(hasExclusions
                        ? { userBId: { notIn: excludeUserIds } }
                        : {}),
                },
                _sum: { userAUnread: true },
            }),
            this.prisma.conversation.aggregate({
                where: {
                    userBId: userId,
                    status: ConversationStatus.ACCEPTED,
                    ...(hasExclusions
                        ? { userAId: { notIn: excludeUserIds } }
                        : {}),
                },
                _sum: { userBUnread: true },
            }),
        ]);

        return (asA._sum.userAUnread ?? 0) + (asB._sum.userBUnread ?? 0);
    }
}
