import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListConversationsUseCase } from "@core/use-cases/conversation/list-conversations/list-conversations.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import { decodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import { buildBlockRepository } from "../../../helpers/mock-factories";

const VIEWER = "aaaa-1111";

const buildConversation = (
    id: string,
    lastActivityAt: Date,
    lastMessageAt: Date | null = lastActivityAt,
): Conversation =>
    Conversation.with({
        id,
        userAId: VIEWER,
        userBId: `other-${id}`,
        initiatorId: VIEWER,
        status: ConversationStatus.ACCEPTED,
        userAUnread: 0,
        userBUnread: 0,
        lastActivityAt,
        lastMessageAt,
    });

describe("ListConversationsUseCase", () => {
    let useCase: ListConversationsUseCase;
    let conversationRepo: Pick<IConversationRepository, "listForUser">;

    beforeEach(() => {
        conversationRepo = { listForUser: vi.fn().mockResolvedValue([]) };

        useCase = new ListConversationsUseCase(
            conversationRepo as IConversationRepository,
            buildBlockRepository(),
        );
    });

    it("asks for one conversation more than the page size", async () => {
        await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.ACCEPTED,
            limit: 2,
        });

        expect(conversationRepo.listForUser).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 3 }),
        );
    });

    it("trims the extra row and returns a cursor when there is more", async () => {
        const page = [
            buildConversation("c1", new Date("2026-09-03T12:00:00.000Z")),
            buildConversation("c2", new Date("2026-09-03T11:00:00.000Z")),
            buildConversation("c3", new Date("2026-09-03T10:00:00.000Z")),
        ];
        vi.mocked(conversationRepo.listForUser).mockResolvedValue(page);

        const result = await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.ACCEPTED,
            limit: 2,
        });

        expect(result.conversations).toHaveLength(2);
        expect(decodeKeysetCursor(result.nextCursor!)).toEqual({
            timestamp: page[1].lastActivityAt,
            id: "c2",
        });
    });

    it("keeps paging when a full page of threads has no messages yet", async () => {
        // Opening a conversation from a profile creates it with no messages,
        // so a whole page of them is ordinary. Paging on the nullable
        // lastMessageAt would end the list here and bury every active thread
        // underneath; lastActivityAt is always set, so the cursor survives.
        const empty = ["c1", "c2", "c3"].map((id, index) =>
            buildConversation(
                id,
                new Date(Date.parse("2026-09-03T12:00:00.000Z") - index * 1000),
                null,
            ),
        );
        vi.mocked(conversationRepo.listForUser).mockResolvedValue(empty);

        const result = await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.ACCEPTED,
            limit: 2,
        });

        expect(
            result.conversations.every((c) => c.lastMessageAt === null),
        ).toBe(true);
        expect(result.nextCursor).not.toBeNull();
        expect(decodeKeysetCursor(result.nextCursor!)?.id).toBe("c2");
    });

    it("puts the id in the cursor so a millisecond tie can be resumed", async () => {
        const sameInstant = new Date("2026-09-03T12:00:00.000Z");
        const tied = ["c1", "c2", "c3"].map((id) =>
            buildConversation(id, sameInstant),
        );
        vi.mocked(conversationRepo.listForUser).mockResolvedValue(tied);

        const result = await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.ACCEPTED,
            limit: 2,
        });

        expect(decodeKeysetCursor(result.nextCursor!)?.id).toBe("c2");
    });

    it("returns no cursor at the end of the list", async () => {
        vi.mocked(conversationRepo.listForUser).mockResolvedValue([
            buildConversation("c1", new Date()),
        ]);

        const result = await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.ACCEPTED,
            limit: 2,
        });

        expect(result.nextCursor).toBeNull();
    });

    it("passes the requested tab through to the repository", async () => {
        await useCase.execute({
            userId: VIEWER,
            status: ConversationStatus.PENDING,
            limit: 10,
        });

        expect(conversationRepo.listForUser).toHaveBeenCalledWith(
            expect.objectContaining({ status: ConversationStatus.PENDING }),
        );
    });
});
