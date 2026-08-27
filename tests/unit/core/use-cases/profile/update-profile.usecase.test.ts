import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateProfileUseCase } from "@core/use-cases/profile/update-profil";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { ForbiddenError } from "@core/errors";
import { buildUser } from "../../../helpers/mock-factories";

describe("UpdateProfileUseCase", () => {
    let useCase: UpdateProfileUseCase;
    let profileRepository: Pick<IProfileRepository, "update">;
    let userRepository: Pick<IUserRepository, "findById">;

    beforeEach(() => {
        profileRepository = {
            update: vi.fn().mockResolvedValue(undefined),
        };
        userRepository = {
            findById: vi.fn().mockResolvedValue(buildUser({ isBot: true })),
        };
        useCase = new UpdateProfileUseCase(
            profileRepository as IProfileRepository,
            userRepository as IUserRepository,
        );
    });

    it("should call repository.update with the userId and input", async () => {
        const input = {
            userId: "user-1",
            fullName: "John Doe",
            bio: "A developer",
            location: "Istanbul",
            socials: { twitter: "https://twitter.com/johndoe" },
        };

        await useCase.execute(input);

        expect(profileRepository.update).toHaveBeenCalledOnce();
        expect(profileRepository.update).toHaveBeenCalledWith("user-1", input);
    });

    it("should resolve without returning a value", async () => {
        const result = await useCase.execute({ userId: "user-1" });

        expect(result).toBeUndefined();
    });

    it("should work with only userId provided (all optional fields omitted)", async () => {
        await useCase.execute({ userId: "user-1" });

        expect(profileRepository.update).toHaveBeenCalledWith("user-1", {
            userId: "user-1",
        });
    });

    it("should support null values for clearable fields", async () => {
        await useCase.execute({
            userId: "user-1",
            bio: null,
            location: null,
            socials: null,
        });

        expect(profileRepository.update).toHaveBeenCalledWith("user-1", {
            userId: "user-1",
            bio: null,
            location: null,
            socials: null,
        });
    });

    it("should not load the user when categories are omitted", async () => {
        await useCase.execute({ userId: "user-1", bio: "hello" });

        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("should let a bot account set categories", async () => {
        const input = {
            userId: "user-1",
            categories: [PostCategory.BACKEND, PostCategory.FRONTEND],
        };

        await useCase.execute(input);

        expect(userRepository.findById).toHaveBeenCalledWith("user-1");
        expect(profileRepository.update).toHaveBeenCalledWith("user-1", input);
    });

    it("should reject a non-bot account setting categories", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(
            buildUser({ isBot: false }),
        );

        await expect(
            useCase.execute({
                userId: "user-1",
                categories: [PostCategory.BACKEND],
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(profileRepository.update).not.toHaveBeenCalled();
    });

    it("should reject when the user cannot be found", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ userId: "user-1", categories: [] }),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(profileRepository.update).not.toHaveBeenCalled();
    });

    it("should let a bot clear its categories with an empty array", async () => {
        await useCase.execute({ userId: "user-1", categories: [] });

        expect(profileRepository.update).toHaveBeenCalledWith("user-1", {
            userId: "user-1",
            categories: [],
        });
    });

    it("should propagate errors thrown by the repository", async () => {
        vi.mocked(profileRepository.update).mockRejectedValue(
            new Error("DB error"),
        );

        await expect(useCase.execute({ userId: "user-1" })).rejects.toThrow(
            "DB error",
        );
    });
});
