-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "articleId" TEXT,
ADD COLUMN     "commentId" TEXT,
ADD COLUMN     "postId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_postId_idx" ON "public"."notifications"("postId" ASC);

-- CreateIndex
CREATE INDEX "notifications_articleId_idx" ON "public"."notifications"("articleId" ASC);

-- CreateIndex
CREATE INDEX "notifications_commentId_idx" ON "public"."notifications"("commentId" ASC);

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
