import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import type { ClientKind } from "@typings/schemas/auth/client.schema";

const PRODUCTION_DOMAIN = ".developernetwork.net";

/**
 * The refresh token, and how it should reach the client that asked for it.
 *
 * `body` is only ever produced for a caller that reached us without a cookie -
 * a native app - so a browser can never be answered on that channel.
 */
export interface SessionDelivery {
    channel: "cookie" | "body";
    refreshToken: string;
    refreshTokenExpiresAt: number;
}

export abstract class BaseAuthController {
    constructor(protected readonly config: FastifyInstance["config"]) {}

    protected get isProduction(): boolean {
        return this.config.NODE_ENV === "production";
    }

    protected dateToMaxAge(date: Date): number {
        return Math.floor((date.getTime() - Date.now()) / 1000);
    }

    protected setRefreshTokenCookie(
        reply: FastifyReply,
        token: string,
        maxAge: number | Date,
        path: string = "/",
    ): void {
        reply.setCookie("refreshToken", token, {
            path,
            httpOnly: true,
            secure: this.isProduction,
            sameSite: this.isProduction ? "none" : "lax",
            domain: this.isProduction ? PRODUCTION_DOMAIN : undefined,
            maxAge: maxAge instanceof Date ? this.dateToMaxAge(maxAge) : maxAge,
            signed: true,
        });
    }

    protected clearRefreshTokenCookie(
        reply: FastifyReply,
        path: string = "/",
    ): void {
        reply.clearCookie("refreshToken", {
            path,
            httpOnly: true,
            secure: this.isProduction,
            sameSite: this.isProduction ? "none" : "lax",
            domain: this.isProduction ? PRODUCTION_DOMAIN : undefined,
            signed: true,
        });
    }

    protected unsignRefreshToken(request: FastifyRequest): string | null {
        const rawCookie = request.cookies.refreshToken;

        if (!rawCookie) return null;

        const unsigned = request.unsignCookie(rawCookie);

        return unsigned.valid && unsigned.value ? unsigned.value : null;
    }

    /**
     * Reads a refresh token supplied in the request body.
     *
     * Deliberately defensive rather than schema-validated: `/auth/refresh` and
     * `/auth/logout` are called by browsers with no body at all, and declaring
     * a body schema on a route that is usually called without one turns an
     * empty request into a 400.
     *
     * @param request - The incoming request
     * @returns The token, or null when the body carries none
     */
    protected bodyRefreshToken(request: FastifyRequest): string | null {
        const body = request.body as { refreshToken?: unknown } | undefined;
        const token = body?.refreshToken;

        return typeof token === "string" && token.length > 0 ? token : null;
    }

    /**
     * Hands a freshly issued refresh token to the client on the right channel.
     *
     * Cookie for a browser, response body for a native app - and the caller
     * decides which by how it asked, never by anything this method infers.
     *
     * @param reply - The reply being built
     * @param delivery - The token and the channel it belongs on
     * @param cookiePath - Path to scope the cookie to
     * @returns The fields to merge into the response payload, empty for a
     * cookie delivery
     */
    protected deliverRefreshToken(
        reply: FastifyReply,
        delivery: SessionDelivery,
        cookiePath: string = "/",
    ): { refreshToken?: string; refreshTokenExpiresAt?: number } {
        if (delivery.channel === "body") {
            return {
                refreshToken: delivery.refreshToken,
                refreshTokenExpiresAt: delivery.refreshTokenExpiresAt,
            };
        }

        this.setRefreshTokenCookie(
            reply,
            delivery.refreshToken,
            delivery.refreshTokenExpiresAt,
            cookiePath,
        );

        return {};
    }

    /**
     * The channel a caller declaring itself should be answered on.
     *
     * Used by the two endpoints that mint a session from something other than
     * a refresh token - login and the OAuth exchange - where there is no
     * incoming channel to mirror. Both require credentials the browser attack
     * this protects against does not have: page JavaScript cannot log in
     * without the password, nor exchange an OAuth code it never saw.
     *
     * @param client - The declared client kind, if any
     * @returns Which channel to answer on
     */
    protected channelFor(
        client: ClientKind | undefined,
    ): SessionDelivery["channel"] {
        return client === "native" ? "body" : "cookie";
    }
}
