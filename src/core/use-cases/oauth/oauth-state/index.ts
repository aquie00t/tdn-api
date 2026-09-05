/**
 * This module exports the use cases that start an OAuth flow and read back
 * what it was started for.
 */
export {
    BeginOAuthUseCase,
    ConsumeOAuthStateUseCase,
} from "./oauth-state.usecase";
export type { OAuthProvider } from "./oauth-state.usecase";
/**
 * This module exports the redirect target rules an OAuth flow is bound to.
 */
export {
    defaultRedirectTarget,
    resolveRedirectTarget,
} from "./oauth-redirect-target";
export type {
    OAuthDelivery,
    OAuthRedirectConfig,
    OAuthRedirectTarget,
} from "./oauth-redirect-target";
