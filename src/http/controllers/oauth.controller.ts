import { BaseAuthController } from "./base-auth.controller";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AccountPendingDeletionError } from "@core/errors";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import type { GithubLoginUseCase } from "@core/use-cases/oauth/oauth-github";
import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";
import type { GoogleLoginUseCase } from "@core/use-cases/oauth/oauth-google";
import type { OAuthExchangeUseCase } from "@core/use-cases/oauth/oauth-exchange";
import type {
    BeginOAuthUseCase,
    ConsumeOAuthStateUseCase,
    OAuthProvider,
    OAuthRedirectTarget,
} from "@core/use-cases/oauth/oauth-state";
import type { OAuthExchangeBody } from "@typings/schemas/oauth/oauth-exchange.schema";
import type { OAuthStartQuery } from "@typings/schemas/oauth/oauth-start.schema";

/** What a provider hands back on the callback. */
type CallbackQuery = { code?: string; error?: string; state?: string };

/**
 * Cookie holding the state of the flow this browser started.
 *
 * The other half of the state check. What is kept in the cache proves that
 * somebody started a flow on this deployment; this proves that the browser
 * presenting the callback is that somebody. Without it an attacker can start a
 * flow with their own account, hand the resulting callback URL to a victim,
 * and have the victim's browser finish it - leaving them signed in as the
 * attacker, typing into an account somebody else can read.
 */
const STATE_COOKIE = "oauthState";

/**
 * Appends a query parameter, whether or not the target already has some.
 *
 * An allow-listed target may perfectly reasonably carry its own query string -
 * `https://app.example/cb?tenant=x` - and gluing `?code=…` onto that produces
 * an address no client can parse the code out of.
 *
 * @param url - The target
 * @param key - Parameter name
 * @param value - Parameter value, already encoded
 * @returns The target with the parameter appended
 */
