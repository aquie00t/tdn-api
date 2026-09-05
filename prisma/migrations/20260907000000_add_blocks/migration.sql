-- Users can block each other.
--
-- Stored directionally - who blocked whom - because that is the question a
-- profile has to answer: "you blocked them" offers an unblock button, "they
-- blocked you" is a wall, and the two render differently. That is the one way
-- this table departs from "conversations", which orders its pair so the two
-- directions collapse into one row.
--
-- The effect is symmetric even though the storage is not: every read that asks
-- "who can this viewer not see" unions both columns, so a single row hides two
-- people from each other. Two rows exist only when both sides blocked
-- independently, and lifting one leaves the other standing.
--
-- Both columns carry an index because both are queried alone: the union above
-- reads them separately. Both sides cascade, so a purged account cannot leave
-- a block pointing at nothing - the same reason the mention join tables do.

-- CreateTable
CREATE TABLE "public"."blocks" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE INDEX "blocks_blockerId_idx" ON "public"."blocks"("blockerId" ASC);

-- CreateIndex
CREATE INDEX "blocks_blockedId_idx" ON "public"."blocks"("blockedId" ASC);

-- AddForeignKey
ALTER TABLE "public"."blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
