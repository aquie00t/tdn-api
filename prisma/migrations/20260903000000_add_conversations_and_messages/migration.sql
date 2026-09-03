-- One-to-one direct messaging.
--
-- `conversations` holds the pair, `messages` holds what they said. Two things
-- about the pair are worth stating out loud.
--
-- First, it is stored ordered: `user_a_id` always sorts before `user_b_id`.
-- That is the only reason the unique constraint on the pair means anything -
-- without it (a,b) and (b,a) are two different rows, and the same two people
-- end up with two threads the moment they write to each other at once.
--
-- Second, the per-side read state lives here rather than on the messages.
-- Marking a thread read is one row update instead of an update across every
-- message in it, and the unread badge is a sum over conversations rather than
-- a scan of the message table.
--
-- `status` is what makes an open inbox survivable: a conversation opened by
-- somebody the recipient does not follow starts PENDING, lands in a requests
-- tab, and raises no notification until it is accepted.

-- CreateEnum
CREATE TYPE "public"."ConversationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- Message media travels its own upload channel. The channel is fixed when the
-- bytes arrive, so a file uploaded for a private conversation can never be
-- attached to a public post, or the other way round.
--
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction from version
-- 12 on, provided the new value is not used in the same transaction. Nothing
-- below writes either of the two values added here.
-- AlterEnum
ALTER TYPE "public"."MediaChannel" ADD VALUE 'MESSAGE_MEDIA';

-- Lets the moderation worker write a video's verdict back to the message
-- carrying it.
-- AlterEnum
ALTER TYPE "public"."MediaOwnerKind" ADD VALUE 'MESSAGE';

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "initiator_id" TEXT NOT NULL,
    "status" "public"."ConversationStatus" NOT NULL DEFAULT 'PENDING',
    "user_a_last_read_at" TIMESTAMP(3),
    "user_b_last_read_at" TIMESTAMP(3),
    "user_a_unread" INTEGER NOT NULL DEFAULT 0,
    "user_b_unread" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "media_status" "public"."MediaModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- One thread per pair. Depends on the ordering described at the top of this
-- file: the application sorts the two ids before it ever writes a row.
-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_a_id_user_b_id_key" ON "public"."conversations" ("user_a_id", "user_b_id");

-- The inbox query is "my conversations, newest message first", and a user sits
-- on whichever side of the pair the ordering put them, so both sides need an
-- index of their own.
-- CreateIndex
CREATE INDEX "conversations_user_a_id_last_message_at_idx" ON "public"."conversations" ("user_a_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_user_b_id_last_message_at_idx" ON "public"."conversations" ("user_b_id", "last_message_at");

-- Backs paging a thread newest-first, which is every read of it.
-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "public"."messages" ("conversation_id", "created_at");

-- Deleting a user takes their conversations, and with them the messages, so a
-- thread can never point at an account that is gone.
-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
