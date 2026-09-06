import "fastify";
import type { PrismaClient } from "src/generated/prisma/client";
import { type EnvConfig } from "./schemas/env.schema";

declare module "fastify" {
    interface FastifyContextConfig {
        /**
         * Whether a retried request carrying an `Idempotency-Key` should be
         * answered from the first attempt rather than run again.
         *
         * Opt-in, because most writes here are already idempotent and paying
         * for a claim on those buys nothing.
         */
        idempotency?: boolean;
    }

    interface FastifyInstance {
        config: EnvConfig;
        prisma: PrismaClient;
        authenticate: (request: FastifyRequest) => Promise<void>;
        optionalAuthenticate: (request: FastifyRequest) => Promise<void>;
    }
}

export {};
