-- Materialised interest profiles for feed ranking.
--
-- The feed's affinity term needs to know, cheaply, what a user cares about.
-- Deriving that per request means walking their likes, bookmarks, comments and
-- posts across a multi-week window and joining every one of those to tags -
-- far too much work to do while a feed request waits. A cron job writes the
-- answer here instead, and the feed reads one indexed row set per viewer.
--
-- Rows are disposable. The job rebuilds a user's whole set in one transaction,
-- and a user with no rows is ranked without the affinity term rather than
-- being treated as interested in nothing.

-- CreateEnum
CREATE TYPE "public"."InterestKind" AS ENUM ('TAG', 'CATEGORY');

-- CreateTable
CREATE TABLE "public"."user_interests" (
    "user_id" TEXT NOT NULL,
    "kind" "public"."InterestKind" NOT NULL,
    "key" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    -- The natural key is the whole row identity: a user has exactly one weight
    -- per (kind, key), and the job's delete-then-insert relies on that.
    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id", "kind", "key")
);

-- The primary key already leads with user_id, so lookups by user are covered.
-- This index exists for the job's delete of a user's whole set, which the
-- planner otherwise resolves against the composite key.
-- CreateIndex
CREATE INDEX "user_interests_user_id_idx" ON "public"."user_interests" ("user_id");

-- Interests are derived data about a person. When the account goes, so do
-- they - there is nothing to keep and nothing to recover them for.
-- AddForeignKey
ALTER TABLE "public"."user_interests"
    ADD CONSTRAINT "user_interests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
