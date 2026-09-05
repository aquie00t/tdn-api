import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { PrismaMessageRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-message.repository";
import { PrismaConversationRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-conversation.repository";
import { Conversation } from "../../../../src/core/domain/entities/conversation.entity";
import { Message } from "../../../../src/core/domain/entities/message.entity";
import {
    ConversationStatus,
    MediaModerationStatus,
} from "../../../../src/core/domain/enums";
import { EncVersion } from "../../../../src/infrastructure/persistence/encryption/encrypted-column";
import {
    createEncryptionService,
    createPrismaClient,
} from "../../helpers/setup";

const EMAIL_DOMAIN = "@message-encryption-test.com";

describe("PrismaMessageRepository encryption (integration)", () => {
    let prisma: PrismaClient;
    let messages: PrismaMessageRepository;
    let conversations: PrismaConversationRepository;
    let alice: string;
    let bob: string;
    let conversationId: string;

    const write = async (content: string): Promise<string> => {
        const saved = await messages.create(
            Message.create({
                conversationId,
                senderId: alice,
                content,
                mediaUrls: [],
                isSensitive: false,
                mediaStatus: MediaModerationStatus.APPROVED,
            }),
        );

        return saved.id;
    };

    beforeAll(async () => {
        prisma = createPrismaClient();

        const encryption = createEncryptionService();
        messages = new PrismaMessageRepository(prisma, encryption);
        conversations = new PrismaConversationRepository(prisma, encryption);

        const userRepository = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });

        const created = await Promise.all(
            ["alice", "bob"].map((name) =>
                userRepository.create({
                    email: `${name}${EMAIL_DOMAIN}`,
                    username: `msgenc_${name}`,
                    passwordHash: "hashed",
                }),
            ),
        );

        [alice, bob] = created.map((user) => user.id);
    });

    beforeEach(async () => {
        await prisma.conversation.deleteMany({});

        const conversation = await conversations.create(
            Conversation.create(alice, bob, ConversationStatus.ACCEPTED),
        );
        conversationId = conversation.id;
    });

    afterAll(async () => {
        await prisma.conversation.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { contains: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    describe("what the table holds", () => {
        it("should not store the message text in the clear", async () => {
            // The whole point of the feature, asserted against the real column
            // rather than through the repository that would decrypt it.
            const id = await write("bu mesaj gizli kalmalı");

            const raw = await prisma.message.findUniqueOrThrow({
                where: { id },
                select: { content: true, encVersion: true },
            });

            expect(raw.content).not.toContain("gizli");
            expect(raw.encVersion).toBe(EncVersion.SERVER);
        });

        it("should not store the inbox preview in the clear", async () => {
            await conversations.applyNewMessage(conversationId, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "önizleme de gizli",
            });

            const raw = await prisma.conversation.findUniqueOrThrow({
                where: { id: conversationId },
                select: {
                    lastMessagePreview: true,
                    previewEncVersion: true,
                },
            });

            expect(raw.lastMessagePreview).not.toContain("gizli");
            expect(raw.previewEncVersion).toBe(EncVersion.SERVER);
        });

        it("should write a different ciphertext for the same text twice", async () => {
            const [first, second] = [
                await write("aynı metin"),
                await write("aynı metin"),
            ];

            const rows = await prisma.message.findMany({
                where: { id: { in: [first, second] } },
                select: { content: true },
            });

            expect(rows[0].content).not.toBe(rows[1].content);
        });
    });

    describe("what the application sees", () => {
        it("should read the text back through findById", async () => {
            const id = await write("gidiş dönüş");

            expect((await messages.findById(id))?.content).toBe("gidiş dönüş");
        });

        it("should read the text back through listByConversation", async () => {
            await write("listede de çözülmeli");

            const page = await messages.listByConversation({
                conversationId,
                limit: 10,
            });

            expect(page[0].content).toBe("listede de çözülmeli");
        });

        it("should read the preview back through the conversation", async () => {
            await conversations.applyNewMessage(conversationId, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "çözülmüş önizleme",
            });

            const conversation = await conversations.findById(conversationId);

            expect(conversation?.lastMessagePreview).toBe("çözülmüş önizleme");
        });

        it("should round-trip a media-only message with no text", async () => {
            const id = await write("");

            expect((await messages.findById(id))?.content).toBe("");
        });
    });

    describe("rows written before encryption existed", () => {
        it("should read a plaintext row as-is", async () => {
            // Written the way the old code wrote it: encVersion stays 0, so
            // the repository must hand it back untouched rather than trying to
            // decrypt it. This is what lets the migration ship ahead of the
            // backfill.
            const legacy = await prisma.message.create({
                data: {
                    conversationId,
                    senderId: alice,
                    content: "eski düz metin",
                    encVersion: EncVersion.PLAINTEXT,
                },
                select: { id: true },
            });

            expect((await messages.findById(legacy.id))?.content).toBe(
                "eski düz metin",
            );
        });

        it("should read a plaintext preview as-is", async () => {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    lastMessagePreview: "eski önizleme",
                    previewEncVersion: EncVersion.PLAINTEXT,
                },
            });

            const conversation = await conversations.findById(conversationId);

            expect(conversation?.lastMessagePreview).toBe("eski önizleme");
        });

        it("should serve a mixed thread, old and new together", async () => {
            await prisma.message.create({
                data: {
                    conversationId,
                    senderId: alice,
                    content: "eski",
                    encVersion: EncVersion.PLAINTEXT,
                },
            });
            await write("yeni");

            const page = await messages.listByConversation({
                conversationId,
                limit: 10,
            });

            expect(page.map((message) => message.content).sort()).toEqual([
                "eski",
                "yeni",
            ]);
        });
    });

    describe("withdrawing a message", () => {
        it("should destroy the text rather than hide it", async () => {
            const id = await write("bunu geri çekiyorum");

            await messages.softDelete(id, new Date());

            const raw = await prisma.message.findUniqueOrThrow({
                where: { id },
                select: { content: true, encVersion: true, mediaUrls: true },
            });

            // The row survives so replies still have something to hang off,
            // but nothing of what was said does. Before this, "delete" only
            // stopped the mapper from serving the text.
            expect(raw.content).not.toContain("geri");
            expect(raw.mediaUrls).toEqual([]);
            expect(raw.encVersion).toBe(EncVersion.SERVER);
        });

        it("should leave a row that still reads back", async () => {
            const id = await write("silinecek");

            await messages.softDelete(id, new Date());
            const withdrawn = await messages.findById(id);

            // The blanked text is an encrypted empty string. A bare "" in a
            // column marked as ciphertext is too short to be a valid payload
            // and this read would throw instead.
            expect(withdrawn?.content).toBe("");
            expect(withdrawn?.isDeleted).toBe(true);
        });
    });

    describe("retention", () => {
        /** Writes a message and backdates it past the window. */
        const writeAged = async (
            content: string,
            daysOld: number,
        ): Promise<string> => {
            const id = await write(content);
            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - daysOld);

            await prisma.message.update({
                where: { id },
                data: { createdAt },
            });

            return id;
        };

        it("should find only messages past the cutoff", async () => {
            const old = await writeAged("eski", 400);
            await write("yeni");

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 365);

            const expired = await messages.findExpired(cutoff, 100);

            expect(expired.map((message) => message.id)).toEqual([old]);
        });

        it("should carry the media urls the purge has to delete", async () => {
            const id = await write("");
            await prisma.message.update({
                where: { id },
                data: {
                    mediaUrls: ["https://cdn.example.com/messages/a.jpg"],
                    createdAt: new Date("2020-01-01T00:00:00.000Z"),
                },
            });

            const [expired] = await messages.findExpired(new Date(), 100);

            // Read before the row goes: afterwards nothing names the objects.
            expect(expired.mediaUrls).toEqual([
                "https://cdn.example.com/messages/a.jpg",
            ]);
        });

        it("should delete by id and report the count", async () => {
            const first = await write("bir");
            const second = await write("iki");

            expect(await messages.deleteByIds([first, second])).toBe(2);
            expect(await messages.findById(first)).toBeNull();
        });

        it("should treat an empty id list as a no-op", async () => {
            expect(await messages.deleteByIds([])).toBe(0);
        });

        it("should clear the preview of an expired thread", async () => {
            await conversations.applyNewMessage(conversationId, {
                recipientId: bob,
                sentAt: new Date("2020-01-01T00:00:00.000Z"),
                preview: "çok eski önizleme",
            });

            const cleared = await conversations.clearExpiredPreviews(
                new Date(),
            );

            expect(cleared).toBe(1);

            const raw = await prisma.conversation.findUniqueOrThrow({
                where: { id: conversationId },
                select: {
                    lastMessagePreview: true,
                    lastMessageAt: true,
                    userAUnread: true,
                    userBUnread: true,
                    lastActivityAt: true,
                },
            });

            // The preview is a copy of the message text; leaving it would keep
            // the opening of the conversation readable after everything it
            // summarised was purged.
            expect(raw.lastMessagePreview).toBeNull();
            expect(raw.lastMessageAt).toBeNull();
            expect(raw.userAUnread).toBe(0);
            expect(raw.userBUnread).toBe(0);
            // The inbox sort key is left alone: resetting it would reshuffle
            // somebody's inbox as a side effect of a cleanup job.
            expect(raw.lastActivityAt).not.toBeNull();
        });

        it("should leave a thread whose messages are still within the window", async () => {
            await conversations.applyNewMessage(conversationId, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "taze önizleme",
            });

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 365);

            expect(await conversations.clearExpiredPreviews(cutoff)).toBe(0);
            expect(
                (await conversations.findById(conversationId))
                    ?.lastMessagePreview,
            ).toBe("taze önizleme");
        });

        it("should keep the conversation row itself", async () => {
            await conversations.applyNewMessage(conversationId, {
                recipientId: bob,
                sentAt: new Date("2020-01-01T00:00:00.000Z"),
                preview: "eski",
            });

            await conversations.clearExpiredPreviews(new Date());

            // An emptied thread renders like a freshly opened one. Deleting it
            // is a larger decision than expiring its contents.
            expect(await conversations.findById(conversationId)).not.toBeNull();
        });
    });
});
