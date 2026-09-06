/**
 * Which store or gateway a subscription is billed through.
 *
 * One value today. It exists so that adding the App Store, or a web gateway,
 * is a new value and a new adapter rather than a second table - everything
 * above the adapter is the same whichever one is paying.
 *
 * Mirrors the `BillingProvider` enum in the Prisma schema exactly.
 */
export enum BillingProvider {
    GOOGLE_PLAY = "GOOGLE_PLAY",
}
