-- The daily digest: one email a morning to anyone with something waiting.
--
-- Three pieces:
--
--   1. users."digestOptOutAt" - the unsubscribe flag. Like the other lifecycle
--      timestamps on this table it records *when*, and the column name is
--      camelCase like its neighbours.
--
--   2. digest_deliveries - one row per user per day, written before the email
--      is sent. The unique constraint is the whole of the multi-instance
--      guard: the loser of a race between two API instances gets a uniqueness
--      violation and skips that user rather than sending a second copy.
--
--   3. Two indexes the digest run cannot do without. The audience sweep visits
--      every user once a day, and the unread lookup runs once per recipient.

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN "digestOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."digest_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "digest_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digest_deliveries_user_id_digest_on_key" ON "public"."digest_deliveries"("user_id", "digest_on");

-- CreateIndex
CREATE INDEX "digest_deliveries_user_id_created_at_idx" ON "public"."digest_deliveries"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."digest_deliveries" ADD CONSTRAINT "digest_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial index for the audience sweep. Prisma cannot express a WHERE clause
-- on an index, so this one is hand-written and lives only here: without it,
-- selecting the eligible users is a sequential scan of the whole table every
-- morning.
CREATE INDEX "users_digest_audience_idx" ON "public"."users" ("id")
WHERE "deletedAt" IS NULL
  AND "bannedAt" IS NULL
  AND "digestOptOutAt" IS NULL
  AND "isBot" = false
  AND "isEmailVerified" = true;

-- The digest asks each recipient for their unread notifications since a date.
-- recipientId and createdAt are indexed separately today and isRead not at
-- all, which makes that query read every notification the user ever received.
CREATE INDEX "notifications_recipient_unread_idx"
  ON "public"."notifications" ("recipientId", "isRead", "createdAt" DESC);
