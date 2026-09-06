import axios from "axios";
import { OAuthProviderError } from "@core/errors";

import type {
    GoogleAuthPort,
    GoogleProfile,
} from "@core/ports/services/google-auth.port";

export interface GoogleAuthConfig {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
}

export class GoogleAuthService implements GoogleAuthPort {
    constructor(private readonly config: GoogleAuthConfig) {}

    getAuthorizationUrl(state: string): string {
        const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
        const options = {
            state,
            redirect_uri: this.config.callbackUrl,
            client_id: this.config.clientId,
            access_type: "offline",
            response_type: "code",
            prompt: "consent",
            scope: [
                "https://www.googleapis.com/auth/userinfo.profile",
                "https://www.googleapis.com/auth/userinfo.email",
            ].join(" "),
        };

        const qs = new URLSearchParams(options);
        return `${rootUrl}?${qs.toString()}`;
    }

    async getUserProfileByCode(code: string): Promise<GoogleProfile> {
        const tokenUrl = "https://oauth2.googleapis.com/token";

        const tokenData = await axios
            .post(
                tokenUrl,
                new URLSearchParams({
                    code,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    redirect_uri: this.config.callbackUrl,
                    grant_type: "authorization_code",
                }).toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                },
            )
            .then((res) => res.data)
            .catch((err) => {
                const error = err.response?.data ?? err.message;
                throw new OAuthProviderError(
                    `Google token exchange failed: ${JSON.stringify(error)}`,
                );
            });

        const accessToken = tokenData.access_token;

        const userUrl = "https://www.googleapis.com/oauth2/v2/userinfo";

        const googleUser = await axios
            .get(userUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })
            .then((res) => res.data)
            .catch(() => {
                throw new OAuthProviderError(
                    "Failed to fetch Google user profile",
                );
            });

        // `verified_email` comes from the userinfo endpoint; treat anything
        // that is not an explicit true as unverified.
        const isEmailVerified = googleUser.verified_email === true;

        const derivedUsername = googleUser.email
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "");

        return {
            email: googleUser.email,
            username: derivedUsername,
            providerAccountId: googleUser.id,
            isEmailVerified,
        };
    }
}
