import type { ICommentBookmarkRepository } from "@core/ports/repositories/comment-bookmark.repository";
import type { Comment } from "@core/domain/entities/comment.entity";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import {
    CommentPrismaMapper,
    type CommentWithRelations,
} from "../mappers/comment-prisma.mapper";

export class PrismaCommentBookmarkRepository implements ICommentBookmarkRepository {
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    async save(commentId: string, userId: string): Promise<void> {
        await this.prisma.commentBookmark.create({
            data: { commentId, userId },
        });
    }

    async remove(commentId: string, userId: string): Promise<void> {
        await this.prisma.commentBookmark.delete({
            where: { commentId_userId: { commentId, userId } },
        });
    }

    async isBookmarked(commentId: string, userId: string): Promise<boolean> {
        const bookmark = await this.prisma.commentBookmark.findUnique({
            where: { commentId_userId: { commentId, userId } },
        });
        return !!bookmark;
    }

    async findBookmarkedByUserId(
        userId: string,
        limit: number,
        offset: number,
    ): Promise<{ comments: Comment[]; total: number }> {
        const [bookmarks, total] = await Promise.all([
            this.prisma.commentBookmark.findMany({
                where: { userId },
                skip: offset,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    comment: {
                        include: {
                            author: {
                                select: {
                                    id: true,
                                    username: true,
                                    verifiedUntil: true,
                                    profile: {
                                        select: {
                                            avatarUrl: true,
                                            fullName: true,
                                        },
                                    },
                                },
                            },
                            likes: { where: { userId } },
                            bookmarks: { where: { userId } },
                            _count: { select: { replies: true } },
                        },
                    },
                },
            }),
            this.prisma.commentBookmark.count({ where: { userId } }),
        ]);

        const comments = bookmarks.map((b) =>
            CommentPrismaMapper.toDomainComment(
                b.comment as unknown as CommentWithRelations,
            ),
        );

        return { comments, total };
    }
}
