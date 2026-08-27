import { beforeAll, afterAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import errorHandlerPlugin from "@plugins/custom/error-handler.plugin";
import { ConflictError, NotFoundError } from "@core/errors";

/**
 * Unit tests for the RFC 7807 error handler.
 *
 * Uses a bare Fastify instance with only this plugin registered, so nothing
 * but the handler's own mapping decides the answer.
 */

/**
 * Builds an error shaped like a Prisma driver failure, without pulling the
 * generated client into the test.
 */
function prismaError(code: string): Error & { code: string } {
    const error = new Error(
        `Invalid \`prisma.follow.create()\` invocation: constraint failed on fields: (\`followerId\`,\`followingId\`)`,
    ) as Error & { code: string };
    error.name = "PrismaClientKnownRequestError";
    error.code = code;
    return error;
}

describe("errorHandlerPlugin", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        await app.register(errorHandlerPlugin);

        app.get("/custom", async () => {
            throw new ConflictError("Already following.");
        });
        app.get("/not-found", async () => {
            throw new NotFoundError("User not found.");
        });
        app.get("/boom", async () => {
            throw new Error("connection to the mothership failed");
        });
        app.get("/prisma/:code", async (request) => {
            throw prismaError(
                (request.params as { code: string }).code.toUpperCase(),
            );
        });

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe("custom errors", () => {
        it("should answer with the error's own status and name", async () => {
            const res = await app.inject({ method: "GET", url: "/custom" });

            expect(res.statusCode).toBe(409);
            expect(res.json()).toMatchObject({
                type: "about:blank",
                title: "ConflictError",
                status: 409,
                detail: "Already following.",
                instance: "/custom",
            });
        });

        it("should keep a custom error's message intact", async () => {
            const res = await app.inject({ method: "GET", url: "/not-found" });

            expect(res.statusCode).toBe(404);
            expect(res.json().detail).toBe("User not found.");
        });
    });

    describe("Prisma driver failures", () => {
        it("should answer a unique violation as a conflict", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p2002",
            });

            expect(res.statusCode).toBe(409);
            expect(res.json()).toMatchObject({
                title: "ConflictError",
                status: 409,
                instance: "/prisma/p2002",
            });
        });

        it("should answer a missing record as a 404", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p2025",
            });

            expect(res.statusCode).toBe(404);
            expect(res.json().title).toBe("NotFoundError");
        });

        it("should answer a foreign key violation as a conflict", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p2003",
            });

            expect(res.statusCode).toBe(409);
        });

        it("should answer an over-long value as a bad request", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p2000",
            });

            expect(res.statusCode).toBe(400);
            expect(res.json().title).toBe("BadRequestError");
        });

        it("should never leak the query or column names Prisma names", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p2002",
            });

            expect(res.json().detail).not.toContain("prisma.follow.create");
            expect(res.json().detail).not.toContain("followerId");
        });

        it("should fall through to a 500 for a code with no mapping", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/prisma/p1017",
            });

            expect(res.statusCode).toBe(500);
        });
    });

    describe("unexpected errors", () => {
        it("should hide the underlying message behind a 500", async () => {
            const res = await app.inject({ method: "GET", url: "/boom" });

            expect(res.statusCode).toBe(500);
            expect(res.json().detail).not.toContain("mothership");
        });

        it("should not reuse the client's own unparseable-response wording", async () => {
            // The client shows "An unexpected error occurred." when it cannot
            // parse a response at all. Sharing that string here would make a
            // real server fault indistinguishable from a client-side one.
            const res = await app.inject({ method: "GET", url: "/boom" });

            expect(res.json().detail).not.toBe("An unexpected error occurred.");
        });
    });

    describe("unknown routes", () => {
        it("should answer with a problem document naming the path", async () => {
            const res = await app.inject({ method: "GET", url: "/nowhere" });

            expect(res.statusCode).toBe(404);
            expect(res.json()).toMatchObject({
                title: "Not Found",
                status: 404,
                instance: "/nowhere",
            });
            expect(res.json().detail).toContain("/nowhere");
        });
    });
});
