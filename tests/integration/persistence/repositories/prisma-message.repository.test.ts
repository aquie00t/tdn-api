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
});
