import { type Static, Type } from "@fastify/type-provider-typebox";
import { NativeSessionFields } from "./client.schema";
import { ResponseSchema } from "../create-response-schema";

export const RefreshResponseSchema = ResponseSchema(
    Type.Object({
        accessToken: Type.String(),
        expiresAt: Type.Number(),
        ...NativeSessionFields,
        user: Type.Object({
            id: Type.String({ format: "uuid" }),
            username: Type.String(),
        }),
    }),
);

export type RefreshResponse = Static<typeof RefreshResponseSchema>;
