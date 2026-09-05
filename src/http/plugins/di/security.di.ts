import { asClass, asFunction } from "awilix";
import { PasswordService } from "@infrastructure/security/password.service";
import { AuthTokenService } from "@infrastructure/security/auth-token.service";
import { CryptoService } from "@infrastructure/security/crypto.service";
import { TransactionService } from "@infrastructure/persistence/database/transaction.service";
import { AesGcmEncryptionService } from "@infrastructure/security/aes-gcm-encryption.service";

export const securityModule = {
    // --- Services ---
    transactionService: asClass(TransactionService).singleton(),
    passwordService: asClass(PasswordService).singleton(),
    cryptoService: asClass(CryptoService).singleton(),
    // asFunction because the only dependency is a config value. Resolved as a
    // singleton, so a bad key throws once, while the container is being built,
    // rather than on the first message somebody sends.
    messageEncryptionService: asFunction((config) => {
        return new AesGcmEncryptionService(config.MESSAGE_ENCRYPTION_KEY);
    }).singleton(),
    authTokenService: asFunction((jwt, config) => {
        return new AuthTokenService(
            jwt,
            config.ACCESS_TOKEN_EXPIRES_IN,
            config.REFRESH_TOKEN_EXPIRES_IN,
        );
    }).singleton(),
};
