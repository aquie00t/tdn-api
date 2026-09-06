/**
 * @module ProfileRoutes
 * Profile routes including update, search, get followers and following.
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    FollowersParamsSchema,
    PaginationQuerySchema,
    FollowsListResponseSchema,
    type FollowsListResponse,
} from "@typings/schemas/profile/followers.schema";
import {
    type GetProfileParams,
    GetProfileParamsSchema,
    GetProfileResponseSchema,
    type GetProfileResponse,
} from "@typings/schemas/profile/get-profile.schema";
import {
    type SearchProfilesQuery,
    SearchProfilesQuerySchema,
    SearchProfilesResponseSchema,
    type SearchProfilesResponse,
} from "@typings/schemas/profile/search-profile.schema";
import {
    type UpdateProfileBody,
    UpdateProfileBodySchema,
} from "@typings/schemas/profile/update-profile.schema";
import {
    type BotProfilesQuery,
    BotProfilesQuerySchema,
    BotProfilesResponseSchema,
    type BotProfilesResponse,
} from "@typings/schemas/profile/bot-profiles.schema";
import {
    type SuggestedUsersQuery,
    SuggestedUsersQuerySchema,
    SuggestedUsersResponseSchema,
    type SuggestedUsersResponse,
} from "@typings/schemas/profile/suggested-users.schema";
import { Type } from "@sinclair/typebox";
import { ResponseSchema } from "@typings/schemas/create-response-schema";
import type { FastifyInstance } from "fastify";

const UploadAvatarResponseSchema = ResponseSchema(
    Type.Object({ avatarUrl: Type.String() }),
);
const UploadBannerResponseSchema = ResponseSchema(
    Type.Object({ bannerUrl: Type.String() }),
);

/**
 * Sets up profile routes on the Fastify instance
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
function profileRoutes(fastify: FastifyInstance): void {
    const profileController = fastify.diContainer.cradle.profileController;

    fastify.patch(
        "/me/avatar",
        {
            onRequest: [fastify.authenticate],
            config: {
                rateLimit: RateLimitPolicies.STRICT,
            },
            schema: {
                response: { 200: UploadAvatarResponseSchema },
                tags: ["Profile"],
            },
        },
        profileController.uploadAvatarMe.bind(profileController),
    );

    fastify.patch(
        "/me/banner",
        {
            onRequest: [fastify.authenticate],
            config: {
                rateLimit: RateLimitPolicies.STRICT,
            },
            schema: {
                response: { 200: UploadBannerResponseSchema },
                tags: ["Profile"],
            },
        },
        profileController.uploadBannerMe.bind(profileController),
    );

    fastify.patch<{ Body: UpdateProfileBody }>(
        "/me",
        {
            schema: {
                body: UpdateProfileBodySchema,
                tags: ["Profile"],
            },
            onRequest: [fastify.authenticate],
        },
        profileController.updateProfileMe.bind(profileController),
    );

    fastify.get<{
        Querystring: SearchProfilesQuery;
        Reply: { 200: SearchProfilesResponse };
    }>(
        "/search",
        {
            schema: {
                querystring: SearchProfilesQuerySchema,
                response: { 200: SearchProfilesResponseSchema },
                tags: ["Profile"],
            },
            // `optionalAuthenticate` rather than a bare `jwtVerify`: the
            // decorator also re-reads the account row, so a suspended or
            // deleted account stops being treated as signed in here the way
            // it does everywhere else.
            onRequest: [fastify.optionalAuthenticate],
        },
        profileController.searchProfiles.bind(profileController),
    );

    fastify.get<{
        Params: GetProfileParams;
        Reply: { 200: GetProfileResponse };
    }>(
        "/:username",
        {
            schema: {
                params: GetProfileParamsSchema,
                response: { 200: GetProfileResponseSchema },
                tags: ["Profile"],
            },
            // See the note on /search: the decorator re-reads the account row,
            // so a suspended account stops being treated as signed in here.
            onRequest: [fastify.optionalAuthenticate],
        },
        profileController.getProfile.bind(profileController),
    );

    fastify.get<{ Reply: { 200: FollowsListResponse } }>(
        "/:username/followers",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: FollowersParamsSchema,
                querystring: PaginationQuerySchema,
                response: { 200: FollowsListResponseSchema },
                tags: ["Profile"],
            },
        },
        profileController.getFollowers.bind(profileController),
    );

    fastify.get<{ Reply: { 200: FollowsListResponse } }>(
        "/:username/following",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: FollowersParamsSchema,
                querystring: PaginationQuerySchema,
                response: { 200: FollowsListResponseSchema },
                tags: ["Profile"],
            },
        },
        profileController.getFollowing.bind(profileController),
    );

    fastify.get<{
        Querystring: SuggestedUsersQuery;
        Reply: { 200: SuggestedUsersResponse };
    }>(
        "/suggestions",
        {
            config: {
                rateLimit: RateLimitPolicies.PUBLIC,
            },
            schema: {
                querystring: SuggestedUsersQuerySchema,
                response: { 200: SuggestedUsersResponseSchema },
                tags: ["Profile"],
            },
            // `optionalAuthenticate` rather than a bare `jwtVerify`: the
            // decorator also re-reads the account row, so a suspended or
            // deleted account stops being treated as signed in here the way
            // it does everywhere else.
            onRequest: [fastify.optionalAuthenticate],
        },
        profileController.getSuggestions.bind(profileController),
    );

    fastify.get<{
        Querystring: BotProfilesQuery;
        Reply: { 200: BotProfilesResponse };
    }>(
        "/bots",
        {
            config: {
                rateLimit: RateLimitPolicies.PUBLIC,
            },
            schema: {
                querystring: BotProfilesQuerySchema,
                response: { 200: BotProfilesResponseSchema },
                tags: ["Profile"],
            },
            onRequest: [fastify.optionalAuthenticate],
        },
        profileController.getBotProfiles.bind(profileController),
    );
}

export default profileRoutes;
