import { type IPostRepository } from "@core/ports/repositories/post.repository";
import type { CreatePostInput } from "./create-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";
import { Post } from "@core/domain/entities/post.entity";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import { PostType } from "@core/domain/enums";
import { ForbiddenError } from "@core/errors/common/forbidden.error";
import { NotFoundError } from "@core/errors/common/not-found.error";

/**
 * Use case for creating a new post.
 *
 * This use case handles the process of creating a post with optional media
 * and invalidating related cache entries.
 */
export class CreatePostUseCase {
    /**
     * Creates a new instance of CreatePostUseCase.
     *
     * @param postRepository - Repository for managing post data
     * @param cacheService - Service for cache operations
     * @param userRepository - Repository for managing user data
     * @param notifyNewPostUseCase - Use case that fans the post out to followers
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly cacheService: CachePort,
        private readonly userRepository: IUserRepository,
        private readonly notifyNewPostUseCase: NotifyNewPostUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the post creation process.
     *
     * @param input - Input containing post content, type, author ID, media URLs
     * and the optional id of the post being quoted
     * @returns Promise<void> - Resolves when post creation is complete
     *
     * @throws NotFoundError - When quotedPostId names a post that does not exist
     *
     * @remarks
     * This method creates a new post entity, saves it to the database,
     * and clears any cached feed data to ensure consistency.
     *
     * A quoted post is resolved before the write so a quote can never be
     * stored against an id that is already gone. The foreign key would reject
     * it too, but a 404 says what happened and a constraint violation does not.
     *
     * Followers are notified after the post is committed, deliberately
     * outside the caller's critical path: the post is the thing worth keeping,
     * so a fan-out failure is logged rather than allowed to fail the request.
     */
    async execute(input: CreatePostInput): Promise<Post> {
        if ([PostType.SYSTEM_UPDATE, PostType.TECH_NEWS].includes(input.type)) {
            const author = await this.userRepository.findById(input.authorId);
            if (!author) throw new NotFoundError("User not found.");
            if (!author.canCreatePostType(input.type)) {
                throw new ForbiddenError(
                    "Only bot accounts can create this post type.",
                );
            }
        }

        if (input.quotedPostId) {
            const quoted = await this.postRepository.findById(
                input.quotedPostId,
            );
            if (!quoted) throw new NotFoundError("Quoted post not found.");
        }

        const post = Post.create(
            input.content,
            input.type,
            input.authorId,
            input.mediaUrls || [],
            input.categories || [],
            input.quotedPostId,
        );

        const rawPost = await this.postRepository.create(post);
        await this.cacheService.deleteByPattern("posts:feed:*");

        void this.notifyNewPostUseCase
            .execute({
                postId: rawPost.id,
                authorId: input.authorId,
                postType: input.type,
            })
            .catch((err: unknown) => {
                this.logger.error(
                    { err, postId: rawPost.id },
                    "Failed to notify followers of a new post",
                );
            });

        return rawPost;
    }
}
