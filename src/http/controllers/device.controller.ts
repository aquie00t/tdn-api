import type { RegisterDeviceUseCase } from "@core/use-cases/device/register-device";
import type { UnregisterDeviceUseCase } from "@core/use-cases/device/unregister-device";
import type {
    RegisterDeviceBody,
    UnregisterDeviceBody,
} from "@typings/schemas/device/device.schema";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Controller for the push registration endpoints.
 */
export class DeviceController {
    /**
     * Creates a new DeviceController instance.
     *
     * @param registerDeviceUseCase - Use case that records an installation
     * @param unregisterDeviceUseCase - Use case that retires one
     */
    constructor(
        private readonly registerDeviceUseCase: RegisterDeviceUseCase,
        private readonly unregisterDeviceUseCase: UnregisterDeviceUseCase,
    ) {}

    /**
     * Registers the calling installation for notifications.
     *
     * @param request - The request, carrying the push token
     * @param reply - The reply to send
     */
    async register(
        request: FastifyRequest<{ Body: RegisterDeviceBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.registerDeviceUseCase.execute({
            currentUserId: request.user!.id,
            ...request.body,
        });

        reply.status(200).send({
            data: { registered: true },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Stops notifying the calling installation.
     *
     * @param request - The request, carrying the push token
     * @param reply - The reply to send
     */
    async unregister(
        request: FastifyRequest<{ Body: UnregisterDeviceBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.unregisterDeviceUseCase.execute({
            currentUserId: request.user!.id,
            token: request.body.token,
        });

        reply.status(200).send({
            data: { registered: false },
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
