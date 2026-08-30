-- How many times a post has been quoted, denormalised the way likeCount and
-- commentCount already are: the read path is far hotter than the write path,
-- and counting the quotes relation per row would put a subquery on every feed
-- item.
--
-- Adding a NOT NULL column with a constant default is metadata-only in
-- Postgres 11+, so no table rewrite happens here.

-- AlterTable
ALTER TABLE "public"."posts" ADD COLUMN     "quoteCount" INTEGER NOT NULL DEFAULT 0;

-- Defensive backfill. The quote column and this counter ship in the same
-- deploy, so no quote can predate the counter - but a deploy that landed
-- between the two migrations would leave the counter silently at zero with
-- quotes already in the table. Touches only rows that are actually quoted.
UPDATE "public"."posts" p
SET "quoteCount" = sub.c
FROM (
    SELECT "quoted_post_id" AS id, COUNT(*) AS c
    FROM "public"."posts"
    WHERE "quoted_post_id" IS NOT NULL
    GROUP BY 1
) sub
WHERE p.id = sub.id;
