import type { BlockUserUseCase } from "@core/use-cases/block-user/block-user";
import type { UnblockUserUseCase } from "@core/use-cases/block-user/unblock-user";
import type { ListBlockedUseCase } from "@core/use-cases/block-user/list-blocked";
import type {
    BlockedListQuery,
    BlockUserBody,
} from "@typings/schemas/block/block.schema";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Controller for the block endpoints.
 */
export class BlockController {
    /**
     * Creates a new BlockController instance.
     *
     * @param blockUserUseCase - Use case that writes a block
     * @param unblockUserUseCase - Use case that lifts one
     * @param listBlockedUseCase - Use case that reads the caller's block list
     */
    constructor(
        private readonly blockUserUseCase: BlockUserUseCase,
        private readonly unblockUserUseCase: UnblockUserUseCase,
        private readonly listBlockedUseCase: ListBlockedUseCase,
    ) {}

    /**
     * Blocks a user.
     *
     * @param request - The request, carrying the target in its body
     * @param reply - The reply to send
     */
    async block(
        request: FastifyRequest<{ Body: BlockUserBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { targetId } = request.body;
        const currentUserId = request.user!.id;

        const { isBlocked } = await this.blockUserUseCase.execute({
            currentUserId,
            targetId,
        });

        reply.status(200).send({
            data: { isBlocked },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Lifts a block.
     *
     * @param request - The request, carrying the target in its body
     * @param reply - The reply to send
     */
    async unblock(
        request: FastifyRequest<{ Body: BlockUserBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { targetId } = request.body;
        const currentUserId = request.user!.id;

        const { isBlocked } = await this.unblockUserUseCase.execute({
            currentUserId,
            targetId,
        });

        reply.status(200).send({
            data: { isBlocked },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Lists the accounts the caller has blocked.
     *
     * @param request - The request, carrying the page in its query string
     * @param reply - The reply to send
     */
    async list(
        request: FastifyRequest<{ Querystring: BlockedListQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { limit, offset } = request.query;
        const currentUserId = request.user!.id;

        const { users, total } = await this.listBlockedUseCase.execute({
            currentUserId,
            limit,
            offset,
        });

        reply.status(200).send({
            data: users,
            meta: { limit, offset, count: users.length, total },
        });
    }
}
