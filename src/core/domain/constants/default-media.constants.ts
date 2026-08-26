/**
 * Storage key of the shared default avatar object.
 * Mirrors the `avatarUrl` default in `prisma/models/profile.prisma`.
 */
export const DEFAULT_AVATAR_KEY = "avatars/default_profile.png";

/**
 * Storage key of the shared default banner object.
 * Mirrors the `bannerUrl` default in `prisma/models/profile.prisma`.
 */
export const DEFAULT_BANNER_KEY = "banners/default_banner.jpe";

/**
 * File name stems of the shared default assets, without directory or extension.
 *
 * Matching on the stem keeps the guard correct even when the stored value is a
 * full CDN URL, carries a cache-busting query string, or uses a different
 * extension than the one written by the Prisma schema default.
 */
const DEFAULT_MEDIA_STEMS = ["default_profile", "default_banner"] as const;

/**
 * Checks whether a stored media path points at a shared default asset.
 *
 * Default assets are shared by every user, so they must never be deleted from
 * storage when a single user replaces their avatar or banner.
 *
 * @param mediaPath - The stored avatar/banner path or URL.
 * @returns True when the path refers to a shared default asset.
 */
export function isDefaultMediaKey(mediaPath: string): boolean {
    return DEFAULT_MEDIA_STEMS.some((stem) => mediaPath.includes(stem));
}
