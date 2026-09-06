import { type Static, Type } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "../create-response-schema";

/**
 * A purchase the app has just completed, handed over for verification.
 *
 * The token is Google's, produced by the billing library on the device. It is
 * not a claim to anything on its own - the server asks Google what it is - but
 * this request is the only place the account behind it is known, because it is
 * the only one carrying a session.
 */
export const RegisterPlayPurchaseBodySchema = Type.Object({
    purchaseToken: Type.String({ minLength: 1, maxLength: 4096 }),
    productId: Type.String({ minLength: 1, maxLength: 200 }),
});

export type RegisterPlayPurchaseBody = Static<
    typeof RegisterPlayPurchaseBodySchema
>;

export const RegisterPlayPurchaseResponseSchema = ResponseSchema(
    Type.Object({
        /**
         * Whether the badge is granted as a result.
         *
         * False is not a failure: a purchase Google has not confirmed yet is
         * linked to the account and left pending, and the nightly reconcile
         * finishes it.
         */
        isVerified: Type.Boolean(),
    }),
);

export type RegisterPlayPurchaseResponse = Static<
    typeof RegisterPlayPurchaseResponseSchema
>;

/**
 * The shared secret Pub/Sub appends to the push URL.
 *
 * Checked as a query parameter because that is what a Pub/Sub push
 * subscription can carry without any Google library on this side. It is a
 * bearer secret and nothing more; verifying the OIDC token Google can also
 * send is the stronger option and arrives with the rest of the Google
 * integration.
 */
export const PlayNotificationQuerySchema = Type.Object({
    token: Type.Optional(Type.String({ maxLength: 200 })),
});

export type PlayNotificationQuery = Static<typeof PlayNotificationQuerySchema>;
