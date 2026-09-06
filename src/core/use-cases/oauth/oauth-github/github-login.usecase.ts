import type { GithubLoginInput } from "./github-login.input";
import { UnauthorizedError } from "@core/errors";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import { AccountBannedError, AccountPendingDeletionError } from "@core/errors";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { CachePort } from "@core/ports/services/cache.port";
import type { OAuthExchangePayload } from "../oauth-exchange/oauth-exchange.usecase";

const EXCHANGE_CODE_TTL_SECONDS = 60;

export class GithubLoginUseCase {
    constructor(
        private readonly githubAuthService: GithubAuthPort,
        private readonly userRepository: IUserRepository,
        private readonly authTokenService: AuthTokenPort,
        private readonly cryptoService: CryptoPort,
        private readonly cacheService: CachePort,
    ) {}

    async execute(input: GithubLoginInput): Promise<{ exchangeCode: string }> {
        const profile = await this.githubAuthService.getUserProfileByCode(
            input.code,
        );

        // Refused before the account is even looked up. This flow matches an
        // existing account by email alone, so an address the provider has not
        // verified is a way to walk into somebody else's account by claiming
        // to own their mailbox - sign up at the provider with their address,
        // authorise, and be handed their session.
        if (!profile.isEmailVerified) {
            throw new UnauthorizedError(
                "GitHub has not verified this email address.",
            );
        }

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
                provider: "github",
                providerAccountId: profile.providerAccountId,
                isEmailVerified: profile.isEmailVerified,
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
