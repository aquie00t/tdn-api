import fastifyPlugin from "fastify-plugin";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

const BYTES_PER_MB = 1024 * 1024;

/**
 * Registers multipart parsing with the upload limits.
 *
 * Both raised limits are about phone cameras. `fileSize` was 5 MB, which a
 * current Android photo passes without trying and a few seconds of video
 * passes easily; it is now configurable and defaults to 10 rather than
 * something larger because the instance runs on half a CPU and 512 MB and this
 * parser buffers what it reads - the app compresses before uploading, so the
 * ceiling is there for the occasional large file, not for every one.
 *
 * `fieldSize` was 100 *bytes*, which is fine for a web form that posts a file
 * on its own and rejects any request that sends a text field beside one.
 *
 * @param fastify - The Fastify application instance
 */
function multipartPlugin(fastify: FastifyInstance): void {
    fastify.register(multipart, {
        limits: {
            fieldNameSize: 100,
            fieldSize: 1024,
            fields: 10,
            fileSize: fastify.config.MEDIA_MAX_FILE_SIZE_MB * BYTES_PER_MB,
            files: 4,
        },
    });
}

export default fastifyPlugin(multipartPlugin, {
    name: "multipart-plugin",
    dependencies: ["env-plugin"],
});
