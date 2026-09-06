import type { FastifyRequest } from "fastify";

/**
 * The caller's address, as far as it can be trusted.
 *
 * `request.ip` is not it. The app runs with `trustProxy: true`, which tells
 * Fastify to believe the whole `X-Forwarded-For` chain - and the left-hand end
 * of that chain is written by the client. Anything that keys or records an
 * address from `request.ip` is therefore recording whatever the caller felt
 * like sending.
 *
 * `CF-Connecting-IP` is not spoofable the same way: Cloudflare overwrites it at
 * the edge, and this deployment has no route around the edge - the Render
 * subdomain is disabled, so the custom domain is the only way in. Where the
 * header is absent (local development, tests, a direct peer) there is no proxy
 * to lie through either, and `request.ip` is the real peer.
 *
 * The proper fix is to replace `trustProxy: true` with the actual hop count or
 * the edge's CIDR ranges. That takes knowing the deployment's exact shape;
 * this does not, and closes the same hole for the two things that matter -
 * what brute-force protection counts, and what a session records about the
 * device that opened it.
 *
 * @param request - The incoming request
 * @returns The address to attribute this request to
 */
export function clientIp(request: FastifyRequest): string {
    const edgeIp = request.headers["cf-connecting-ip"];

    if (typeof edgeIp === "string" && edgeIp.length > 0) return edgeIp;

    return request.ip;
}
