import { type Static, Type } from "@fastify/type-provider-typebox";
import { ClientKindSchema, NativeSessionFields } from "./client.schema";
import { ResponseSchema } from "../create-response-schema";

export const LoginBodySchema = Type.Object({
    identifier: Type.String(),
    password: Type.String(),
    client: ClientKindSchema,
});

export type LoginBody = Static<typeof LoginBodySchema>;

export const LoginResponseSchema = ResponseSchema(
    Type.Object({
        accessToken: Type.String(),
        expiresAt: Type.Number(),
        ...NativeSessionFields,
        user: Type.Object({
            id: Type.String({ format: "uuid" }),
            username: Type.String(),
            isEmailVerified: Type.Boolean(),
        }),
    }),
);

export type LoginResponse = Static<typeof LoginResponseSchema>;
