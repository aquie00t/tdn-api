import type { Message } from "@core/domain/entities/message.entity";
import type { MediaState } from "@core/ports/repositories/media-asset.repository";
import type {
    IMessageRepository,
    ListMessagesInput,
} from "@core/ports/repositories/message.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { MessagePrismaMapper } from "@infrastructure/persistence/mappers/message-prisma.mapper";
import type { MediaModerationStatus as PrismaMediaModerationStatus } from "@generated/prisma/client";
import { decodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";

/**
 * Prisma-backed implementation of {@link IMessageRepository}.
 */
export class PrismaMessageRepository implements IMessageRepository {
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    async create(message: Message): Promise<Message> {
        const record = await this.prisma.message.create({
            data: MessagePrismaMapper.toPrismaCreate(message),
        });

        return MessagePrismaMapper.toDomain(record);
    }

    async findById(id: string): Promise<Message | null> {
        const record = await this.prisma.message.findUnique({
            where: { id },
        });

        return record ? MessagePrismaMapper.toDomain(record) : null;
    }

    /**
     * Reads one page of a thread, newest first.
     *
     * The cursor carries the row's id as well as its timestamp, and the
     * predicate uses both. Two messages written in the same millisecond are
     * ordinary in a live conversation, and a bare `createdAt < cursor` would
     * drop whichever of them the previous page did not end on. An `orderBy`
     * tiebreaker cannot prevent that: ordering never decides which rows a
     * page contains.
     *
     * A cursor that cannot be decoded is treated as absent, so a reader
     * holding a stale one gets the newest page rather than an error.
     */
    async listByConversation(input: ListMessagesInput): Promise<Message[]> {
        const after = input.cursor ? decodeKeysetCursor(input.cursor) : null;

        const records = await this.prisma.message.findMany({
            where: {
                conversationId: input.conversationId,
                ...(after
                    ? {
                          OR: [
                              { createdAt: { lt: after.timestamp } },
                              {
                                  createdAt: after.timestamp,
                                  id: { lt: after.id },
                              },
                          ],
                      }
                    : {}),
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: input.limit,
        });

        return records.map((record) => MessagePrismaMapper.toDomain(record));
    }

    async softDelete(id: string, deletedAt: Date): Promise<void> {
        await this.prisma.message.update({
            where: { id },
            data: { deletedAt },
        });
    }

    async updateMediaState(
        messageId: string,
        state: MediaState,
    ): Promise<void> {
        await this.prisma.message.update({
            where: { id: messageId },
            data: {
                mediaUrls: state.mediaUrls,
                isSensitive: state.isSensitive,
                mediaStatus: state.mediaStatus as PrismaMediaModerationStatus,
            },
        });
    }
}
