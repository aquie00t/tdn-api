import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import { AccountBannedError, AccountPendingDeletionError } from "@core/errors";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { CachePort } from "@core/ports/services/cache.port";
import type { GoogleLoginInput } from "./google-login.input";
import type { OAuthExchangePayload } from "../oauth-exchange/oauth-exchange.usecase";

const EXCHANGE_CODE_TTL_SECONDS = 60;

export class GoogleLoginUseCase {
    constructor(
        private readonly googleAuthService: GoogleAuthPort,
        private readonly userRepository: IUserRepository,
        private readonly authTokenService: AuthTokenPort,
        private readonly cryptoService: CryptoPort,
        private readonly cacheService: CachePort,
    ) {}

    async execute(input: GoogleLoginInput): Promise<{ exchangeCode: string }> {
        const profile = await this.googleAuthService.getUserProfileByCode(
            input.code,
        );

        let user = await this.userRepository.findByEmail(profile.email);

        if (user) {
            // Before the deletion branch: a suspended account must not be
            // handed the recovery token a pending deletion would earn it.
            if (user.isBanned()) {
                throw new AccountBannedError();
            }

            if (user.isDeleted()) {
                const recoveryToken =
                    this.authTokenService.generateRecoveryToken(user.id);

                throw new AccountPendingDeletionError(recoveryToken);
            }
        } else {
            let finalUsername = profile.username;
            const isUsernameTaken =
                await this.userRepository.findByUsername(finalUsername);

            if (isUsernameTaken) {
                const randomSuffix = this.cryptoService.generateRandomHex(2);
                finalUsername = `${finalUsername}_${randomSuffix}`;
            }

            user = await this.userRepository.createWithOAuth({
                email: profile.email,
                username: finalUsername,
                provider: "google",
                providerAccountId: profile.providerAccountId,
                isEmailVerified: true,
            });
        }

        const exchangeCode = this.cryptoService.generateRandomHex(32);
        const payload: OAuthExchangePayload = {
            userId: user.id,
            username: user.username,
            isEmailVerified: user.isEmailVerified,
            delivery: input.delivery,
        };

        await this.cacheService.set(
            `oauth:exchange:${exchangeCode}`,
            JSON.stringify(payload),
            EXCHANGE_CODE_TTL_SECONDS,
        );

        return { exchangeCode };
    }
}
