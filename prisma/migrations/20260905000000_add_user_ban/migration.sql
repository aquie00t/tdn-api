-- Suspending an account.
--
-- There is no endpoint that writes this column and no admin panel: a ban is
-- applied by hand, against the database. The column name is camelCase like the
-- rest of this table, so the double quotes below are required.
--
--   Ban:   UPDATE "users" SET "bannedAt" = now() WHERE username = '<handle>';
--   Lift:  UPDATE "users" SET "bannedAt" = NULL  WHERE username = '<handle>';
--
-- The auth hook reads this column on every request carrying a token, so a ban
-- takes effect immediately rather than when the current access token expires.
-- No index: it is never a filter on its own, and every read that consults it
-- arrives by primary key or through the botToken index.

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN "bannedAt" TIMESTAMP(3);
