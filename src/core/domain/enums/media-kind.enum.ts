/**
 * The two families of file the platform accepts.
 *
 * Mirrors the `MediaKind` enum in the Prisma schema exactly, so domain values
 * can be cast onto Prisma values without a translation layer.
 */
export enum MediaKind {
    /**
     * A still raster image. Scanned inside the upload request.
     */
    IMAGE = "IMAGE",

    /**
     * A video file. Scanned by the background worker, because the provider has
     * to fetch and sample it.
     */
    VIDEO = "VIDEO",
}
