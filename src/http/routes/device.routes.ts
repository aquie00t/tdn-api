/**
 * Device routes module
 *
 * Where an app says which phone to notify, and where it says to stop. There is
 * no read side: the client already knows its own token, and listing somebody's
 * devices back to them is a login-history feature, not this one.
 *
 * `SENSITIVE` rather than `STANDARD`. Registration happens once per launch,
 * so 5/min is far above what the app needs, and this endpoint writes a row
 * that decides where notifications physically arrive.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    DeviceActionResponseSchema,
    RegisterDeviceBodySchema,
    UnregisterDeviceBodySchema,
    type RegisterDeviceBody,
    type UnregisterDeviceBody,
} from "@typings/schemas/device/device.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up the device routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function deviceRoutes(fastify: FastifyInstance): void {
    const deviceController = fastify.diContainer.cradle.deviceController;

    fastify.post<{ Body: RegisterDeviceBody }>(
        "/devices",
        {
            schema: {
                body: RegisterDeviceBodySchema,
                response: { 200: DeviceActionResponseSchema },
                tags: ["Device"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        deviceController.register.bind(deviceController),
    );

    fastify.delete<{ Body: UnregisterDeviceBody }>(
        "/devices",
        {
            schema: {
                body: UnregisterDeviceBodySchema,
                response: { 200: DeviceActionResponseSchema },
                tags: ["Device"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        deviceController.unregister.bind(deviceController),
    );
}
