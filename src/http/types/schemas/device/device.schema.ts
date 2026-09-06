import { type Static, Type } from "@fastify/type-provider-typebox";
import { DevicePlatform } from "@core/domain/enums";

/**
 * An app installation announcing itself.
 *
 * Sent at every launch rather than only the first: the platform can reissue a
 * token at any time, and re-registering is also what keeps the row from being
 * swept as abandoned.
 */
export const RegisterDeviceBodySchema = Type.Object({
    token: Type.String({ minLength: 1, maxLength: 512 }),
    platform: Type.Enum(DevicePlatform),
    appVersion: Type.Optional(Type.String({ maxLength: 32 })),
    locale: Type.Optional(Type.String({ maxLength: 16 })),
});

export type RegisterDeviceBody = Static<typeof RegisterDeviceBodySchema>;

/**
 * An installation being retired.
 */
export const UnregisterDeviceBodySchema = Type.Object({
    token: Type.String({ minLength: 1, maxLength: 512 }),
});

export type UnregisterDeviceBody = Static<typeof UnregisterDeviceBodySchema>;

/**
 * What either call answers.
 *
 * Deliberately empty of detail. Whether a row was written, moved or already
 * matched is not something the caller can act on, and "this token was
 * registered to somebody else" is not something it should learn.
 */
export const DeviceActionResponseSchema = Type.Object({
    data: Type.Object({
        registered: Type.Boolean(),
    }),
    meta: Type.Object({ timestamp: Type.String({ format: "date-time" }) }),
});

export type DeviceActionResponse = Static<typeof DeviceActionResponseSchema>;
