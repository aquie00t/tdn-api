import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurgeExpiredMessagesUseCase } from "@core/use-cases/message/purge-expired";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type {
    ExpiredMessage,
    IMessageRepository,
} from "@core/ports/repositories/message.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { StoragePort } from "@core/ports/services/storage.port";

const CDN_URL = "https://cdn.example.com";
const RETENTION_DAYS = 365;

describe("PurgeExpiredMessagesUseCase", () => {
    let useCase: PurgeExpiredMessagesUseCase;
    let messageRepo: Pick<IMessageRepository, "findExpired" | "deleteByIds">;
    let conversationRepo: Pick<IConversationRepository, "clearExpiredPreviews">;
    let storageSvc: Pick<StoragePort, "delete">;
    let logger: Pick<LoggerPort, "error">;

    /** Queues batches so the loop terminates on the empty one. */
    const queueBatches = (...batches: ExpiredMessage[][]): void => {
        const mock = vi.mocked(messageRepo.findExpired);
        for (const batch of batches) mock.mockResolvedValueOnce(batch);
        mock.mockResolvedValue([]);
    };

    beforeEach(() => {
        messageRepo = {
            findExpired: vi.fn().mockResolvedValue([]),
            deleteByIds: vi.fn(async (ids: string[]) => ids.length),
        };
        conversationRepo = {
            clearExpiredPreviews: vi.fn().mockResolvedValue(0),
        };
        storageSvc = { delete: vi.fn().mockResolvedValue(undefined) };
        logger = { error: vi.fn() };

        useCase = new PurgeExpiredMessagesUseCase(
            messageRepo as IMessageRepository,
            conversationRepo as IConversationRepository,
            storageSvc as StoragePort,
            logger as LoggerPort,
            CDN_URL,
        );
    });

    describe("the cutoff", () => {
        it("asks for messages older than the retention window", async () => {
            const before = Date.now();

            await useCase.execute(RETENTION_DAYS);

            const [cutoff] = vi.mocked(messageRepo.findExpired).mock.calls[0];
            const expected = new Date(before);
            expected.setDate(expected.getDate() - RETENTION_DAYS);

            // Same day, allowing for the clock moving during the call.
            expect(cutoff.toDateString()).toBe(expected.toDateString());
        });

        it("clears the previews against the same cutoff", async () => {
            await useCase.execute(RETENTION_DAYS);

            const [findCutoff] = vi.mocked(messageRepo.findExpired).mock
                .calls[0];
            const [clearCutoff] = vi.mocked(
                conversationRepo.clearExpiredPreviews,
            ).mock.calls[0];

            // A preview cleared against a different moment would either
            // survive its messages or outlive a thread that still has some.
            expect(clearCutoff.toDateString()).toBe(findCutoff.toDateString());
        });
    });

    describe("deleting", () => {
        it("reports nothing when there is nothing expired", async () => {
            const result = await useCase.execute(RETENTION_DAYS);

            expect(result.deletedMessages).toBe(0);
            expect(messageRepo.deleteByIds).not.toHaveBeenCalled();
        });

        it("deletes the media before the rows", async () => {
            queueBatches([
                { id: "m1", mediaUrls: [`${CDN_URL}/messages/a.jpg`] },
            ]);

            const order: string[] = [];
            vi.mocked(storageSvc.delete).mockImplementation(async () => {
                order.push("storage");
            });
            vi.mocked(messageRepo.deleteByIds).mockImplementation(
                async (ids) => {
                    order.push("rows");
                    return ids.length;
                },
            );

            await useCase.execute(RETENTION_DAYS);

            // The URLs live on the row. Deleting it first would take with it
            // the only record of which objects belonged to it.
            expect(order).toEqual(["storage", "rows"]);
        });

        it("works through several batches", async () => {
            queueBatches(
                [{ id: "m1", mediaUrls: [] }],
                [{ id: "m2", mediaUrls: [] }],
            );

            const result = await useCase.execute(RETENTION_DAYS);

            expect(result.deletedMessages).toBe(2);
            expect(messageRepo.deleteByIds).toHaveBeenCalledTimes(2);
        });

        it("reports the conversations it cleared", async () => {
            vi.mocked(conversationRepo.clearExpiredPreviews).mockResolvedValue(
                4,
            );

            const result = await useCase.execute(RETENTION_DAYS);

            expect(result.clearedConversations).toBe(4);
        });
    });

    describe("storage failures", () => {
        it("counts them and still deletes the rows", async () => {
            queueBatches([
                { id: "m1", mediaUrls: [`${CDN_URL}/messages/a.jpg`] },
            ]);
            vi.mocked(storageSvc.delete).mockRejectedValue(
                new Error("bucket unreachable"),
            );

            const result = await useCase.execute(RETENTION_DAYS);

            // Stopping here would leave every message behind this one in the
            // history undeleted, which is worse than one surviving file.
            expect(result.failedMedia).toBe(1);
            expect(result.deletedMessages).toBe(1);
            expect(logger.error).toHaveBeenCalled();
        });

        it("counts what did go", async () => {
            queueBatches([
                {
                    id: "m1",
                    mediaUrls: [
                        `${CDN_URL}/messages/a.jpg`,
                        `${CDN_URL}/messages/b.jpg`,
                    ],
                },
            ]);

            const result = await useCase.execute(RETENTION_DAYS);

            expect(result.deletedMedia).toBe(2);
            expect(result.failedMedia).toBe(0);
        });

        it("skips a URL pointing outside the CDN", async () => {
            queueBatches([
                { id: "m1", mediaUrls: ["https://elsewhere.example.com/x"] },
            ]);

            const result = await useCase.execute(RETENTION_DAYS);

            expect(storageSvc.delete).not.toHaveBeenCalled();
            expect(result.deletedMedia).toBe(0);
        });
    });
});
