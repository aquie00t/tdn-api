import { type Static, Type } from "@fastify/type-provider-typebox";
import { SubscriptionStatus } from "@core/domain/enums";
import { ResponseSchema } from "../create-response-schema";

/**
 * What the client needs to render the subscription screen.
 *
 * State, never receipts or amounts: the store owns those and shows them to the
 * user itself, and the client needs none of it to choose between "subscribe",
 * "you are subscribed" and "your subscription ends on the 14th".
 */
export const SubscriptionResponseSchema = ResponseSchema(
    Type.Object({
        /** Whether the badge is currently granted. */
        isVerified: Type.Boolean(),

        /** When it expires, null when nothing is granted. */
        verifiedUntil: Type.Union([
            Type.String({ format: "date-time" }),
            Type.Null(),
        ]),

        /** Null for an account that has never subscribed. */
        status: Type.Union([Type.Enum(SubscriptionStatus), Type.Null()]),

        currentPeriodEnd: Type.Union([
            Type.String({ format: "date-time" }),
            Type.Null(),
        ]),

        /** The user cancelled, but the period they paid for is still running. */
        cancelAtPeriodEnd: Type.Boolean(),
    }),
);

export type SubscriptionResponse = Static<typeof SubscriptionResponseSchema>;
