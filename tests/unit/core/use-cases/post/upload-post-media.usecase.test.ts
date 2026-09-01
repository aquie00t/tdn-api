import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPostMediaUseCase } from "@core/use-cases/post/upload-post-media";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import {
    MediaChannel,
    MediaKind,
    MediaModerationStatus,
} from "@core/domain/enums";

const USER = "user-1";

describe("UploadPostMediaUseCase", () => {
    let useCase: UploadPostMediaUseCase;
    let uploadModeratedMediaUseCase: Pick<
        UploadModeratedMediaUseCase,
        "execute"
    >;

    beforeEach(() => {
        uploadModeratedMediaUseCase = {
            execute: vi.fn().mockResolvedValue({
                storageKey: "posts/user-1/generated.jpg",
                kind: MediaKind.IMAGE,
                status: MediaModerationStatus.APPROVED,
            }),
        };

        useCase = new UploadPostMediaUseCase(
            uploadModeratedMediaUseCase as UploadModeratedMediaUseCase,
        );
    });

    it("should return the storage key the shared upload path produced", async () => {
        const result = await useCase.execute({
            userId: USER,
            fileBuffer: Buffer.from("img"),
        });

        expect(result).toBe("posts/user-1/generated.jpg");
    });

    it("should upload through the post media channel, under the uploader's prefix", async () => {
        const fileBuffer = Buffer.from("img");

        await useCase.execute({ userId: USER, fileBuffer });

        expect(uploadModeratedMediaUseCase.execute).toHaveBeenCalledWith({
            userId: USER,
            fileBuffer,
            channel: MediaChannel.POST_MEDIA,
            keyPrefix: "posts/user-1",
            truncated: undefined,
            maxBytes: 5 * 1024 * 1024,
            allowVideo: true,
        });
    });

    it("should allow video, as the only endpoint that does", async () => {
        await useCase.execute({ userId: USER, fileBuffer: Buffer.from("vid") });

        expect(uploadModeratedMediaUseCase.execute).toHaveBeenCalledWith(
            expect.objectContaining({ allowVideo: true }),
        );
    });

    it("should pass the truncation flag on so a cut-off file is refused", async () => {
        await useCase.execute({
            userId: USER,
            fileBuffer: Buffer.from("img"),
            truncated: true,
        });

        expect(uploadModeratedMediaUseCase.execute).toHaveBeenCalledWith(
            expect.objectContaining({ truncated: true }),
        );
    });
});
