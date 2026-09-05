import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { PrismaConversationRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-conversation.repository";
import { Conversation } from "../../../../src/core/domain/entities/conversation.entity";
import { ConversationStatus } from "../../../../src/core/domain/enums";
import { encodeKeysetCursor } from "../../../../src/core/use-cases/shared/pagination/keyset-cursor";
import {
    createEncryptionService,
    createPrismaClient,
} from "../../helpers/setup";

const EMAIL_DOMAIN = "@conversation-test.com";

describe("PrismaConversationRepository (integration)", () => {
    let prisma: PrismaClient;
    let repository: PrismaConversationRepository;
    let alice: string;
    let bob: string;
    let carol: string;

    /**
     * Opens an accepted conversation between two users.
     */
    async function open(
        initiator: string,
        recipient: string,
        status = ConversationStatus.ACCEPTED,
    ): Promise<Conversation> {
        return await repository.create(
            Conversation.create(initiator, recipient, status),
        );
    }

    beforeAll(async () => {
        prisma = createPrismaClient();

        const userRepository = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });

        const created = await Promise.all(
            ["alice", "bob", "carol"].map((name) =>
                userRepository.create({
                    email: `${name}${EMAIL_DOMAIN}`,
                    username: `conv_${name}`,
                    passwordHash: "hashed",
                }),
            ),
        );

        [alice, bob, carol] = created.map((user) => user.id);

        repository = new PrismaConversationRepository(
            prisma,
            createEncryptionService(),
        );
    });

    beforeEach(async () => {
        await prisma.conversation.deleteMany({});
    });

    afterAll(async () => {
        await prisma.conversation.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { endsWith: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    describe("the participant pair", () => {
        it("finds the same conversation from either direction", async () => {
            const opened = await open(alice, bob);

            const forwards = await repository.findBetween(alice, bob);
            const backwards = await repository.findBetween(bob, alice);

            expect(forwards?.id).toBe(opened.id);
            expect(backwards?.id).toBe(opened.id);
        });

        it("hands back the existing row instead of failing on the pair", async () => {
            // Two people writing to each other at the same moment both find
            // nothing and both try to create. The loser of that race has to
            // join the thread rather than hit the unique constraint.
            const first = await open(alice, bob);
            const second = await open(bob, alice);

            expect(second.id).toBe(first.id);
            expect(await prisma.conversation.count()).toBe(1);
        });

        it("does not resurrect a declined conversation", async () => {
            const declined = await open(
                alice,
                bob,
                ConversationStatus.DECLINED,
            );

            const reopened = await open(alice, bob);

            expect(reopened.id).toBe(declined.id);
            expect(reopened.status).toBe(ConversationStatus.DECLINED);
        });
    });

    describe("markRead", () => {
        it("clears what the reader was shown", async () => {
            const conversation = await open(alice, bob);

            await repository.applyNewMessage(conversation.id, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "hello",
            });

            const loaded = await repository.findById(conversation.id);
            expect(loaded?.unreadFor(bob)).toBe(1);

            await repository.markRead(loaded!, bob, new Date());

            const after = await repository.findById(conversation.id);
            expect(after?.unreadFor(bob)).toBe(0);
            expect(after?.lastReadAtFor(bob)).not.toBeNull();
        });

        it("keeps a message that arrived after the reader loaded the thread", async () => {
            // The race the decrement exists for: assigning zero here would
            // mark a message read that the reader was never shown, and the
            // badge would stay wrong until the next one arrived.
            const conversation = await open(alice, bob);

            await repository.applyNewMessage(conversation.id, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "first",
            });

            const loaded = await repository.findById(conversation.id);

            // Alice writes again between Bob loading the thread and his read
            // being recorded.
            await repository.applyNewMessage(conversation.id, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "second",
            });

            await repository.markRead(loaded!, bob, new Date());

            const after = await repository.findById(conversation.id);
            expect(after?.unreadFor(bob)).toBe(1);
        });

        it("does not drive the counter negative when two reads overlap", async () => {
            const conversation = await open(alice, bob);

            await repository.applyNewMessage(conversation.id, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "hello",
            });

            const loaded = await repository.findById(conversation.id);

            // Both calls carry the same observed count, as a double tap would.
            await repository.markRead(loaded!, bob, new Date());
            const second = await repository.markRead(loaded!, bob, new Date());

            const after = await repository.findById(conversation.id);
            expect(after?.unreadFor(bob)).toBe(0);
            expect(second).toBe(false);
        });

        it("refuses a user who is not in the conversation", async () => {
            const conversation = await open(alice, bob);
            const loaded = await repository.findById(conversation.id);

            expect(await repository.markRead(loaded!, carol, new Date())).toBe(
                false,
            );
        });
    });

    describe("getTotalUnreadCount", () => {
        it("sums both sides of the pair", async () => {
            const withBob = await open(alice, bob);
            const withCarol = await open(carol, alice);

            await repository.applyNewMessage(withBob.id, {
                recipientId: alice,
                sentAt: new Date(),
                preview: "from bob",
            });
            await repository.applyNewMessage(withCarol.id, {
                recipientId: alice,
                sentAt: new Date(),
                preview: "from carol",
            });

            // Which column holds Alice's count depends on how the ids sorted
            // in each row, so an aggregate over one of them would be right
            // only by luck.
            expect(await repository.getTotalUnreadCount(alice)).toBe(2);
        });

        it("ignores unanswered requests", async () => {
            const request = await open(alice, bob, ConversationStatus.PENDING);

            await repository.applyNewMessage(request.id, {
                recipientId: bob,
                sentAt: new Date(),
                preview: "let me in",
            });

            // A stranger must not be able to raise the badge by writing.
            expect(await repository.getTotalUnreadCount(bob)).toBe(0);
        });
    });

    describe("listForUser", () => {
        it("pages past conversations that share an activity timestamp", async () => {
            // The regression this fix exists for. Ordering alone cannot carry
            // a tie: it decides how a page is sorted, never which rows it
            // contains, so a cursor holding only the timestamp would make the
            // second page skip whichever row the first page did not end on.
            const sameInstant = new Date("2026-09-03T12:00:00.000Z");

            for (const other of [bob, carol]) {
                const conversation = await open(alice, other);
                await repository.applyNewMessage(conversation.id, {
                    recipientId: other,
                    sentAt: sameInstant,
                    preview: "tie",
                });
            }

            const firstPage = await repository.listForUser({
                userId: alice,
                status: ConversationStatus.ACCEPTED,
                limit: 1,
            });
            expect(firstPage).toHaveLength(1);
            expect(firstPage[0].lastActivityAt).toEqual(sameInstant);

            const secondPage = await repository.listForUser({
                userId: alice,
                status: ConversationStatus.ACCEPTED,
                limit: 1,
                cursor: encodeKeysetCursor({
                    timestamp: firstPage[0].lastActivityAt,
                    id: firstPage[0].id,
                }),
            });

            expect(secondPage).toHaveLength(1);
            expect(secondPage[0].id).not.toBe(firstPage[0].id);
        });

        it("treats a cursor it cannot read as the first page", async () => {
            await open(alice, bob);

            const page = await repository.listForUser({
                userId: alice,
                status: ConversationStatus.ACCEPTED,
                limit: 10,
                cursor: "not-a-real-cursor",
            });

            expect(page).toHaveLength(1);
        });

        it("lists a conversation that has no messages yet", async () => {
            const empty = await open(alice, bob);

            const page = await repository.listForUser({
                userId: alice,
                status: ConversationStatus.ACCEPTED,
                limit: 10,
            });

            // `lastActivityAt` is set at creation, so an empty thread has a
            // sort key and can be paged like any other.
            expect(page.map((c) => c.id)).toContain(empty.id);
            expect(page[0].lastMessageAt).toBeNull();
            expect(page[0].lastActivityAt).toBeInstanceOf(Date);
        });
    });
});
