import type { LoggerPort } from "@core/ports/services/logger.port";
import type { FastifyInstance } from "fastify";

export class LoggerService implements LoggerPort {
    constructor(private readonly logger: FastifyInstance["log"]) {}

    error(object: object, message: string): void {
        return this.logger.error(object, message);
    }

    warn(object: object, message: string): void {
        return this.logger.warn(object, message);
    }
}
