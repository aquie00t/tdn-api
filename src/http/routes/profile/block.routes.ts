/**
 * Block routes module
 *
 * Endpoints for blocking and unblocking accounts, and for reading the list a
 * block can be lifted from.
 *
 * The writes sit on SENSITIVE rather than the STANDARD its sibling
 * `follow.routes.ts` uses. That file's comment explains why following had to
 * be loosened - onboarding asks a new account for MIN_FOLLOWS follows in a row
 * before it may enter the app, so a 5/min wall landed inside a flow the user
 * could not leave. Nothing here is performed in bursts: blocking is a
 * deliberate, one-at-a-time act, and 5/min is comfortably above what a person
 * doing it on purpose needs.
 *
 * The list is a plain authenticated read, so it takes STANDARD.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    type BlockedListQuery,
    BlockedListQuerySchema,
    BlockedUsersResponseSchema,
    type BlockUserBody,
    BlockActionResponseSchema,
    BlockUserBodySchema,
} from "@typings/schemas/block/block.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up the block routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function blockRoutes(fastify: FastifyInstance): void {
    const blockController = fastify.diContainer.cradle.blockController;

    fastify.post<{ Body: BlockUserBody }>(
        "/blocks",
        {
            schema: {
                body: BlockUserBodySchema,
                response: { 200: BlockActionResponseSchema },
                tags: ["Block"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        blockController.block.bind(blockController),
    );

    fastify.delete<{ Body: BlockUserBody }>(
        "/blocks",
        {
            schema: {
                body: BlockUserBodySchema,
                response: { 200: BlockActionResponseSchema },
                tags: ["Block"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        blockController.unblock.bind(blockController),
    );

    fastify.get<{ Querystring: BlockedListQuery }>(
        "/blocks",
        {
            schema: {
                querystring: BlockedListQuerySchema,
                response: { 200: BlockedUsersResponseSchema },
                tags: ["Block"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        blockController.list.bind(blockController),
    );
}
