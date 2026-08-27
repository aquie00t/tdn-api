import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { App } from "../../../src/app";
import type {
    FastifyInstance,
    InjectOptions,
    LightMyRequestResponse,
} from "fastify";
import { API_PREFIX, parseBody, request as sharedRequest } from "../setup";

/**
 * Rate limit budget for POST /follows.
 *
 * Onboarding in tdn-client makes a new account follow MIN_FOLLOWS accounts
 * before it may enter the app, and the gate is mandatory. The follow policy
 * therefore has to clear that number with room for a change of mind and a
 * retry - under SENSITIVE's 5/min it was exactly equal to it, and the sixth
 * request failed inside a flow the user could not leave.
 *
 * This suite runs its own Fastify instance with DISABLE_RATE_LIMIT=false so
 * the limiter is live. Accounts are created through the shared instance,
 * where limits are off, because registration sits on STRICT (3 / 15 min).
 */

/** Mirrors MIN_FOLLOWS in tdn-client. Raising it there has to be checked here. */
const MIN_FOLLOWS = 5;

let rlApp: App;
let rlServer: FastifyInstance;

const ts = Date.now();
let actorToken = "";
const targetIds: string[] = [];

beforeAll(async () => {
    const actor = {
        email: `flw-rl-actor-${ts}@test.com`,
        password: "password123",
        username: `flwrlactor${ts}`,
    };

    await sharedRequest({
        method: "POST",
        url: "/auth/register",
        payload: actor,
    });

    const login = await sharedRequest({
        method: "POST",
        url: "/auth/login",
        payload: { identifier: actor.email, password: actor.password },
    });
    actorToken = parseBody<{ data: { accessToken: string } }>(login).data
        .accessToken;

    // One more target than the onboarding minimum, so the request that used
    // to be rejected is actually made.
    for (let i = 0; i < MIN_FOLLOWS + 1; i++) {
        const registered = await sharedRequest({
            method: "POST",
            url: "/auth/register",
            payload: {
                email: `flw-rl-target-${i}-${ts}@test.com`,
                password: "password123",
                username: `flwrlt${i}${ts}`,
            },
        });
        targetIds.push(parseBody<{ data: { id: string } }>(registered).data.id);
    }

    process.env.DISABLE_RATE_LIMIT = "false";
    rlApp = new App();
    await rlApp.init();
    rlServer = rlApp.instance;
});

afterAll(async () => {
    await rlApp.close();
    process.env.DISABLE_RATE_LIMIT = "true";
});

function request(
    opts: Omit<InjectOptions, "url"> & { url: string },
): Promise<LightMyRequestResponse> {
    return rlServer.inject({
        ...opts,
        url: `${API_PREFIX}${opts.url}`,
        headers: {
            ...opts.headers,
            authorization: `Bearer ${actorToken}`,
        },
    });
}

describe("POST /follows rate limit budget", () => {
    it("should let a new account complete onboarding with room to spare", async () => {
        for (let i = 0; i < MIN_FOLLOWS + 1; i++) {
            const res = await request({
                method: "POST",
                url: "/follows",
                payload: { targetId: targetIds[i] },
            });

            expect(
                res.statusCode,
                `follow ${i + 1} of ${MIN_FOLLOWS + 1} should not be rate limited`,
            ).not.toBe(429);
        }
    });

    it("should leave budget for undoing a follow after the minimum is met", async () => {
        // A user who changes their mind spends a request on the unfollow and
        // another on the replacement. Under the old budget both were gone.
        const undo = await request({
            method: "DELETE",
            url: "/follows",
            payload: { targetId: targetIds[0] },
        });
        expect(undo.statusCode).not.toBe(429);

        const redo = await request({
            method: "POST",
            url: "/follows",
            payload: { targetId: targetIds[0] },
        });
        expect(redo.statusCode).not.toBe(429);
    });
});
