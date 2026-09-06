import { UnauthorizedError } from "@core/errors";
import { clientIp } from "@plugins/shared/client-ip";
import type { ForgotPasswordUseCase } from "@core/use-cases/auth/forgot-password";
import type { LoginUseCase } from "@core/use-cases/auth/login";
import type { LogoutUseCase } from "@core/use-cases/auth/logout";
import type { RecoverAccountUseCase } from "@core/use-cases/auth/recover-account";
import type { RefreshUseCase } from "@core/use-cases/auth/refresh";
import type { RegisterUseCase } from "@core/use-cases/auth/register";
import type { ResetPasswordUseCase } from "@core/use-cases/auth/reset-password";
import type { SendVerificationEmailUseCase } from "@core/use-cases/auth/send-verification-email";
import type { VerifyEmailUseCase } from "@core/use-cases/auth/verify-email";
import type { ForgotPasswordBody } from "@typings/schemas/auth/forgot-password.schema";
import type { LoginBody } from "@typings/schemas/auth/login.schema";
import type { RecoverAccountBody } from "@typings/schemas/auth/recover-account.schema";
import type { RegisterBody } from "@typings/schemas/auth/register.schema";
import type { ResetPasswordBody } from "@typings/schemas/auth/reset-password.schema";
import type { VerifyEmailBody } from "@typings/schemas/auth/verify-email.schema";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CheckUserUseCase } from "@core/use-cases/auth/check-user";
import { BaseAuthController } from "./base-auth.controller";
import type { CheckUserBody } from "@typings/schemas/auth/check-user.schema";

export class AuthController extends BaseAuthController {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly refreshUseCase: RefreshUseCase,
        private readonly logoutUseCase: LogoutUseCase,
        private readonly sendVerificationEmailUseCase: SendVerificationEmailUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
        private readonly resetPasswordUseCase: ResetPasswordUseCase,
        private readonly recoverAccountUseCase: RecoverAccountUseCase,
        private readonly checkUserUseCase: CheckUserUseCase,
        config: FastifyInstance["config"],
    ) {
        super(config);
    }

    async register(
        request: FastifyRequest<{ Body: RegisterBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const user = await this.registerUseCase.execute({
            email: request.body.email,
            username: request.body.username,
            password: request.body.password,
        });

        reply.status(201).send({
            data: {
                id: user.id,
                username: user.username,
                createdAt: user.createdAt.toISOString(),
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async login(
        request: FastifyRequest<{ Body: LoginBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const response = await this.loginUseCase.execute({
            identifier: request.body.identifier,
            password: request.body.password,
            deviceIp: clientIp(request),
            userAgent: request.headers["user-agent"] ?? "Unknown Device",
        });

        const delivered = this.deliverRefreshToken(reply, {
            channel: this.channelFor(request.body.client),
            refreshToken: response.tokens.refreshToken,
            refreshTokenExpiresAt: response.tokens.refreshTokenExpiresAt,
        });

        reply.status(201).send({
            data: {
                accessToken: response.tokens.accessToken,
                expiresAt: response.tokens.expiresAt,
                ...delivered,
                user: response.user,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async refresh(
        request: FastifyRequest<{ Body?: { refreshToken?: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        // The channel the request arrived on is the channel it is answered
        // on. Nothing the caller says is consulted: a browser always reaches
        // us through the cookie, so no request originating in a page can ever
        // be answered with a refresh token in the body.
        const cookieToken = this.unsignRefreshToken(request);
        const token = cookieToken ?? this.bodyRefreshToken(request);

        if (!token) {
            throw new UnauthorizedError("Authentication session not found");
        }

        const response = await this.refreshUseCase.execute({
            token,
            deviceIp: clientIp(request),
            userAgent: request.headers["user-agent"] ?? "Unknown Device",
        });

        const delivered = this.deliverRefreshToken(reply, {
            channel: cookieToken ? "cookie" : "body",
            refreshToken: response.refreshToken,
            refreshTokenExpiresAt: response.refreshTokenExpiresAt,
        });

        reply.status(200).send({
            data: {
                accessToken: response.accessToken,
                expiresAt: response.expiresAt,
                ...delivered,
                user: response.user,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        // Reads both channels for the reason refresh does: a native client
        // holds its token in the keystore rather than in a cookie, and a
        // logout it cannot perform leaves the session alive for thirty days.
        const token =
            this.unsignRefreshToken(request) ?? this.bodyRefreshToken(request);

        if (token) {
            await this.logoutUseCase.execute({ token });
        }

        this.clearRefreshTokenCookie(reply, "/auth/refresh");

        reply.status(204).send();
    }

    async sendVerification(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        await this.sendVerificationEmailUseCase.execute({
            userId: request.user.id,
        });

        reply.status(200).send({
            data: { sent: true },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async verifyEmail(
        request: FastifyRequest<{ Body: VerifyEmailBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.verifyEmailUseCase.execute({
            userId: request.user.id,
            otp: request.body.otp,
        });

        reply.status(200).send({
            data: { verified: true },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async forgotPassword(
        request: FastifyRequest<{ Body: ForgotPasswordBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.forgotPasswordUseCase.execute({
            email: request.body.email,
        });

        reply.status(204).send();
    }

    async resetPassword(
        request: FastifyRequest<{ Body: ResetPasswordBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.resetPasswordUseCase.execute({
            email: request.body.email,
            otp: request.body.otp,
            newPassword: request.body.newPassword,
        });

        reply.status(200).send({
            data: { reset: true },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async recoverAccount(
        request: FastifyRequest<{ Body: RecoverAccountBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const response = await this.recoverAccountUseCase.execute({
            recoveryToken: request.body.recoveryToken,
            deviceIp: clientIp(request),
            userAgent: request.headers["user-agent"] ?? "Unknown Device",
        });

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

    async checkUser(
        request: FastifyRequest<{ Body: CheckUserBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const isCheck = await this.checkUserUseCase.execute({
            identifier: request.body.identifier,
        });

        return reply.status(200).send({
            data: {
                check: isCheck,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    }
}
