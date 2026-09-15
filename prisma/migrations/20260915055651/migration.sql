/*
  Warnings:

  - You are about to drop the column `provider_transactionId` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `systeam_fee` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to alter the column `owner_amount` on the `Tranzaktion` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - The `provider` column on the `Tranzaktion` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Tranzaktion` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `amount_received` on the `Tranzaktion` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - A unique constraint covering the columns `[provider,provider_transaction_id]` on the table `Tranzaktion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `system_fee` to the `Tranzaktion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Tranzaktion` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PremiumTransaction" DROP CONSTRAINT "PremiumTransaction_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_booking_id_fkey";

-- DropIndex
DROP INDEX "Tranzaktion_booking_id_key";

-- AlterTable
ALTER TABLE "Tranzaktion" DROP COLUMN "provider_transactionId",
DROP COLUMN "systeam_fee",
ADD COLUMN     "card_country" TEXT,
ADD COLUMN     "card_masked_pan" TEXT,
ADD COLUMN     "card_type" TEXT,
ADD COLUMN     "card_vendor" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "provider_data" JSONB,
ADD COLUMN     "provider_transaction_id" TEXT,
ADD COLUMN     "refunded_sum" INTEGER,
ADD COLUMN     "risk_level" INTEGER,
ADD COLUMN     "system_fee" INTEGER NOT NULL,
ADD COLUMN     "transfer_sum" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "owner_amount" SET DATA TYPE INTEGER,
DROP COLUMN "provider",
ADD COLUMN     "provider" "PaymentProvider",
DROP COLUMN "status",
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "amount_received" SET DATA TYPE INTEGER;

-- CreateIndex
CREATE INDEX "Tranzaktion_user_id_idx" ON "Tranzaktion"("user_id");

-- CreateIndex
CREATE INDEX "Tranzaktion_booking_id_idx" ON "Tranzaktion"("booking_id");

-- CreateIndex
CREATE INDEX "Tranzaktion_status_idx" ON "Tranzaktion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_provider_provider_transaction_id_key" ON "Tranzaktion"("provider", "provider_transaction_id");

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
