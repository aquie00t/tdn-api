import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartConversationUseCase } from "@core/use-cases/conversation/start-conversation/start-conversation.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import { InvalidRecipientError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { User } from "@core/domain/entities/user.entity";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import { buildBlockRepository } from "../../../helpers/mock-factories";

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
    let blockRepo: IBlockRepository;

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
        blockRepo = buildBlockRepository();

        useCase = new StartConversationUseCase(
            conversationRepo as IConversationRepository,
            userRepo as IUserRepository,
            followRepo as IFollowRepository,
            blockRepo,
        );
    });

    it("opens a pending request when the recipient does not follow the initiator", async () => {
        const { conversation, created } = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation.status).toBe(ConversationStatus.PENDING);
        expect(conversation.initiatorId).toBe(INITIATOR);
        expect(created).toBe(true);
    });

    it("opens an accepted conversation when the recipient already follows the initiator", async () => {
        vi.mocked(followRepo.checkIsFollowing).mockResolvedValue(true);

        const { conversation } = await useCase.execute({
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

        const { conversation, created } = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation).toBe(existing);
        // Reported so the endpoint answers 200 rather than claiming to have
        // created a thread that was already there.
        expect(created).toBe(false);
        expect(conversationRepo.create).not.toHaveBeenCalled();
    });

    it("does not reopen a declined conversation", async () => {
        const declined = Conversation.create(
            INITIATOR,
            RECIPIENT,
            ConversationStatus.DECLINED,
        );
        vi.mocked(conversationRepo.findBetween).mockResolvedValue(declined);

        const { conversation, created } = await useCase.execute({
            initiatorId: INITIATOR,
            recipientId: RECIPIENT,
        });

        expect(conversation.status).toBe(ConversationStatus.DECLINED);
        expect(created).toBe(false);
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

    describe("blocking", () => {
        beforeEach(() => {
            vi.mocked(blockRepo.existsBetween).mockResolvedValue(true);
        });

        it("should refuse to open a thread with a blocked account", async () => {
            await expect(
                useCase.execute({
                    initiatorId: INITIATOR,
                    recipientId: RECIPIENT,
                }),
            ).rejects.toThrow(InvalidRecipientError);

            expect(conversationRepo.create).not.toHaveBeenCalled();
        });

        it("should not hand back a thread the two already had", async () => {
            vi.mocked(conversationRepo.findBetween).mockResolvedValue(
                Conversation.create(
                    INITIATOR,
                    RECIPIENT,
                    ConversationStatus.ACCEPTED,
                ),
            );

            // The check runs ahead of the lookup: an existing conversation is
            // returned as it stands, so checking afterwards would give the
            // blocked account back the thread it is supposed to have lost.
            await expect(
                useCase.execute({
                    initiatorId: INITIATOR,
                    recipientId: RECIPIENT,
                }),
            ).rejects.toThrow(InvalidRecipientError);
        });

        it("should answer with the same error every other rejection uses", async () => {
            // Distinguishing a block from a bot, a deleted account or one that
            // never existed would turn this endpoint into a way to probe the
            // user table.
            await expect(
                useCase.execute({
                    initiatorId: INITIATOR,
                    recipientId: RECIPIENT,
                }),
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });
});
