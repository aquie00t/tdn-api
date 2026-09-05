import type { OAuthDelivery } from "../oauth-state";

export interface GoogleLoginInput {
    code: string;

    /** Which channel the session this produces belongs on. */
    delivery: OAuthDelivery;
}
