import { OAuthProviderError } from "@core/errors";
import type {
    GithubAuthPort,
    GithubProfile,
} from "@core/ports/services/github-auth.port";
import axios from "axios";

export interface GithubAuthConfig {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
}

interface GithubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
}

export class GithubAuthService implements GithubAuthPort {
    constructor(private readonly config: GithubAuthConfig) {}

    private sanitizeUsername(username: string): string {
        const maxLen = 30;
        const s = String(username ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
        return s.slice(0, maxLen).replace(/_+$/g, "");
    }

    getAuthorizationUrl(state: string): string {
        const rootUrl = "https://github.com/login/oauth/authorize";

        const options = {
            client_id: this.config.clientId,
            redirect_uri: this.config.callbackUrl,
            scope: "user:email",
            state,
        };

        const qs = new URLSearchParams(options);
        return `${rootUrl}?${qs.toString()}`;
    }

    async getUserProfileByCode(code: string): Promise<GithubProfile> {
        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.callbackUrl,
            },
            { headers: { Accept: "application/json" } },
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new OAuthProviderError("Github profile fetch failed.");
        }

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const githubUser = userResponse.data;

        const { data: emails } = await axios.get<GithubEmail[]>(
            "https://api.github.com/user/emails",
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );

        const primaryEmail = emails.find((email) => email.primary);

        if (!primaryEmail) {
            throw new OAuthProviderError(
                "No primary email found on GitHub account.",
            );
        }

        return {
            providerAccountId: githubUser.id.toString(),
            username: this.sanitizeUsername(githubUser.login),
            email: primaryEmail.email,
            isEmailVerified: primaryEmail.verified,
        };
    }
}
