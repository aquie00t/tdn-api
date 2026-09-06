import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RevokeSubscriptionUseCase } from "@core/use-cases/billing/revoke-subscription";
import { SoftDeleteUserUseCase } from "@core/use-cases/user/soft-delete";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { PasswordPort } from "@core/ports/services/password.port";
import type { EmailPort } from "@core/ports/services/email.port";
import { BadRequestError, NotFoundError } from "@core/errors";
import { buildUser } from "../../../helpers/mock-factories";

describe("SoftDeleteUserUseCase", () => {
    let useCase: SoftDeleteUserUseCase;
    let userRepository: Pick<IUserRepository, "findById" | "softDeleteById">;
    let passwordService: Pick<PasswordPort, "verify">;
    let emailService: Pick<EmailPort, "sendDeleteUserEmail">;
    let revokeSubscriptionUseCase: Pick<RevokeSubscriptionUseCase, "execute">;

    beforeEach(() => {
        userRepository = {
            findById: vi.fn(),
            softDeleteById: vi.fn().mockResolvedValue(undefined),
        };
        passwordService = {
            verify: vi.fn(),
        };
        emailService = {
            sendDeleteUserEmail: vi.fn().mockResolvedValue(undefined),
        };
        revokeSubscriptionUseCase = { execute: vi.fn().mockResolvedValue(true) };

        useCase = new SoftDeleteUserUseCase(
            userRepository as IUserRepository,
            passwordService as PasswordPort,
            emailService as EmailPort,
            revokeSubscriptionUseCase as RevokeSubscriptionUseCase,
        );
    });

    it("should throw NotFoundError when user is not found", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ id: "user-1", password: "pass" }),
        ).rejects.toThrow(NotFoundError);

        expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when user has no password (OAuth account)", async () => {
        const oauthUser = buildUser({ passwordHash: null });
        vi.mocked(userRepository.findById).mockResolvedValue(oauthUser);

        await expect(
            useCase.execute({ id: "user-1", password: "pass" }),
        ).rejects.toThrow(NotFoundError);

        expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when user is already soft-deleted", async () => {
        const deletedUser = buildUser({ deletedAt: new Date() });
        vi.mocked(userRepository.findById).mockResolvedValue(deletedUser);

        await expect(
            useCase.execute({ id: "user-1", password: "pass" }),
        ).rejects.toThrow(NotFoundError);

        expect(passwordService.verify).not.toHaveBeenCalled();
        expect(userRepository.softDeleteById).not.toHaveBeenCalled();
    });

    it("should throw BadRequestError when the provided password is invalid", async () => {
        const user = buildUser({ passwordHash: "stored_hash" });
        vi.mocked(userRepository.findById).mockResolvedValue(user);
        vi.mocked(passwordService.verify).mockResolvedValue(false);

        await expect(
            useCase.execute({ id: "user-1", password: "wrong_pass" }),
        ).rejects.toThrow(BadRequestError);

        expect(userRepository.softDeleteById).not.toHaveBeenCalled();
        expect(emailService.sendDeleteUserEmail).not.toHaveBeenCalled();
    });

    it("should call softDeleteById and send confirmation email on happy path", async () => {
        const user = buildUser({
            email: "user@example.com",
            passwordHash: "stored_hash",
        });
        vi.mocked(userRepository.findById).mockResolvedValue(user);
        vi.mocked(passwordService.verify).mockResolvedValue(true);

        await useCase.execute({ id: "user-1", password: "correct_pass" });

        expect(userRepository.softDeleteById).toHaveBeenCalledOnce();
        expect(userRepository.softDeleteById).toHaveBeenCalledWith("user-1");
        expect(emailService.sendDeleteUserEmail).toHaveBeenCalledOnce();
        expect(emailService.sendDeleteUserEmail).toHaveBeenCalledWith({
            to: "user@example.com",
        });
    });

    it("should verify password against the stored hash", async () => {
        const user = buildUser({ passwordHash: "stored_hash" });
        vi.mocked(userRepository.findById).mockResolvedValue(user);
        vi.mocked(passwordService.verify).mockResolvedValue(true);

        await useCase.execute({ id: "user-1", password: "correct_pass" });

        expect(passwordService.verify).toHaveBeenCalledWith(
            "correct_pass",
            "stored_hash",
        );
    });

    it("should send email to the user's registered address", async () => {
        const user = buildUser({
            email: "target@example.com",
            passwordHash: "hash",
        });
        vi.mocked(userRepository.findById).mockResolvedValue(user);
        vi.mocked(passwordService.verify).mockResolvedValue(true);

        await useCase.execute({ id: "user-1", password: "pass" });

        expect(emailService.sendDeleteUserEmail).toHaveBeenCalledWith({
            to: "target@example.com",
        });
    });

    it("should stop the account being charged", async () => {
        // The platform promises a deleted account is not billed again, and the
        // provider is the only thing that can keep that promise.
        vi.mocked(userRepository.findById).mockResolvedValue(
            buildUser({ password: "hashed" }),
        );
        vi.mocked(passwordService.verify).mockResolvedValue(true);

        await useCase.execute({ id: "user-1", password: "correct" });

        expect(revokeSubscriptionUseCase.execute).toHaveBeenCalledWith(
            "user-1",
        );
    });
});
