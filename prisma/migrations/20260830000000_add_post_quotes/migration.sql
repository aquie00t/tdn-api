-- Quote posts: a post can now embed another post, the way a quote tweet does.
--
-- The foreign key is self-referential and cascades. Deleting a post therefore
-- deletes every post that quotes it, and recursively the quotes of those,
-- which is what keeps a quote card from ever pointing at content that is gone.
-- The trade-off is deliberate: ON DELETE SET NULL would leave the quotes
-- standing with an empty card, and would need a second column to tell "never
-- quoted anything" apart from "quoted something that was deleted".
--
-- Adding a nullable column is metadata-only in Postgres, so no table rewrite
-- happens here. The index is not concurrent because Prisma runs migrations
-- inside a transaction; if posts ever grows large enough for that to matter,
-- it should move to a separate manual step.

-- AlterTable
ALTER TABLE "public"."posts" ADD COLUMN     "quoted_post_id" TEXT;

-- CreateIndex
CREATE INDEX "posts_quoted_post_id_idx" ON "public"."posts"("quoted_post_id");

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_quoted_post_id_fkey" FOREIGN KEY ("quoted_post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
