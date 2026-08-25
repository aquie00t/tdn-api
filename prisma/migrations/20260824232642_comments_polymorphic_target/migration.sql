-- Comments can now hang off either a post or an article.
--
-- Both columns are nullable so Prisma can model the two optional relations,
-- which on its own would allow a comment attached to nothing, or to both.
-- The CHECK below is what actually holds the invariant; Prisma cannot express
-- one, so it is written by hand and covered by an integration test that will
-- fail if a future migrate dev regenerates the table without it.
--
-- DROP NOT NULL and adding a nullable column are metadata-only in Postgres,
-- so no table rewrite happens here. The two indexes are not concurrent because
-- Prisma runs migrations inside a transaction; if comments ever grows large
-- enough for that to matter, they should move to a separate manual step.

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "article_id" TEXT,
ALTER COLUMN "post_id" DROP NOT NULL;
-- CreateIndex
CREATE INDEX "comments_article_id_idx" ON "comments"("article_id");
-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");
-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one target, enforced in the database rather than only in code.
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_target_xor"
  CHECK (num_nonnulls("post_id", "article_id") = 1);
