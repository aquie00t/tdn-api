import { describe, expect, it } from "vitest";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";

/**
 * Unit tests for the Conversation entity.
 *
 * The entity is where the ordered-pair storage detail is supposed to stop, so
 * these tests are mostly about that: the same two people must land on the same
 * row whichever way round they are passed, and every per-viewer question must
 * answer correctly for both sides of the pair.
 */
describe("Conversation entity", () => {
    const alice = "aaaa-1111";
    const bob = "bbbb-2222";

    describe("create", () => {
        it("sorts the participant pair regardless of argument order", () => {
            const opened = Conversation.create(
                bob,
                alice,
                ConversationStatus.PENDING,
            );

            expect(opened.userAId).toBe(alice);
            expect(opened.userBId).toBe(bob);
        });

        it("keeps the initiator separate from the sorted pair", () => {
            const opened = Conversation.create(
                bob,
                alice,
                ConversationStatus.PENDING,
            );

            expect(opened.initiatorId).toBe(bob);
        });

        it("starts with both sides read and no messages", () => {
            const opened = Conversation.create(
                alice,
                bob,
                ConversationStatus.ACCEPTED,
            );

            expect(opened.unreadFor(alice)).toBe(0);
            expect(opened.unreadFor(bob)).toBe(0);
            expect(opened.lastMessageAt).toBeNull();
            expect(opened.lastMessagePreview).toBeNull();
        });
    });

    describe("orderPair", () => {
        it("returns the same pair from either direction", () => {
            expect(Conversation.orderPair(bob, alice)).toEqual([alice, bob]);
            expect(Conversation.orderPair(alice, bob)).toEqual([alice, bob]);
        });
    });

    describe("participants", () => {
        const conversation = Conversation.create(
            alice,
            bob,
            ConversationStatus.ACCEPTED,
        );

        it("recognises both participants and nobody else", () => {
            expect(conversation.includes(alice)).toBe(true);
            expect(conversation.includes(bob)).toBe(true);
            expect(conversation.includes("cccc-3333")).toBe(false);
        });

        it("resolves the other participant from either side", () => {
            expect(conversation.otherParticipantId(alice)).toBe(bob);
            expect(conversation.otherParticipantId(bob)).toBe(alice);
        });

        it("throws when asked about someone outside the conversation", () => {
            expect(() =>
                conversation.otherParticipantId("cccc-3333"),
            ).toThrow();
        });

        it("reports which stored column each participant occupies", () => {
            // The one place the A/B naming is allowed out, so the repository
            // can address the per-side columns without re-reading the row.
            expect(conversation.sideFor(alice)).toBe("A");
            expect(conversation.sideFor(bob)).toBe("B");
            expect(conversation.sideFor("cccc-3333")).toBeNull();
        });
    });

    describe("per-viewer state", () => {
        const read = new Date("2026-09-01T10:00:00.000Z");

        const conversation = Conversation.with({
            id: "conv-1",
            userAId: alice,
            userBId: bob,
            initiatorId: alice,
            status: ConversationStatus.ACCEPTED,
            userALastReadAt: read,
            userBLastReadAt: null,
            userAUnread: 0,
            userBUnread: 3,
            lastMessageAt: new Date(),
            lastMessagePreview: "hey",
        });

        it("reads each side's unread count", () => {
            expect(conversation.unreadFor(alice)).toBe(0);
            expect(conversation.unreadFor(bob)).toBe(3);
        });

        it("reports zero unread for a non-participant", () => {
            expect(conversation.unreadFor("cccc-3333")).toBe(0);
        });

        it("reads each side's read watermark", () => {
            expect(conversation.lastReadAtFor(alice)).toEqual(read);
            expect(conversation.lastReadAtFor(bob)).toBeNull();
        });
    });

    describe("canSend", () => {
        it("lets both participants write once accepted", () => {
            const accepted = Conversation.create(
                alice,
                bob,
                ConversationStatus.ACCEPTED,
            );

            expect(accepted.canSend(alice)).toBe(true);
            expect(accepted.canSend(bob)).toBe(true);
        });

        it("lets only the initiator write while pending", () => {
            const pending = Conversation.create(
                alice,
                bob,
                ConversationStatus.PENDING,
            );

            expect(pending.canSend(alice)).toBe(true);
            expect(pending.canSend(bob)).toBe(false);
        });

        it("lets nobody write once declined", () => {
            const declined = Conversation.create(
                alice,
                bob,
                ConversationStatus.DECLINED,
            );

            expect(declined.canSend(alice)).toBe(false);
            expect(declined.canSend(bob)).toBe(false);
        });

        it("refuses somebody outside the conversation", () => {
            const accepted = Conversation.create(
                alice,
                bob,
                ConversationStatus.ACCEPTED,
            );

            expect(accepted.canSend("cccc-3333")).toBe(false);
        });
    });

    describe("requests", () => {
        const pending = Conversation.create(
            alice,
            bob,
            ConversationStatus.PENDING,
        );

        it("is a request for the recipient only", () => {
            expect(pending.isRequestFor(bob)).toBe(true);
            expect(pending.isRequestFor(alice)).toBe(false);
        });

        it("lets only the recipient respond", () => {
            expect(pending.canRespond(bob)).toBe(true);
            expect(pending.canRespond(alice)).toBe(false);
        });

        it("is not a request once accepted", () => {
            const accepted = Conversation.create(
                alice,
                bob,
                ConversationStatus.ACCEPTED,
            );

            expect(accepted.isRequestFor(bob)).toBe(false);
            expect(accepted.canRespond(bob)).toBe(false);
        });
    });

    describe("otherParticipant", () => {
        it("returns the loaded display information for the far side", () => {
            const conversation = Conversation.with({
                id: "conv-1",
                userAId: alice,
                userBId: bob,
                initiatorId: alice,
                status: ConversationStatus.ACCEPTED,
                userAUnread: 0,
                userBUnread: 0,
                participants: [
                    { id: alice, username: "alice" },
                    { id: bob, username: "bob", fullName: "Bob B" },
                ],
            });

            expect(conversation.otherParticipant(alice)?.username).toBe("bob");
            expect(conversation.otherParticipant(bob)?.username).toBe("alice");
        });

        it("returns null when the conversation was read without participants", () => {
            const conversation = Conversation.create(
                alice,
                bob,
                ConversationStatus.ACCEPTED,
            );

            expect(conversation.otherParticipant(alice)).toBeNull();
        });
    });
});