function appendParam(url: string, key: string, value: string): string {
    return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

/** Scoped to the OAuth routes; nothing else has any use for it. */
const STATE_COOKIE_PATH = "/api/v1/oauth";

/** Matches the cache entry the state lives in. */
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

export class OAuthController extends BaseAuthController {
    constructor(
        private readonly githubAuthService: GithubAuthPort,
        private readonly githubLoginUseCase: GithubLoginUseCase,
        private readonly googleAuthService: GoogleAuthPort,
        private readonly googleLoginUseCase: GoogleLoginUseCase,
        private readonly oauthExchangeUseCase: OAuthExchangeUseCase,
        private readonly beginOAuthUseCase: BeginOAuthUseCase,
        private readonly consumeOAuthStateUseCase: ConsumeOAuthStateUseCase,
        config: FastifyInstance["config"],
    ) {
        super(config);
    }

    /**
     * Starts a GitHub flow.
     *
     * @param request - The request, optionally naming a redirect target
     * @param reply - The reply to send
     */
    async github(
        request: FastifyRequest<{ Querystring: OAuthStartQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.start("github", request, reply);
    }

    /**
     * Starts a Google flow.
     *
     * @param request - The request, optionally naming a redirect target
     * @param reply - The reply to send
     */
    async google(
        request: FastifyRequest<{ Querystring: OAuthStartQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.start("google", request, reply);
    }

    /**
     * Finishes a GitHub flow.
     *
     * @param request - The callback, carrying the code and the state
     * @param reply - The reply to send
     */
    async githubCallback(
        request: FastifyRequest<{ Querystring: CallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.finish("github", request, reply);
    }

    /**
     * Finishes a Google flow.
     *
     * @param request - The callback, carrying the code and the state
     * @param reply - The reply to send
     */
    async googleCallback(
        request: FastifyRequest<{ Querystring: CallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.finish("google", request, reply);
    }

    /**
     * Trades a single-use exchange code for a session.
     *
     * The channel is read off the code rather than asked of the caller. The
     * flow that minted it is the only thing that knows whether a browser or an
     * app is waiting, and a caller allowed to choose could trade a code it can
     * already see - one sitting in a page's own URL - for a thirty-day refresh
     * token instead of a fifteen-minute access token.
     *
     * @param request - The request carrying the exchange code
     * @param reply - The reply to send
     */
    async exchange(
        request: FastifyRequest<{ Body: OAuthExchangeBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const response = await this.oauthExchangeUseCase.execute({
            code: request.body.code,
            deviceIp: request.ip,
            userAgent: request.headers["user-agent"] ?? "Unknown Device",
        });

        const delivered = this.deliverRefreshToken(reply, {
            channel: response.delivery,
            refreshToken: response.tokens.refreshToken,
            refreshTokenExpiresAt: response.tokens.refreshTokenExpiresAt,
        });

        reply.status(200).send({
            data: {
                accessToken: response.tokens.accessToken,
                expiresAt: response.tokens.expiresAt,
                ...delivered,
                user: response.user,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Sends the user to a provider, having recorded what the flow is for.
     *
     * @param provider - Which provider to start with
     * @param request - The request, optionally naming a redirect target
     * @param reply - The reply to send
     */
    private async start(
        provider: OAuthProvider,
        request: FastifyRequest<{ Querystring: OAuthStartQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { authorizationUrl, state } =
            await this.beginOAuthUseCase.execute(
                provider,
                request.query.redirect,
            );

        // `lax` rather than `strict`: the callback arrives as a top-level
        // navigation from the provider, which `strict` would strip the cookie
        // from - and then every legitimate flow would fail the check.
        reply.setCookie(STATE_COOKIE, state, {
            path: STATE_COOKIE_PATH,
            httpOnly: true,
            secure: this.isProduction,
            sameSite: "lax",
            maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
            signed: true,
        });

        reply.redirect(authorizationUrl);
    }

    /**
     * Completes a flow and redirects to wherever it was started for.
     *
     * Every exit from here is a redirect. This runs in a browser being sent
     * back from a provider, so there is nobody to read a problem document -
     * the only way to report anything is to put it in the address the caller
     * is being returned to.
     *
     * @param provider - Which provider is calling back
     * @param request - The callback, carrying the code and the state
     * @param reply - The reply to send
     */
    private async finish(
        provider: OAuthProvider,
        request: FastifyRequest<{ Querystring: CallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { code, error, state } = request.query;

        const expectedState = this.readStateCookie(request);

        reply.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });

        // Checked before the cache is even consulted. A state that exists
        // there proves a flow was started; only the cookie proves it was
        // started by the browser standing here.
        const bound =
            Boolean(state) && Boolean(expectedState) && state === expectedState;

        const target = bound
            ? await this.consumeOAuthStateUseCase.execute(state)
            : null;

        // A callback with no usable state is a callback that cannot be tied to
        // a flow anybody started here: a replay, an expired attempt, or a link
        // an attacker built to sign somebody into an account of theirs. It is
        // answered, on the default target, without completing anything.
        if (!target) {
            return this.fail(
                reply,
                this.consumeOAuthStateUseCase.fallbackTarget(),
                "invalid_state",
            );
        }

        if (error) {
            return this.fail(reply, target, `${provider}_access_denied`);
        }

        if (!code) {
            return this.fail(reply, target, "missing_code");
        }

        try {
            const { exchangeCode } = await (provider === "github"
                ? this.githubLoginUseCase.execute({
                      code,
                      delivery: target.delivery,
                  })
                : this.googleLoginUseCase.execute({
                      code,
                      delivery: target.delivery,
                  }));

            reply.redirect(
                appendParam(
                    target.successUrl,
                    "code",
                    encodeURIComponent(exchangeCode),
                ),
            );
        } catch (err: unknown) {
            if (err instanceof AccountPendingDeletionError) {
                return reply.redirect(
                    appendParam(
                        appendParam(
                            target.successUrl,
                            "error",
                            "account_pending_deletion",
                        ),
                        "recoveryToken",
                        encodeURIComponent(err.recoveryToken),
                    ),
                );
            }

            return this.fail(reply, target, "oauth_failed");
        }
    }

    /**
     * Reads the state this browser was given when it started a flow.
     *
     * @param request - The callback request
     * @returns The state, or null when the cookie is absent or unsigned
     */
    private readStateCookie(request: FastifyRequest): string | null {
        const raw = request.cookies[STATE_COOKIE];

        if (!raw) return null;

        const unsigned = request.unsignCookie(raw);

        return unsigned.valid && unsigned.value ? unsigned.value : null;
    }

    /**
     * Reports a failure on the target the flow was started for.
     *
     * @param reply - The reply to send
     * @param target - Where this flow is being returned to
     * @param reason - The error code the client renders
     */
    private fail(
        reply: FastifyReply,
        target: OAuthRedirectTarget,
        reason: string,
    ): void {
        reply.redirect(
            appendParam(target.errorUrl, "error", encodeURIComponent(reason)),
        );
    }
}
