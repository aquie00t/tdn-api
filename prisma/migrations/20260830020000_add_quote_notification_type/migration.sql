-- Quoting someone's post now notifies them.
--
-- Postgres refuses ALTER TYPE ... ADD VALUE inside a transaction block before
-- version 12, and Prisma runs every migration in one. From 12 onwards it is
-- allowed, with the single condition that the new value is not *used* in the
-- same transaction - this migration only adds it, so nothing here writes a
-- QUOTE row. This is the first enum change in the repository; the reasoning
-- lives here so the next one does not have to rediscover it.

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'QUOTE';
