-- Rotation reuse detection gets a short grace window.
--
-- Presenting a retired refresh token revokes every session the user has, which
-- is right on the web and wrong on a phone: a refresh whose response is lost to
-- a dropped connection leaves the client retrying with a token the server has
-- already retired, and the user is signed out everywhere for riding a lift.
--
-- "revokedAt" is what tells a retry seconds after a rotation apart from a
-- stolen token replayed days later, and "replacedById" is where the retry
-- finds the chain. Tokens are stored hashed, so the lost response cannot be
-- replayed - the retry is issued a new pair and the successor retired in turn.
--
-- "replacedById" is deliberately not a foreign key: the purge deletes retired
-- tokens in bulk, and a constraint would have to be nursed through that for a
-- pointer which matters for a few seconds.
--
-- Both columns are nullable with no backfill. Existing rows are live tokens
-- that have never been rotated, which is exactly what NULL means here.

-- AlterTable
ALTER TABLE "public"."refresh_tokens" ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);
