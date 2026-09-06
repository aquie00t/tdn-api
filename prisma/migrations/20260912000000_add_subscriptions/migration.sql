-- Paid verification: one billing row per account, and the badge it grants.
--
-- "users.verifiedUntil" is denormalised on purpose. Every read that shows an
-- author shows the badge - roughly a dozen queries - and none of them should
-- join a billing table to render a tick. It is a date rather than a boolean so
-- that it expires on its own: a provider notification that never arrives then
-- costs the badge at the end of the period the user paid for, which is a
-- failure everybody can live with, where a boolean would leave it on for good.
--
-- "subscriptions" is one row per user, never deleted while the account exists,
-- because a resubscription has to attach to the same provider customer instead
-- of creating a second one nobody can reconcile. What it deliberately does not
-- hold is invoices, receipts, amounts or payment methods: the store keeps all
-- of that and shows it to the user itself, and copying it would mean owning a
-- permanently stale second ledger.
--
-- "provider_subscription_id" is unique so one purchase cannot be claimed by two
-- accounts. "last_event_at" is what makes out-of-order notifications safe -
-- store events are not ordered, and a renewal delivered after the cancellation
-- that superseded it would otherwise reinstate a subscription that is over.
--
-- "billing_events" is an audit trail, not the replay guard: every sync writes
-- the state the provider reports rather than adjusting what is there, so
-- applying one twice lands in the same place either way.

-- CreateEnum
CREATE TYPE "public"."BillingProvider" AS ENUM ('GOOGLE_PLAY');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'IN_GRACE', 'CANCELED', 'REVOKED');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "verifiedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL,
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "status" "public"."SubscriptionStatus" NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."billing_events" (
    "id" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL,
    "type" TEXT NOT NULL,
    "provider_subscription_id" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "public"."subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "public"."subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "public"."subscriptions"("status");

-- CreateIndex
CREATE INDEX "billing_events_provider_subscription_id_idx" ON "public"."billing_events"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "billing_events_processed_at_idx" ON "public"."billing_events"("processed_at");

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

