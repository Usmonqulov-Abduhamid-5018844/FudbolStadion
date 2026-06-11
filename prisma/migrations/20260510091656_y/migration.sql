-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Tranzaktion" ALTER COLUMN "owner_amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "amount_received" SET DATA TYPE DECIMAL(65,30);

-- CreateTable
CREATE TABLE "PremiumTransaction" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "subscription_id" INTEGER,
    "plan" "PremiumPlan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_transactionId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_ownerId_isActive_endDate_idx" ON "Subscription"("ownerId", "isActive", "endDate");

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
