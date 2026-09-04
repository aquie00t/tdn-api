-- Naming an account with @handle in a body now records a relation to it.
--
-- Three implicit many-to-many join tables, one per content type, following the
-- shape Prisma generates for a relation with no explicit model: "A" is the
-- content row and "B" is the user, ordered by model name. The relation stores
-- ids rather than the handle that was typed, so renaming an account keeps
-- every historical mention pointing at it.
--
-- Both sides cascade: a deleted post takes its mentions with it, and so does a
-- purged user.

-- CreateTable
CREATE TABLE "public"."_PostMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PostMentions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_CommentMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CommentMentions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_ArticleMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArticleMentions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PostMentions_B_index" ON "public"."_PostMentions"("B" ASC);

-- CreateIndex
CREATE INDEX "_CommentMentions_B_index" ON "public"."_CommentMentions"("B" ASC);

-- CreateIndex
CREATE INDEX "_ArticleMentions_B_index" ON "public"."_ArticleMentions"("B" ASC);

-- AddForeignKey
ALTER TABLE "public"."_PostMentions" ADD CONSTRAINT "_PostMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PostMentions" ADD CONSTRAINT "_PostMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_CommentMentions" ADD CONSTRAINT "_CommentMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_CommentMentions" ADD CONSTRAINT "_CommentMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ArticleMentions" ADD CONSTRAINT "_ArticleMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ArticleMentions" ADD CONSTRAINT "_ArticleMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
