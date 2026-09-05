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
import type { EncryptionPort } from "@core/ports/services/encryption.port";
import {
    decryptColumn,
    encryptColumn,
} from "@infrastructure/persistence/encryption/encrypted-column";
import type { MessageRecord } from "@infrastructure/persistence/mappers/message-prisma.mapper";

/**
 * Prisma-backed implementation of {@link IMessageRepository}.
 *
 * Message text is encrypted here, on the way to the column, and decrypted on
 * the way back. Deliberately not in the mapper and not in the domain: what a
 * row looks like at rest is a persistence concern, and `Message.content` stays
 * plaintext everywhere above this class - the entity, the use cases and
 * `Message.preview()` never learn that the column is a ciphertext blob.
 */
export class PrismaMessageRepository implements IMessageRepository {
    /**
     * Creates a new PrismaMessageRepository instance.
     *
     * @param prisma - The Prisma client, or a transaction-scoped client.
     * @param messageEncryptionService - Cipher for the message text at rest.
     */
    constructor(
        private readonly prisma: PrismaTransactionalClient,
        private readonly messageEncryptionService: EncryptionPort,
    ) {}

    /**
     * Rebuilds the entity from a row, decrypting the text as it goes.
     *
     * @param record - The stored row.
     * @returns The domain entity, holding plaintext.
     */
    private toDomain(record: MessageRecord): Message {
        return MessagePrismaMapper.toDomain({
            ...record,
            content: decryptColumn(
                this.messageEncryptionService,
                record.content,
                record.encVersion,
            ),
        });
    }

    async create(message: Message): Promise<Message> {
        const { value, encVersion } = encryptColumn(
            this.messageEncryptionService,
            message.content,
        );

        const record = await this.prisma.message.create({
            data: {
                ...MessagePrismaMapper.toPrismaCreate(message),
                content: value,
                encVersion,
            },
        });

        return this.toDomain(record);
    }

    async findById(id: string): Promise<Message | null> {
        const record = await this.prisma.message.findUnique({
            where: { id },
        });

        return record ? this.toDomain(record) : null;
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

        return records.map((record) => this.toDomain(record));
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
