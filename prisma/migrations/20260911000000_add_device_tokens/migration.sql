-- Installations of the app that may be notified.
--
-- "token" is unique across the whole table rather than per user, and that is
-- the point: a phone handed to somebody else, or an account switched inside
-- the app, produces the same token under a new user. Keyed this way a
-- registration moves the row, instead of leaving one person's notifications
-- arriving on another person's screen.
--
-- "last_seen_at" carries an index because it is what makes an uninstalled app
-- eventually stop being notified. Expo reports a token it knows to be dead and
-- those are deleted at once, but a phone that is simply gone reports nothing,
-- so a token nobody has refreshed for long enough is dropped on age.
--
-- Cascade on the user, like every other table that points at one: a purged
-- account must not leave a live push token behind.

-- CreateEnum
CREATE TYPE "public"."DevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "public"."device_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "public"."DevicePlatform" NOT NULL,
    "app_version" TEXT,
    "locale" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "public"."device_tokens" ("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "public"."device_tokens" ("user_id");

-- CreateIndex
CREATE INDEX "device_tokens_last_seen_at_idx" ON "public"."device_tokens" ("last_seen_at");

-- AddForeignKey
ALTER TABLE "public"."device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
