/**
 * @fileoverview Error classes for the TDN API application.
 *
 * This module exports all custom error classes organized by category:
 * - Authentication errors (auth/)
 * - User-related errors (user/)
 * - Post/media errors (post/)
 * - Common HTTP errors (common/)
 */

// Authentication errors
export * from "./auth/account-pending-deletion.error";
export * from "./auth/invalid-credentials.error";
export * from "./auth/oauth-provider.error";
export * from "./auth/unauthorized.error";

// User-related errors
export * from "./user/too-many-requests.error";
export * from "./user/unauthorized-action.error";
export * from "./user/user-already-exists.error";

// Post and media errors
export * from "./post/invalid-file-type.error";
export * from "./post/invalid-media-type.error";
export * from "./post/media-limit-exceeded.error";
export * from "./post/no-media-provided.error";

// Article errors
export * from "./article/invalid-article-state.error";

// Common HTTP errors
export * from "./common/bad-request.error";
export * from "./common/conflict.error";
export * from "./common/custom.error";
export * from "./common/not-found.error";
export * from "./common/forbidden.error";
export * from "./common/translation-failed.error";
