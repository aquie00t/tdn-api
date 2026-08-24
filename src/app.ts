import Fastify, { type FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import envPlugin from "@plugins/env.plugin";
import jwtPlugin from "@plugins/jwt.plugin";
import cookiePlugin from "@plugins/cookie.plugin";
import rateLimitPlugin from "@plugins/rate-limit.plugin";
import corsPlugin from "@plugins/cors.plugin";
import helmetPlugin from "@plugins/helmet.plugin";
import swaggerPlugin from "@plugins/swagger.plugin";
import errorHandlerPlugin from "@plugins/custom/error-handler.plugin";
import prismaPlugin from "@plugins/custom/prisma.plugin";
import authRoutes from "@routes/auth/auth.routes";
import dependencyInjectionPlugin from "@plugins/dependency-injection.plugin";
import userRoutes from "@routes/auth/user.routes";
import authenticationDecorator from "@decorators/authenticate.decorator";
import optionalAuthenticationDecorator from "@decorators/optional-authenticate.decorator";
import oauthRoutes from "@routes/oauth/oauth.route";
import userPurgePlugin from "@plugins/custom/user-purge.plugin";
import refreshTokenPurgePlugin from "@plugins/custom/refresh-token-purge.plugin";
import multipartPlugin from "@plugins/multipart.plugin";
import profileRoutes from "@routes/profile/profile.routes";
import followRoutes from "@routes/profile/follow.routes";
import websocketPlugin from "./http/plugins/websocket.plugin";
import realtimeRoutes from "@routes/realtime.routes";
import notificationRoutes from "@routes/notification.routes";
import notificationPurgePlugin from "@plugins/custom/notification-purge.plugin";
import { postRoutes } from "@routes/post/post.routes";
import { commentRoutes } from "@routes/post/comment.routes";
import { likeRoutes } from "@routes/post/like.routes";
import { bookmarkRoutes } from "@routes/post/bookmark.routes";
import { tagRoutes } from "@routes/tags.routes";
import { translateRoutes } from "@routes/translate.routes";
import { articleRoutes } from "@routes/article/article.routes";

/**
 * Main Application class responsible for orchestrating the Fastify server lifecycle.
 * It handles plugin registration, decorator injection, and route mounting.
 */
export class App {
    /** @private The underlying Fastify instance */
    private readonly server: FastifyInstance;

    /**
     * Initializes the Fastify instance with environment-aware logging.
     * @constructor
     */
    constructor() {
        const isDevelopment = process.env.NODE_ENV === "development";
        const isTest = process.env.NODE_ENV === "test";

        this.server = Fastify({
            allowErrorHandlerOverride: true,
            logger: isTest
                ? false
                : isDevelopment
                  ? {
                        transport: {
                            target: "pino-pretty",
                            options: {
                                translateTime: "HH:MM:ss Z",
                                ignore: "pid,hostname",
                            },
                        },
                    }
                  : true,
            trustProxy: true,
        }).withTypeProvider<TypeBoxTypeProvider>();
    }

    /**
     * Registers foundational Fastify ecosystem plugins.
     * These include security, session, and environment configurations.
     * @private
     * @async
     */
    private async registerPlugins(): Promise<void> {
        await this.server.register(envPlugin);
        await this.server.after();
        this.server.register(cookiePlugin);
        this.server.register(jwtPlugin);
        this.server.register(rateLimitPlugin);
        this.server.register(corsPlugin);
        this.server.register(helmetPlugin);
        this.server.register(swaggerPlugin);
        this.server.register(multipartPlugin);
        this.server.register(websocketPlugin);
    }

    /**
     * Registers internal custom-built plugins.
     * Handles global error logic, database connectivity, and parge jobs.
     * @private
     */
    private async registerCustomPlugins(): Promise<void> {
        this.server.register(errorHandlerPlugin);
        this.server.register(prismaPlugin);
        this.server.register(dependencyInjectionPlugin);

        await this.server.after();

        this.server.register(refreshTokenPurgePlugin);
        this.server.register(userPurgePlugin);
        this.server.register(notificationPurgePlugin);
    }

    /**
     * Injects custom decorators into the Fastify instance.
     * Typically used for service-layer facades and auth hooks.
     * @private
     */
    private registerDecorators(): void {
        this.server.register(authenticationDecorator);
        this.server.register(optionalAuthenticationDecorator);
    }

    /**
     * Mounts all API routes with versioned prefixes.
     * Organizes the endpoint hierarchy of the application.
     * @private
     */
    private registerRoutes(): void {
        this.server.register(authRoutes, { prefix: "/api/v1/auth" });

        this.server.register(userRoutes, { prefix: "/api/v1/users" });

        this.server.register(oauthRoutes, { prefix: "/api/v1/oauth" });

        this.server.register(profileRoutes, { prefix: "/api/v1/profiles" });

        this.server.register(followRoutes, { prefix: "/api/v1" });

        this.server.register(realtimeRoutes, { prefix: "/api/v1/realtime" });

        this.server.register(notificationRoutes, {
            prefix: "/api/v1",
        });

        this.server.register(postRoutes, {
            prefix: "/api/v1",
        });

        this.server.register(commentRoutes, {
            prefix: "/api/v1",
        });

        this.server.register(likeRoutes, {
            prefix: "/api/v1/posts/:id",
        });

        this.server.register(bookmarkRoutes, {
            prefix: "/api/v1/posts",
        });

        this.server.register(tagRoutes, {
            prefix: "/api/v1/tags",
        });

        this.server.register(translateRoutes, {
            prefix: "/api/v1",
        });

        this.server.register(articleRoutes, {
            prefix: "/api/v1",
        });
    }

    /**
     * Bootstraps the application components without starting the network listener.
     * Ideal for E2E testing using server.inject().
     * @public
     * @async
     * @returns {Promise<FastifyInstance>} The fully initialized Fastify instance.
     */
    public async init(): Promise<FastifyInstance> {
        await this.registerPlugins();
        await this.registerCustomPlugins();
        this.registerDecorators();
        this.registerRoutes();

        await this.server.ready();
        return this.server;
    }

    /**
     * Starts the HTTP server and begins listening for incoming requests.
     * Orchestrates the full bootstrap process and binds to the configured port.
     * @public
     * @async
     * @returns {Promise<void>}
     */
    public async start(): Promise<void> {
        try {
            await this.init();
            await this.server.listen({
                port: this.server.config.PORT,
                host: "0.0.0.0",
            });
            this.server.log.info(
                `Server listening on port ${this.server.config.PORT}`,
            );
        } catch (err) {
            this.server.log.error(err);
            process.exit(1);
        }
    }
    public async close(): Promise<void> {
        await this.server.close();
    }
    /**
     * Getter for the Fastify instance.
     * Useful for accessing the server's internal state or configuration.
     * @public
     * @returns {FastifyInstance}
     */
    public get instance(): FastifyInstance {
        return this.server;
    }
}
