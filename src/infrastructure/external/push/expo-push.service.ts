import type {
    PushMessage,
    PushPort,
    PushSendResult,
} from "@core/ports/services/push.port";
import type { FastifyBaseLogger } from "fastify";
import axios from "axios";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Most messages Expo accepts in one request.
 */
const CHUNK_SIZE = 100;

/**
 * The ticket status Expo returns for a token that no longer exists.
 *
 * Anything else - a malformed message, a provider hiccup - is a problem with
 * this send. This one is a problem with the token, and the only fix is to stop
 * holding it.
 */
const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

interface ExpoTicket {
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: { error?: string };
}

export interface ExpoPushConfig {
    /**
     * Access token for a project with push security enabled.
     *
     * Optional: Expo accepts unauthenticated sends for projects that have not
     * turned that on, which is the state of a project nobody has configured
     * yet. Sending it when it exists costs nothing and is what stops anybody
     * who learns a token from notifying its owner.
     */
    accessToken: string;
}

/**
 * Expo implementation of the push port.
 *
 * Expo rather than FCM directly: it owns the FCM credentials, and the APNs
 * ones when iOS arrives, which is a meaningful amount of key handling this
 * service then never does. The port is what keeps that reversible - a direct
 * FCM adapter is a sibling of this file, not a rewrite.
 */
export class ExpoPushService implements PushPort {
    /**
     * @param config - Expo credentials
     * @param logger - Where delivery failures are recorded
     */
    constructor(
        private readonly config: ExpoPushConfig,
        private readonly logger: FastifyBaseLogger,
    ) {}

    /**
     * Sends notifications, in batches Expo will accept.
     *
     * Never throws. The caller is a fire-and-forget path behind a notification
     * that is already stored and already on the socket; a provider being down
     * is a buzz nobody gets, not a request anybody should see fail.
     *
     * @param messages - The notifications to deliver.
     * @returns How many were accepted, and which tokens are dead.
     */
    async send(messages: PushMessage[]): Promise<PushSendResult> {
        const result: PushSendResult = { delivered: 0, invalidTokens: [] };

        for (let start = 0; start < messages.length; start += CHUNK_SIZE) {
            const chunk = messages.slice(start, start + CHUNK_SIZE);

            await this.sendChunk(chunk, result);
        }

        return result;
    }

    /**
     * Hands one batch to Expo and folds the answer into the result.
     *
     * Tickets come back positionally, which is the only thing tying a rejected
     * token to the message that carried it - Expo does not echo the token.
     *
     * @param chunk - The messages in this batch
     * @param result - The accumulating result
     */
    private async sendChunk(
        chunk: PushMessage[],
        result: PushSendResult,
    ): Promise<void> {
        try {
            const response = await axios.post<{ data?: ExpoTicket[] }>(
                EXPO_PUSH_URL,
                chunk,
                {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        ...(this.config.accessToken
                            ? {
                                  Authorization: `Bearer ${this.config.accessToken}`,
                              }
                            : {}),
                    },
                },
            );

            const tickets = response.data?.data ?? [];

            tickets.forEach((ticket, index) => {
                if (ticket.status === "ok") {
                    result.delivered++;
                    return;
                }

                if (ticket.details?.error === DEVICE_NOT_REGISTERED) {
                    const message = chunk[index];
                    if (message) result.invalidTokens.push(message.to);
                    return;
                }

                this.logger.warn(
                    { error: ticket.message, detail: ticket.details?.error },
                    "Expo refused a push notification",
                );
            });
        } catch (error: unknown) {
            this.logger.error(
                { err: error, count: chunk.length },
                "Failed to hand a push batch to Expo",
            );
        }
    }
}

/**
 * A push service that does nothing, for environments with no project.
 *
 * The counterpart of `NoopModerationService`: tests and local development have
 * no Expo project and no phones, and a stack of failed HTTP calls in the log
 * teaches nobody anything. It is never a fallback for a provider that is down -
 * that case is handled above, by not throwing.
 */
export class NoopPushService implements PushPort {
    /**
     * Reports everything as delivered, having sent nothing.
     *
     * @param messages - The notifications that would have been sent.
     * @returns A clean result with no dead tokens.
     */
    send(messages: PushMessage[]): Promise<PushSendResult> {
        return Promise.resolve({
            delivered: messages.length,
            invalidTokens: [],
        });
    }
}
