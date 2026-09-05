import type { OAuthDelivery } from "../oauth-state";

export interface GithubLoginInput {
    code: string;

    /** Which channel the session this produces belongs on. */
    delivery: OAuthDelivery;
}
