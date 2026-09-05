/**
 * Meta routes module
 *
 * What a client needs to know about itself before it can trust anything else:
 * whether this build is still supported. Public and unauthenticated, because
 * an app that is too old to be talked to is also too old to sign in.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    type ClientMetaQuery,
    ClientMetaQuerySchema,
    ClientMetaResponseSchema,
} from "@typings/schemas/meta/client.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up the meta routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function metaRoutes(fastify: FastifyInstance): void {
    const metaController = fastify.diContainer.cradle.metaController;

    fastify.get<{ Querystring: ClientMetaQuery }>(
        "/meta/client",
        {
            schema: {
                querystring: ClientMetaQuerySchema,
                response: { 200: ClientMetaResponseSchema },
                tags: ["Meta"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        metaController.client.bind(metaController),
    );
}
