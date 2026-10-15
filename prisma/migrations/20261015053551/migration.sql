/*
  Warnings:

  - You are about to drop the column `provider_transaction_id` on the `PremiumTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `provider_transaction_id` on the `Tranzaktion` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[provider,provider_order_id]` on the table `PremiumTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,provider_payment_id]` on the table `PremiumTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,provider_order_id]` on the table `Tranzaktion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,provider_payment_id]` on the table `Tranzaktion` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PremiumTransaction_provider_order_id_idx";

-- DropIndex
DROP INDEX "PremiumTransaction_provider_provider_transaction_id_key";

-- DropIndex
DROP INDEX "Tranzaktion_provider_order_id_idx";

-- DropIndex
DROP INDEX "Tranzaktion_provider_provider_transaction_id_key";

-- DropIndex
DROP INDEX "Tranzaktion_status_idx";

-- AlterTable
ALTER TABLE "PremiumTransaction" DROP COLUMN "provider_transaction_id",
ADD COLUMN     "provider_payment_id" TEXT;

-- AlterTable
ALTER TABLE "Tranzaktion" DROP COLUMN "provider_transaction_id",
ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "provider_payment_id" TEXT;

-- CreateIndex
CREATE INDEX "PremiumTransaction_status_createdAt_idx" ON "PremiumTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumTransaction_provider_provider_order_id_key" ON "PremiumTransaction"("provider", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumTransaction_provider_provider_payment_id_key" ON "PremiumTransaction"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "Tranzaktion_status_createdAt_idx" ON "Tranzaktion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Tranzaktion_refund_status_idx" ON "Tranzaktion"("refund_status");

-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_provider_provider_order_id_key" ON "Tranzaktion"("provider", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_provider_provider_payment_id_key" ON "Tranzaktion"("provider", "provider_payment_id");
