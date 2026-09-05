import { type Static, Type } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "../create-response-schema";

/**
 * What the app tells us about itself.
 *
 * Its own build number, so the answer can say whether *this* build is still
 * supported rather than making the client compare numbers and get the
 * comparison wrong.
 */
export const ClientMetaQuerySchema = Type.Object({
    build: Type.Optional(Type.Number({ minimum: 0 })),
});

export type ClientMetaQuery = Static<typeof ClientMetaQuerySchema>;

export const ClientMetaResponseSchema = ResponseSchema(
    Type.Object({
        /** Oldest build the API will talk to. Zero means no floor is set. */
        minSupportedBuild: Type.Number(),

        /** Newest build published, for an optional "update available" nudge. */
        latestBuild: Type.Number(),

        /**
         * Whether the build that asked must update before it can be used.
         * Always false when no build was supplied, or no floor is set.
         */
        updateRequired: Type.Boolean(),

        /** Where to send the user to update. Empty when not configured. */
        storeUrl: Type.String(),
    }),
);

export type ClientMetaResponse = Static<typeof ClientMetaResponseSchema>;
