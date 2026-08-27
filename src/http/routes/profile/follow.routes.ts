/**
 * Follow routes module
 *
 * This module defines API endpoints for user follow/unfollow functionality.
 * Provides endpoints to follow and unfollow other users in the system.
 *
 * Both sit on STANDARD rather than SENSITIVE. Following is cheap, idempotent
 * and reversible, and users perform it in bursts by design: onboarding asks a
 * new account for MIN_FOLLOWS accounts in a row before it may enter the app,
 * and browsing a follower list invites the same behaviour. SENSITIVE's 5/min
 * was the same number as that requirement, leaving no room for a change of
 * mind - an unfollow costs a request too - or a single retry, and the wall
 * landed inside a flow the user cannot leave. Whatever this policy becomes,
 * it has to stay comfortably above MIN_FOLLOWS in tdn-client.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    type FollowUserBody,
    FollowUserBodySchema,
    FollowActionResponseSchema,
} from "@typings/schemas/follow-user/follow-user.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up follow/unfollow routes on the Fastify instance
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function followRoutes(fastify: FastifyInstance): void {
    const followController = fastify.diContainer.cradle.followUserController;

    fastify.post<{ Body: FollowUserBody }>(
        "/follows",
        {
            schema: {
                body: FollowUserBodySchema,
                response: { 200: FollowActionResponseSchema },
                tags: ["Follow"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        followController.follow.bind(followController),
    );

    fastify.delete<{ Body: FollowUserBody }>(
        "/follows",
        {
            schema: {
                body: FollowUserBodySchema,
                response: { 200: FollowActionResponseSchema },
                tags: ["Follow"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        followController.unfollow.bind(followController),
    );
}
