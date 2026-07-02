/*
  Warnings:

  - Added the required column `duration` to the `PremiumTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Subscription_ownerId_isActive_endDate_idx";

-- AlterTable
ALTER TABLE "PremiumTransaction" ADD COLUMN     "duration" INTEGER NOT NULL,
ADD COLUMN     "reason" "PremiumReason" NOT NULL DEFAULT 'PURCHASE';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "PremiumTransaction_owner_id_idx" ON "PremiumTransaction"("owner_id");

-- CreateIndex
CREATE INDEX "PremiumTransaction_subscription_id_idx" ON "PremiumTransaction"("subscription_id");

-- CreateIndex
CREATE INDEX "Subscription_ownerId_isActive_idx" ON "Subscription"("ownerId", "isActive");
