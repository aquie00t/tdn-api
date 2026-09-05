import { beforeEach, describe, expect, it, vi } from "vitest";
import { RespondToRequestUseCase } from "@core/use-cases/conversation/respond-to-request/respond-to-request.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import {
    ConversationNotFoundError,
    MessageNotSendableError,
} from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import { buildBlockRepository } from "../../../helpers/mock-factories";

const INITIATOR = "aaaa-1111";
const RECIPIENT = "bbbb-2222";

const buildConversation = (status: ConversationStatus): Conversation =>
    Conversation.with({
        id: "conv-1",
        userAId: INITIATOR,
        userBId: RECIPIENT,
        initiatorId: INITIATOR,
        status,
        userAUnread: 0,
        userBUnread: 0,
    });

describe("RespondToRequestUseCase", () => {
    let useCase: RespondToRequestUseCase;
    let conversationRepo: Pick<
        IConversationRepository,
        "findById" | "updateStatus"
    >;

    beforeEach(() => {
        conversationRepo = {
            findById: vi
                .fn()
                .mockResolvedValue(
                    buildConversation(ConversationStatus.PENDING),
                ),
            updateStatus: vi.fn(),
        };

        useCase = new RespondToRequestUseCase(
            conversationRepo as IConversationRepository,
            buildBlockRepository(),
        );
    });

    it("accepts a request addressed to the responder", async () => {
        vi.mocked(conversationRepo.findById)
            .mockResolvedValueOnce(
                buildConversation(ConversationStatus.PENDING),
            )
            .mockResolvedValueOnce(
                buildConversation(ConversationStatus.ACCEPTED),
            );

        const conversation = await useCase.execute({
            conversationId: "conv-1",
            userId: RECIPIENT,
            accept: true,
        });

        expect(conversationRepo.updateStatus).toHaveBeenCalledWith(
            "conv-1",
            ConversationStatus.ACCEPTED,
        );
        expect(conversation.status).toBe(ConversationStatus.ACCEPTED);
    });

    it("declines a request addressed to the responder", async () => {
        vi.mocked(conversationRepo.findById)
            .mockResolvedValueOnce(
                buildConversation(ConversationStatus.PENDING),
            )
            .mockResolvedValueOnce(
                buildConversation(ConversationStatus.DECLINED),
            );

        await useCase.execute({
            conversationId: "conv-1",
            userId: RECIPIENT,
            accept: false,
        });

        expect(conversationRepo.updateStatus).toHaveBeenCalledWith(
            "conv-1",
            ConversationStatus.DECLINED,
        );
    });

    it("refuses to let the initiator accept their own request", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: INITIATOR,
                accept: true,
            }),
        ).rejects.toThrow(MessageNotSendableError);

        expect(conversationRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("refuses to answer a conversation that is already accepted", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(
            buildConversation(ConversationStatus.ACCEPTED),
        );

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: RECIPIENT,
                accept: false,
            }),
        ).rejects.toThrow(MessageNotSendableError);
    });

    it("hides a conversation the responder is not part of", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: "cccc-3333",
                accept: true,
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });

    it("hides a conversation that does not exist", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: RECIPIENT,
                accept: true,
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });
});
