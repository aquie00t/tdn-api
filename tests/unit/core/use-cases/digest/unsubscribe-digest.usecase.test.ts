import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { UnsubscribeDigestUseCase } from "@core/use-cases/digest/unsubscribe-digest";
import { signUnsubscribeToken } from "@core/use-cases/shared/digest/unsubscribe-token";
import { buildUser } from "../../../helpers/mock-factories";

const SECRET = "a-signing-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("UnsubscribeDigestUseCase", () => {
    let useCase: UnsubscribeDigestUseCase;
    let userRepository: Pick<IUserRepository, "findById" | "setDigestOptOut">;

    const token = signUnsubscribeToken(USER_ID, SECRET);

    beforeEach(() => {
        userRepository = {
            findById: vi.fn().mockResolvedValue(buildUser({ id: USER_ID })),
            setDigestOptOut: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new UnsubscribeDigestUseCase(
            userRepository as IUserRepository,
            SECRET,
        );
    });

    it("should record the opt-out for a valid link", async () => {
        const subscribed = await useCase.execute({
            userId: USER_ID,
            token,
            action: "unsubscribe",
        });

        expect(subscribed).toBe(false);
        const [id, optedOutAt] = vi.mocked(userRepository.setDigestOptOut).mock
            .calls[0];
        expect(id).toBe(USER_ID);
        expect(optedOutAt).toBeInstanceOf(Date);
    });

    it("should clear the opt-out when the reader undoes it", async () => {
        const subscribed = await useCase.execute({
            userId: USER_ID,
            token,
            action: "resubscribe",
        });

        expect(subscribed).toBe(true);
        expect(userRepository.setDigestOptOut).toHaveBeenCalledWith(
            USER_ID,
            null,
        );
    });

    it("should refuse a token that is not this user's", async () => {
        await expect(
            useCase.execute({
                userId: USER_ID,
                token: signUnsubscribeToken("someone-else", SECRET),
                action: "unsubscribe",
            }),
        ).rejects.toThrow(UnauthorizedError);

        expect(userRepository.setDigestOptOut).not.toHaveBeenCalled();
    });

    it("should refuse a garbage token without reaching the database", async () => {
        await expect(
            useCase.execute({
                userId: USER_ID,
                token: "nonsense",
                action: "unsubscribe",
            }),
        ).rejects.toThrow(UnauthorizedError);

        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("should answer an unknown account exactly as it answers a bad signature", async () => {
        // Telling them apart would make this endpoint a check for whether a
        // given id has an account here.
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ userId: USER_ID, token, action: "unsubscribe" }),
        ).rejects.toThrow(UnauthorizedError);

        expect(userRepository.setDigestOptOut).not.toHaveBeenCalled();
    });
});
