import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ClientMetaQuery } from "@typings/schemas/meta/client.schema";

/**
 * Controller for the endpoints a client reads about itself.
 */
export class MetaController {
    /**
     * Creates a new MetaController instance.
     *
     * @param config - Environment configuration holding the build floor
     */
    constructor(private readonly config: FastifyInstance["config"]) {}

    /**
     * Reports whether the calling build is still supported.
     *
     * Exists because an app version cannot be replaced the way a web bundle
     * can: it sits on phones until each owner updates it, and some never do.
     * Without a floor the API can be given, the only safe change to a
     * published endpoint is no change at all.
     *
     * No database, no authentication: this is the one call an app makes before
     * it knows whether it can make any others.
     *
     * @param request - The request, optionally carrying the caller's build
     * @param reply - The reply to send
     */
    client(
        request: FastifyRequest<{ Querystring: ClientMetaQuery }>,
        reply: FastifyReply,
    ): void {
        const minSupportedBuild = this.config.MOBILE_MIN_SUPPORTED_BUILD;
        const build = request.query.build;

        // A floor of zero is "no floor", which is the state until the first
        // release; a caller that did not say which build it is cannot be told
        // it is too old.
        const updateRequired =
            minSupportedBuild > 0 &&
            build !== undefined &&
            build < minSupportedBuild;

        reply.status(200).send({
            data: {
                minSupportedBuild,
                latestBuild: this.config.MOBILE_LATEST_BUILD,
                updateRequired,
                storeUrl: this.config.MOBILE_STORE_URL_ANDROID,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
