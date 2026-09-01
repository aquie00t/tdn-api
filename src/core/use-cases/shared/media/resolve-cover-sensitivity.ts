import { MediaModerationStatus } from "@core/domain/enums";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";

/**
 * Reads the moderation verdict recorded for an article cover.
 *
 * Deliberately softer than the check post and comment media go through, and
 * for a reason those two do not share. A cover is submitted as a storage key
 * under `articles/covers/<authorId>/`, already validated against the author's
 * own prefix, so it can only ever name a file that author uploaded - there is
 * no equivalent of "put any URL you like in the body" to close off here. A key
 * with no asset row is a key that points at nothing in the bucket: it renders
 * as a broken image, not as unmoderated content. Articles written before this
 * pipeline existed are exactly that case, and refusing to load them would be
 * the only thing that check bought.
 *
 * A forbidden cover cannot reach this point at all: covers are images, images
 * are scanned inside the upload request, and a rejected one is never stored.
 * The only verdict left to carry across is the middle one.
 *
 * @param coverImageKey - The cover's storage key, if the article has one
 * @param mediaAssetRepository - Repository holding the recorded verdicts
 * @returns True when the cover was judged borderline
 */
export async function resolveCoverSensitivity(
    coverImageKey: string | null | undefined,
    mediaAssetRepository: IMediaAssetRepository,
): Promise<boolean> {
    if (!coverImageKey) return false;

    const [asset] = await mediaAssetRepository.findByStorageKeys([
        coverImageKey,
    ]);

    return asset?.status === MediaModerationStatus.SENSITIVE;
}
