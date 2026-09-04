-- Being named with an @handle now notifies the account.
--
-- Kept in its own migration, as the QUOTE value was: Postgres allows
-- ALTER TYPE ... ADD VALUE inside a transaction from version 12 on, but only
-- while the new value is not used in the same transaction. Nothing here writes
-- a MENTION row, so the condition holds.

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'MENTION';
