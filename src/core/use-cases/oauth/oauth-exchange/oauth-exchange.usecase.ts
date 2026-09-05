import type { CachePort } from "@core/ports/services/cache.port";
import type {
    AuthTokenPort,
    UserPayload,
} from "@core/ports/services/auth-token.port";
import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type { LoginOutput } from "@core/use-cases/auth/login/login.output";
import { UnauthorizedError } from "@core/errors";
import { AuthMapper } from "../../auth/auth.mapper";
import type { OAuthExchangeInput } from "./oauth-exchange.input";
import type { OAuthDelivery } from "../oauth-state";

export interface OAuthExchangePayload {
    userId: string;
    username: string;
    isEmailVerified: boolean;

    /**
     * Which channel the session belongs on, decided when the flow started.
     *
     * Carried on the code rather than asked of the caller: whoever holds the
     * code decides nothing here, because a browser holding one could otherwise
     * ask for the body channel and read out a thirty-day refresh token.
     */
    delivery?: OAuthDelivery;
}

export class OAuthExchangeUseCase {
    constructor(
        private readonly cacheService: CachePort,
        private readonly authTokenService: AuthTokenPort,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
    ) {}

    async execute(
        input: OAuthExchangeInput,
    ): Promise<LoginOutput & { delivery: OAuthDelivery }> {
        const cacheKey = `oauth:exchange:${input.code}`;

        const raw = await this.cacheService.get(cacheKey);
        if (!raw) {
            throw new UnauthorizedError("Invalid or expired exchange code");
        }

        // Delete immediately — single-use guarantee
        await this.cacheService.delete(cacheKey);

        const payload = JSON.parse(raw) as OAuthExchangePayload;

        const userPayload: UserPayload = {
            id: payload.userId,
            username: payload.username,
        };

        const { accessToken, expiresAt, refreshToken, refreshTokenExpiresAt } =
            this.authTokenService.generate(userPayload);

        const refreshTokenHash =
            this.authTokenService.hashRefreshSecret(refreshToken);

        await this.refreshTokenRepository.create({
            tokenHash: refreshTokenHash,
            userId: payload.userId,
            deviceIp: input.deviceIp,
            userAgent: input.userAgent,
            expiresAt: new Date(refreshTokenExpiresAt * 1000),
        });

        return {
            // Absent on a code minted before this field existed, which can
            // only be one already in flight: the cookie is what those flows
            // expected.
            delivery: payload.delivery ?? "cookie",
            user: {
                ...AuthMapper.toUserOutput(userPayload),
                isEmailVerified: payload.isEmailVerified,
            },
            tokens: AuthMapper.toTokenOutput({
                accessToken,
                expiresAt,
                refreshToken,
                refreshTokenExpiresAt,
            }),
        };
    }
}
