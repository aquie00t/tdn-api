import { CustomError } from "@core/errors";
import type {
    FastifyError,
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * Shape of a Prisma driver failure that carries a documented error code.
 *
 * Matched structurally rather than with `instanceof` so the HTTP layer does
 * not have to import the generated Prisma client.
 */
interface PrismaKnownRequestError {
    name: string;
    code: string;
}

function isPrismaKnownRequestError(
    error: unknown,
): error is PrismaKnownRequestError {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { name?: unknown }).name ===
            "PrismaClientKnownRequestError" &&
        typeof (error as { code?: unknown }).code === "string"
    );
}

/**
 * Translates the Prisma error codes a request can legitimately produce into
 * the HTTP answer they describe.
 *
 * A repository is expected to handle these itself - a unique violation on a
 * follow means "already following", which is not an error at all. This is the
 * safety net for the ones that get through: without it they surface as an
 * opaque 500 titled `PrismaClientKnownRequestError`, which tells a client
 * nothing and hides a bug behind what looks like an outage.
 *
 * Messages are deliberately generic: a Prisma error carries table and column
 * names in its own message, and those are not the client's business.
 *
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
const PRISMA_ERROR_RESPONSES: Record<
    string,
    { status: number; title: string; detail: string }
> = {
    // Unique constraint failed
    P2002: {
        status: 409,
        title: "ConflictError",
        detail: "That resource already exists.",
    },
    // Foreign key constraint failed
    P2003: {
        status: 409,
        title: "ConflictError",
        detail: "That request conflicts with related data.",
    },
    // Record to update or delete does not exist
    P2025: {
        status: 404,
        title: "NotFoundError",
        detail: "The requested resource was not found.",
    },
    // Value too long for the column
    P2000: {
        status: 400,
        title: "BadRequestError",
        detail: "One of the provided values is too long.",
    },
};

/**
 * Custom Error and Not Found Handler Plugin.
 * Implements RFC 7807 (Problem Details for HTTP APIs) for standardized error responses.
 */
function errorHandlerPlugin(
    fastify: FastifyInstance,
    _options: unknown,
    done: () => void,
): void {
    /**
     * Handles 404 Not Found errors for non-existent routes.
     */
    fastify.setNotFoundHandler(
        (request: FastifyRequest, reply: FastifyReply) => {
            const errorResponse = {
                type: "about:blank",
                title: "Not Found",
                status: 404,
                detail: `The requested path (${request.method}:${request.url}) was not found.`,
                instance: request.url,
            };

            void reply.status(404).send(errorResponse);
        },
    );

    /**
     * Global error handler for catching internal server errors and custom thrown exceptions.
     */
    fastify.setErrorHandler(
        (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
            if (error instanceof CustomError) {
                const errorResponse = {
                    type: "about:blank",
                    title: error.name,
                    status: error.statusCode,
                    detail: error.message,
                    instance: request.url,
                    ...error,
                };
                return void reply.status(error.statusCode).send(errorResponse);
            }

            if (error.validation) {
                const errorResponse = {
                    type: "about:blank",
                    title: "Validation Error",
                    status: 400,
                    detail: "Invalid data format provided.",
                    instance: request.url,
                    validation: error.validation,
                };
                return void reply.status(400).send(errorResponse);
            }
            if (isPrismaKnownRequestError(error)) {
                const mapped = PRISMA_ERROR_RESPONSES[error.code];

                if (mapped) {
                    // Still logged: reaching here means a repository let a
                    // driver failure escape, which is worth fixing even though
                    // the client now gets a usable answer.
                    fastify.log.error(error);

                    return void reply.status(mapped.status).send({
                        type: "about:blank",
                        title: mapped.title,
                        status: mapped.status,
                        detail: mapped.detail,
                        instance: request.url,
                    });
                }
            }

            const statusCode = error.statusCode || 500;

            // Log internal server errors (500+) for debugging
            if (statusCode >= 500) {
                fastify.log.error(error);
            }

            // Standard RFC 7807 Error Response
            const errorResponse = {
                type: "about:blank",
                title: error.name || "Internal Server Error",
                status: statusCode,
                // Deliberately not "An unexpected error occurred.": the
                // client uses that exact string as its own last-resort message
                // for a response it could not parse, so sharing it makes a real
                // server fault indistinguishable from a client-side one.
                detail:
                    statusCode >= 500
                        ? "The server could not complete the request."
                        : error.message,
                instance: request.url,
            };

            void reply.status(statusCode).send(errorResponse);
        },
    );

    done();
}

export default fastifyPlugin(errorHandlerPlugin, {
    name: "global-error-handler",
});
