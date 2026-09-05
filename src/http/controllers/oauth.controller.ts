import { BaseAuthController } from "./base-auth.controller";
import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import { AccountPendingDeletionError } from "@core/errors";
import type { GithubLoginUseCase } from "@core/use-cases/oauth/oauth-github";
import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";
import type { GoogleLoginUseCase } from "@core/use-cases/oauth/oauth-google";
import type { OAuthExchangeUseCase } from "@core/use-cases/oauth/oauth-exchange";
import type { OAuthExchangeBody } from "@typings/schemas/oauth/oauth-exchange.schema";

export class OAuthController extends BaseAuthController {
    constructor(
        private readonly githubAuthService: GithubAuthPort,
        private readonly githubLoginUseCase: GithubLoginUseCase,
        private readonly googleAuthService: GoogleAuthPort,
        private readonly googleLoginUseCase: GoogleLoginUseCase,
        private readonly oauthExchangeUseCase: OAuthExchangeUseCase,
        config: FastifyInstance["config"],
    ) {
        super(config);
    }

    private get frontendUrl(): string {
        return this.config.FRONTEND_URL;
    }

    github(_request: FastifyRequest, reply: FastifyReply): void {
        const url = this.githubAuthService.getAuthorizationUrl();
        reply.redirect(url);
    }

    async githubCallback(
        request: FastifyRequest<{
            Querystring: { code?: string; error?: string };
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { code, error } = request.query;

        if (error) {
            return reply.redirect(
                `${this.frontendUrl}/login?error=github_access_denied`,
            );
        }

        if (!code) {
            return reply.redirect(
                `${this.frontendUrl}/login?error=missing_code`,
            );
        }

        try {
            const { exchangeCode } = await this.githubLoginUseCase.execute({
                code,
            });

            reply.redirect(
                `${this.frontendUrl}/oauth-success?code=${exchangeCode}`,
            );
        } catch (err: unknown) {
            if (err instanceof AccountPendingDeletionError) {
                return reply.redirect(
                    `${this.frontendUrl}/oauth-success?error=account_pending_deletion&recoveryToken=${err.recoveryToken}`,
                );
            }

            reply.redirect(
                `${this.frontendUrl}/oauth-success?error=oauth_failed`,
            );
        }
    }

    google(_request: FastifyRequest, reply: FastifyReply): void {
        const url = this.googleAuthService.getAuthorizationUrl();
        reply.redirect(url);
    }

    async googleCallback(
        request: FastifyRequest<{
            Querystring: { code?: string; error?: string };
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { code, error } = request.query;

        if (error) {
            return reply.redirect(
                `${this.frontendUrl}/login?error=google_access_denied`,
            );
        }

        if (!code) {
            return reply.redirect(
                `${this.frontendUrl}/login?error=missing_code`,
            );
        }

        try {
            const { exchangeCode } = await this.googleLoginUseCase.execute({
                code,
            });

            reply.redirect(
                `${this.frontendUrl}/oauth-success?code=${exchangeCode}`,
            );
        } catch (err: unknown) {
            if (err instanceof AccountPendingDeletionError) {
                return reply.redirect(
                    `${this.frontendUrl}/oauth-success?error=account_pending_deletion&recoveryToken=${err.recoveryToken}`,
                );
            }

            reply.redirect(
                `${this.frontendUrl}/oauth-success?error=oauth_failed`,
            );
        }
    }

    async exchange(
        request: FastifyRequest<{ Body: OAuthExchangeBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const response = await this.oauthExchangeUseCase.execute({
            code: request.body.code,
            deviceIp: request.ip,
            userAgent: request.headers["user-agent"] ?? "Unknown Device",
        });

        // Cookie only, deliberately. The exchange code is handed to a *web
        // page* today - the callback redirects to FRONTEND_URL with the code
        // in the query string - so a native channel here would be reachable
        // from page JavaScript, which could trade the code it can already see
        // for a thirty-day refresh token instead of a fifteen-minute access
        // token. The app gets its own channel when the callback learns to
        // redirect to the app's scheme, and not before.
        this.setRefreshTokenCookie(
            reply,
            response.tokens.refreshToken,
            response.tokens.refreshTokenExpiresAt,
        );

        reply.status(200).send({
            data: {
                accessToken: response.tokens.accessToken,
                expiresAt: response.tokens.expiresAt,
                user: response.user,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
