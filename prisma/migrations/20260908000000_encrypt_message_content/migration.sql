-- Message text is encrypted at rest from here on.
--
-- The ciphertext goes in the existing `content` column; these two columns say
-- how to read it. The scale is shared by both:
--
--   0  plaintext, written before this existed. Read back as-is.
--   1  AES-256-GCM under the server key, decrypted by the repository.
--   2  encrypted by the client, passed through untouched. Nothing writes it yet.
--
-- Defaulting to 0 is what makes this safe to deploy ahead of the backfill:
-- every existing row keeps saying "plaintext" and keeps being read correctly,
-- while new rows are written as 1. The backfill then moves the old ones over at
-- its own pace, and can be run twice.
--
-- The version lives in a column rather than as a prefix on the string because a
-- plaintext message that happened to start with that prefix would be mistaken
-- for ciphertext and fail to decrypt. No index: the only query that filters on
-- it is the backfill, which walks the table once regardless.

-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN "enc_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."conversations" ADD COLUMN "preview_enc_version" INTEGER NOT NULL DEFAULT 0;
