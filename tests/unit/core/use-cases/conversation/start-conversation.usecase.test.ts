import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartConversationUseCase } from "@core/use-cases/conversation/start-conversation/start-conversation.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import { InvalidRecipientError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { User } from "@core/domain/entities/user.entity";

const INITIATOR = "aaaa-1111";
const RECIPIENT = "bbbb-2222";

const buildUser = (overrides: Partial<User> = {}): User =>
    ({
        id: RECIPIENT,
        isBot: false,
        deletedAt: null,
        ...overrides,
    }) as unknown as User;

describe("StartConversationUseCase", () => {
    let useCase: StartConversationUseCase;
    let conversationRepo: Pick<
        IConversationRepository,
        "findBetween" | "create"
    >;
    let userRepo: Pick<IUserRepository, "findById">;
    let followRepo: Pick<IFollowRepository, "checkIsFollowing">;

    beforeEach(() => {
        conversationRepo = {
            findBetween: vi.fn().mockResolvedValue(null),
            create: vi
                .fn()
                .mockImplementation((conversation: Conversation) =>
                    Promise.resolve(conversation),
                ),
        };
        userRepo = { findById: vi.fn().mockResolvedValue(buildUser()) };
        followRepo = { checkIsFollowing: vi.fn().mockResolvedValue(false) };

        useCase = new StartConversationUseCase(
            conversationRepo as IConversationRepository,
            userRepo as IUserRepository,
            followRepo as IFollowRepository,
        );
    });

    it("opens a pending request when the recipient does not follow the initiator", async () => {
        const conversation = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation.status).toBe(ConversationStatus.PENDING);
        expect(conversation.initiatorId).toBe(INITIATOR);
    });

    it("opens an accepted conversation when the recipient already follows the initiator", async () => {
        vi.mocked(followRepo.checkIsFollowing).mockResolvedValue(true);

        const conversation = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation.status).toBe(ConversationStatus.ACCEPTED);
        // The follow that matters is the recipient following the initiator,
        // not the other way round: it is the recipient who is consenting to be
        // written to.
        expect(followRepo.checkIsFollowing).toHaveBeenCalledWith(
            RECIPIENT,
            INITIATOR,
        );
    });

    it("returns the existing conversation instead of opening a second one", async () => {
        const existing = Conversation.create(
            INITIATOR,
            RECIPIENT,
            ConversationStatus.ACCEPTED,
        );
        vi.mocked(conversationRepo.findBetween).mockResolvedValue(existing);

        const conversation = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation).toBe(existing);
        expect(conversationRepo.create).not.toHaveBeenCalled();
    });

    it("does not reopen a declined conversation", async () => {
        const declined = Conversation.create(
            INITIATOR,
            RECIPIENT,
            ConversationStatus.DECLINED,
        );
        vi.mocked(conversationRepo.findBetween).mockResolvedValue(declined);

        const conversation = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation.status).toBe(ConversationStatus.DECLINED);
        expect(conversationRepo.create).not.toHaveBeenCalled();
    });

    it("refuses a conversation with yourself", async () => {
        await expect(
            useCase.execute({
                initiatorId: INITIATOR,
                recipientId: INITIATOR,
            }),
        ).rejects.toThrow(InvalidRecipientError);
    });

    it("refuses a conversation with a bot", async () => {
        vi.mocked(userRepo.findById).mockResolvedValue(
            buildUser({ isBot: true } as Partial<User>),
        );

        await expect(
            useCase.execute({
                initiatorId: INITIATOR,
                recipientId: RECIPIENT,
            }),
        ).rejects.toThrow(InvalidRecipientError);
    });

    it("refuses a conversation with an account being deleted", async () => {
        vi.mocked(userRepo.findById).mockResolvedValue(
            buildUser({ deletedAt: new Date() } as Partial<User>),
        );

        await expect(
            useCase.execute({
                initiatorId: INITIATOR,
                recipientId: RECIPIENT,
            }),
        ).rejects.toThrow(InvalidRecipientError);
    });

    it("refuses a conversation with a user that does not exist", async () => {
        vi.mocked(userRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                initiatorId: INITIATOR,
                recipientId: RECIPIENT,
            }),
        ).rejects.toThrow(InvalidRecipientError);
    });
});
