import { type Static, Type } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "../create-response-schema";

export const OAuthExchangeBodySchema = Type.Object({
    code: Type.String({ minLength: 1 }),
});

export type OAuthExchangeBody = Static<typeof OAuthExchangeBodySchema>;

export const OAuthExchangeResponseSchema = ResponseSchema(
    Type.Object({
        accessToken: Type.String(),
        expiresAt: Type.Number(),
        user: Type.Object({
            id: Type.String({ format: "uuid" }),
            username: Type.String(),
            isEmailVerified: Type.Boolean(),
        }),
    }),
);

export type OAuthExchangeResponse = Static<typeof OAuthExchangeResponseSchema>;
