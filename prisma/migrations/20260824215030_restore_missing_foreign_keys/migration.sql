-- Restores foreign keys that were never created.
--
-- _prisma_migrations records 0_init three times: two rolled back, and a third
-- marked applied with applied_steps_count = 0. The migration was baselined
-- onto a database that had not been built from it, so its
-- ADD CONSTRAINT statements never ran and the schema kept 1 of its 22 keys.
--
-- Without them every onDelete: Cascade the schema declares is inert: a
-- deleted post keeps its comments, likes and bookmarks, and the user purge
-- job orphans everything a deleted user owned.
--
-- Every statement is idempotent, so this is a no-op on a database built
-- cleanly from 0_init.

-- _PostToTag.A -> posts.id
DELETE FROM "_PostToTag" AS child
WHERE child."A" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "posts" AS parent
    WHERE parent."id" = child."A"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_PostToTag_A_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- _PostToTag.B -> tags.id
DELETE FROM "_PostToTag" AS child
WHERE child."B" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tags" AS parent
    WHERE parent."id" = child."B"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_PostToTag_B_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comment_bookmarks.comment_id -> comments.id
DELETE FROM "comment_bookmarks" AS child
WHERE child."comment_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "comments" AS parent
    WHERE parent."id" = child."comment_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_bookmarks_comment_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comment_bookmarks" ADD CONSTRAINT "comment_bookmarks_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comment_bookmarks.user_id -> users.id
DELETE FROM "comment_bookmarks" AS child
WHERE child."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."user_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_bookmarks_user_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comment_bookmarks" ADD CONSTRAINT "comment_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comment_likes.comment_id -> comments.id
DELETE FROM "comment_likes" AS child
WHERE child."comment_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "comments" AS parent
    WHERE parent."id" = child."comment_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_likes_comment_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comment_likes.user_id -> users.id
DELETE FROM "comment_likes" AS child
WHERE child."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."user_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_likes_user_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comment_likes" ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comments.author_id -> users.id
DELETE FROM "comments" AS child
WHERE child."author_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."author_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_author_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comments.parentId -> comments.id
DELETE FROM "comments" AS child
WHERE child."parentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "comments" AS parent
    WHERE parent."id" = child."parentId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_parentId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- comments.post_id -> posts.id
DELETE FROM "comments" AS child
WHERE child."post_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "posts" AS parent
    WHERE parent."id" = child."post_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_post_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- follows.followerId -> users.id
DELETE FROM "follows" AS child
WHERE child."followerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."followerId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_followerId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- follows.followingId -> users.id
DELETE FROM "follows" AS child
WHERE child."followingId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."followingId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_followingId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- notifications.issuerId -> users.id
DELETE FROM "notifications" AS child
WHERE child."issuerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."issuerId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_issuerId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- notifications.recipientId -> users.id
DELETE FROM "notifications" AS child
WHERE child."recipientId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."recipientId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_recipientId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- oauth_accounts.userId -> users.id
DELETE FROM "oauth_accounts" AS child
WHERE child."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."userId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'oauth_accounts_userId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- post_bookmarks.post_id -> posts.id
DELETE FROM "post_bookmarks" AS child
WHERE child."post_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "posts" AS parent
    WHERE parent."id" = child."post_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'post_bookmarks_post_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."post_bookmarks" ADD CONSTRAINT "post_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- post_bookmarks.user_id -> users.id
DELETE FROM "post_bookmarks" AS child
WHERE child."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."user_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'post_bookmarks_user_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."post_bookmarks" ADD CONSTRAINT "post_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- post_likes.post_id -> posts.id
DELETE FROM "post_likes" AS child
WHERE child."post_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "posts" AS parent
    WHERE parent."id" = child."post_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'post_likes_post_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- post_likes.user_id -> users.id
DELETE FROM "post_likes" AS child
WHERE child."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."user_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'post_likes_user_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- posts.author_id -> users.id
DELETE FROM "posts" AS child
WHERE child."author_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."author_id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posts_author_id_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- profiles.userId -> users.id
DELETE FROM "profiles" AS child
WHERE child."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."userId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_userId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- refresh_tokens.userId -> users.id
DELETE FROM "refresh_tokens" AS child
WHERE child."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."userId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'refresh_tokens_userId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- verification_tokens.userId -> users.id
DELETE FROM "verification_tokens" AS child
WHERE child."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS parent
    WHERE parent."id" = child."userId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'verification_tokens_userId_fkey' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

