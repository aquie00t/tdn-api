/**
 * Which store's push service a device token belongs to.
 *
 * Recorded even though the sending side does not branch on it - Expo resolves
 * FCM and APNs itself - because it is the first thing anybody looks at when
 * one platform stops receiving notifications.
 *
 * Mirrors the `DevicePlatform` enum in the Prisma schema exactly.
 */
export enum DevicePlatform {
    ANDROID = "ANDROID",
    IOS = "IOS",
}
