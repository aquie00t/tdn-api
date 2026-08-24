import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "../create-response-schema";

/**
 * The upload returns both forms: the key, which is what the article body
 * accepts, and the URL, which is what a client renders.
 */
export const UploadCoverResponseSchema = ResponseSchema(
    FBType.Object({
        coverImageKey: FBType.String(),
        coverImageUrl: FBType.String(),
    }),
);

export type UploadCoverResponse = Static<typeof UploadCoverResponseSchema>;
