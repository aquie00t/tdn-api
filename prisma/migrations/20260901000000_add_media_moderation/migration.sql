-- Automated moderation for every uploaded image and video.
--
-- Two things happen here. `media_assets` records one row per stored file:
-- who uploaded it, through which endpoint, and what the moderation provider
-- said about it. Posts, comments and articles gain the two denormalised
-- columns the read path needs so it can withhold media without joining.
--
-- The asset table is what makes an uploaded key trustworthy. Scanning at
-- upload time only governs what the upload endpoint writes to storage;
-- nothing stops a client from skipping that endpoint and putting its own URL
-- straight into a post body. Content creation now resolves every submitted
-- URL back to a row here and refuses it unless this uploader owns it and
-- moderation did not reject it.
--
-- Adding columns with a constant default is metadata-only in Postgres 11+, so
-- no table is rewritten. Existing rows become `APPROVED` and not sensitive,
-- which is the correct reading of them: they predate the pipeline, carry no
-- assets, and must not disappear from feeds because of it. Backfilling them
-- for a retroactive scan is a separate, out-of-band job.

-- CreateEnum
CREATE TYPE "public"."MediaModerationStatus" AS ENUM ('PENDING', 'SCANNING', 'APPROVED', 'SENSITIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- The upload endpoint a file came through, fixed when the bytes arrive. Posts
-- and comments share one endpoint, which is why POST_MEDIA covers both and why
-- "which of the two claimed it" is a separate column.
-- CreateEnum
CREATE TYPE "public"."MediaChannel" AS ENUM ('POST_MEDIA', 'ARTICLE_COVER', 'AVATAR', 'BANNER');

-- CreateEnum
CREATE TYPE "public"."MediaOwnerKind" AS ENUM ('POST', 'COMMENT', 'ARTICLE');

-- CreateTable
CREATE TABLE "public"."media_assets" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "kind" "public"."MediaKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "channel" "public"."MediaChannel" NOT NULL,
    "owner_id" TEXT,
    "owner_kind" "public"."MediaOwnerKind",
    "status" "public"."MediaModerationStatus" NOT NULL DEFAULT 'PENDING',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scores" JSONB,
    "provider" TEXT,
    "moderated_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- One row per stored object, so a key can never resolve to two different
-- uploaders or two different verdicts.
-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "public"."media_assets" ("storage_key");

-- The worker's claim query is "oldest pending first", and it runs every
-- minute against a table that is mostly settled rows.
-- CreateIndex
CREATE INDEX "media_assets_status_created_at_idx" ON "public"."media_assets" ("status", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_uploader_id_idx" ON "public"."media_assets" ("uploader_id");

-- Backs the worker rebuilding an owner's media list from its surviving assets.
-- CreateIndex
CREATE INDEX "media_assets_owner_kind_owner_id_idx" ON "public"."media_assets" ("owner_kind", "owner_id");

-- Deleting a user takes their assets with them; the objects themselves are
-- swept by the existing purge job.
-- AddForeignKey
ALTER TABLE "public"."media_assets" ADD CONSTRAINT "media_assets_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "public"."posts"
    ADD COLUMN "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "media_status" "public"."MediaModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "public"."comments"
    ADD COLUMN "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "media_status" "public"."MediaModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "public"."articles"
    ADD COLUMN "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "media_status" "public"."MediaModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- Tells an author their upload was removed. Self-issued - it comes from the
-- platform, and there is no system account to attribute it to - so the type is
-- what carries the meaning, not the issuer.
--
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction from version
-- 12 on, provided the new value is not used in the same transaction. Nothing
-- here writes a MEDIA_REJECTED row.
-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'MEDIA_REJECTED';
