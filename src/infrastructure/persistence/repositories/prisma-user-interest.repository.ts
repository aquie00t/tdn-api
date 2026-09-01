import type {
    IUserInterestRepository,
    UserIdPage,
} from "@core/ports/repositories/user-interest.repository";
import {
    InteractionType,
    type InterestKind,
    type InteractionSignal,
    type UserInterest,
} from "@core/domain/interfaces/user-interest.interface";
import type { PrismaClient } from "@generated/prisma/client";

/**
 * The post columns and relations an interaction signal is built from.
 */
const SIGNAL_POST_SELECT = {
    select: {
        category: true,
        tags: { select: { name: true } },
    },
} as const;

/**
 * Prisma implementation of the user interest repository.
 *
 * Provides the reads the nightly interest job aggregates over and the write it
 * stores its result with.
 */
export class PrismaUserInterestRepository implements IUserInterestRepository {
    /**
     * Constructor for PrismaUserInterestRepository
     *
     * Takes the root client rather than the transactional union the other
     * repositories accept, because {@link replaceForUser} opens a transaction
     * of its own. Prisma types `$transaction` onto the interactive transaction
     * client but rejects a nested call at runtime, so the narrower type is
     * what stops this being wired into a `TransactionContext` by mistake.
     *
     * @param prisma - The Prisma client for database access
     */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Retrieves a user's stored interest profile.
     *
     * @param userId - The user whose profile to read.
     * @returns Their interests; empty when the job has never run for them.
     */
    async findByUserId(userId: string): Promise<UserInterest[]> {
        const rows = await this.prisma.userInterest.findMany({
            where: { userId },
            select: { kind: true, key: true, weight: true },
        });

        return rows.map((row) => ({
            kind: row.kind as InterestKind,
            key: row.key,
            weight: row.weight,
        }));
    }

    /**
     * Lists users who have interacted with anything since a given time.
     *
     * Expressed as one query over the user table with `some` filters rather
     * than a union of four interaction queries: the alternative reads every
     * matching like, bookmark, comment and post row only to reduce them to a
     * distinct set of ids, which on an active platform is orders of magnitude
     * more rows than there are users.
     *
     * @param since - Only users active at or after this time.
     * @param limit - Page size.
     * @param after - Resume after this user id.
     * @returns A page of user ids in ascending id order.
     */
    async findActiveUserIds(
        since: Date,
        limit: number,
        after?: string,
    ): Promise<UserIdPage> {
        const window = { createdAt: { gte: since } };

        const rows = await this.prisma.user.findMany({
            where: {
                // A deleted user is in their grace period and may still come
                // back, but nothing reads their feed meanwhile.
                deletedAt: null,
                OR: [
                    { postLikes: { some: window } },
                    { postBookmarks: { some: window } },
                    { comments: { some: window } },
                    { posts: { some: window } },
                ],
            },
            select: { id: true },
            orderBy: { id: "asc" },
            take: limit,
            ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        });

        const userIds = rows.map((row) => row.id);

        return {
            userIds,
            // A short page is the last one. Handing back a cursor there would
            // cost the job one more empty round trip per run.
            nextCursor:
                userIds.length === limit
                    ? (userIds[userIds.length - 1] ?? null)
                    : null,
        };
    }

    /**
     * Retrieves the interactions a user's profile should be built from.
     *
     * Four reads rather than one union, because each interaction lives in its
     * own table and reaches its post by a different relation. They run
     * concurrently and each is bounded by `limit`, so the job's cost per user
     * stays flat no matter how prolific the account is.
     *
     * @param userId - The user whose interactions to read.
     * @param since - How far back to look.
     * @param limit - Hard cap per interaction type, newest first.
     * @returns What the user did, with the tags and categories of each post.
     */
    async findInteractionSignals(
        userId: string,
        since: Date,
        limit: number,
    ): Promise<InteractionSignal[]> {
        const window = { userId, createdAt: { gte: since } };
        const page = { orderBy: { createdAt: "desc" as const }, take: limit };

        const [likes, bookmarks, comments, posts] = await Promise.all([
            this.prisma.postLike.findMany({
                where: window,
                select: { createdAt: true, post: SIGNAL_POST_SELECT },
                ...page,
            }),
            this.prisma.postBookmark.findMany({
                where: window,
                select: { createdAt: true, post: SIGNAL_POST_SELECT },
                ...page,
            }),
            this.prisma.comment.findMany({
                // A comment on an article has no post to read tags from; the
                // profile simply does not learn from it.
                where: { authorId: userId, createdAt: { gte: since } },
                select: { createdAt: true, post: SIGNAL_POST_SELECT },
                ...page,
            }),
            this.prisma.post.findMany({
                where: { authorId: userId, createdAt: { gte: since } },
                select: {
                    createdAt: true,
                    category: true,
                    tags: { select: { name: true } },
                },
                ...page,
            }),
        ]);

        return [
            ...likes.map((like) =>
                this.toSignal(InteractionType.LIKED, like.createdAt, like.post),
            ),
            ...bookmarks.map((bookmark) =>
                this.toSignal(
                    InteractionType.BOOKMARKED,
                    bookmark.createdAt,
                    bookmark.post,
                ),
            ),
            ...comments.map((comment) =>
                this.toSignal(
                    InteractionType.COMMENTED,
                    comment.createdAt,
                    comment.post,
                ),
            ),
            ...posts.map((post) =>
                this.toSignal(InteractionType.AUTHORED, post.createdAt, post),
            ),
        ];
    }

    /**
     * Replaces a user's whole interest profile in one transaction.
     *
     * @param userId - The user whose profile to replace.
     * @param interests - The new profile; an empty array clears it.
     */
    async replaceForUser(
        userId: string,
        interests: UserInterest[],
    ): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.userInterest.deleteMany({ where: { userId } }),
            ...(interests.length > 0
                ? [
                      this.prisma.userInterest.createMany({
                          data: interests.map((interest) => ({
                              userId,
                              kind: interest.kind,
                              key: interest.key,
                              weight: interest.weight,
                          })),
                      }),
                  ]
                : []),
        ]);
    }

    /**
     * Shapes one interaction row into a scoring signal.
     *
     * @param type - How the user engaged.
     * @param occurredAt - When they did.
     * @param post - The post they engaged with, or null when there is none.
     * @returns The signal, with empty labels when the post is missing.
     */
    private toSignal(
        type: InteractionType,
        occurredAt: Date,
        post: { category: string[]; tags: { name: string }[] } | null,
    ): InteractionSignal {
        return {
            type,
            occurredAt,
            tags: post?.tags.map((tag) => tag.name) ?? [],
            categories: post?.category ?? [],
        };
    }
}
