-- Language-aware feed ranking.
--
-- `posts.lang` is the language the content was written in, detected on write.
-- It stays nullable on purpose: a link-only or emoji-only post gives the
-- detector nothing to work with, and a post whose language is unknown is
-- ranked as language-neutral rather than being dropped out of every feed.
-- Existing rows are backfilled out of band by scripts/backfill-post-lang.ts,
-- which can afford the batching this migration cannot.
--
-- Adding a nullable column with no default is metadata-only in Postgres, so
-- neither table is rewritten here.

-- AlterTable
ALTER TABLE "public"."posts" ADD COLUMN "lang" VARCHAR(5);

-- The feed pulls its candidates as "recent posts in these languages", so the
-- index leads with lang and orders by created_at inside it.
-- CreateIndex
CREATE INDEX "posts_lang_created_at_idx" ON "public"."posts" ("lang", "created_at");

-- AlterTable
-- The languages a user wants their feed in, most preferred first. Empty means
-- the user never chose, which is not the same as wanting no language: the feed
-- falls back to the request's Accept-Language, and to the platform default
-- after that. That is why this defaults to an empty array and not to '{tr}'.
ALTER TABLE "public"."profiles" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
