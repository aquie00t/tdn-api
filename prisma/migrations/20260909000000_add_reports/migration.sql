-- Users can report a post or a comment.
--
-- "target_id" is deliberately not a foreign key, and the reported text is
-- copied onto the row rather than read through a relation. Both are the same
-- decision: the obvious way for a reported account to make a report go away is
-- to delete what was reported, and a cascade would let them. The snapshot is
-- what an operator actually reads, so it has to outlive its subject.
--
-- The unique index over (reporter, kind, target) makes one person's report of
-- one thing idempotent, which is also what makes the escalation threshold
-- meaningful: the alert counts rows, so it counts distinct people by
-- construction.
--
-- Both user columns cascade. A purged account takes the reports it filed and
-- the reports filed against it with it, the same way blocks and mentions go.
--
-- "report_digest_deliveries" is the daily summary's claim, and carries no user
-- column because the summary goes to one operator address: one row per day is
-- the whole space. The unique constraint is what coordinates several instances
-- running the same schedule, exactly as "digest_deliveries" does per user.

-- CreateEnum
CREATE TYPE "public"."ReportTargetKind" AS ENUM ('POST', 'COMMENT');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL', 'VIOLENCE', 'SELF_HARM', 'MISINFORMATION', 'ILLEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "public"."reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_kind" "public"."ReportTargetKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_parent_id" TEXT,
    "target_author_id" TEXT NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "details" TEXT,
    "content_snapshot" TEXT NOT NULL,
    "media_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_digest_deliveries" (
    "id" TEXT NOT NULL,
    "digest_on" DATE NOT NULL,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_digest_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "public"."reports" ("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_kind_target_id_idx" ON "public"."reports" ("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "reports_target_author_id_idx" ON "public"."reports" ("target_author_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_target_kind_target_id_key" ON "public"."reports" ("reporter_id", "target_kind", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_digest_deliveries_digest_on_key" ON "public"."report_digest_deliveries" ("digest_on");

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_target_author_id_fkey" FOREIGN KEY ("target_author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
