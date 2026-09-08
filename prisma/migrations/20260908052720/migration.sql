/*
  Warnings:

  - You are about to drop the column `octo_payment_UUID` on the `PremiumTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `provider_transactionId` on the `PremiumTransaction` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[provider,provider_transaction_id]` on the table `PremiumTransaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `PremiumTransaction` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `PremiumTransaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CLICK', 'PAYME', 'PAYINET', 'UZUM', 'OCTO');

-- AlterTable
ALTER TABLE "PremiumTransaction" DROP COLUMN "octo_payment_UUID",
DROP COLUMN "provider_transactionId",
ADD COLUMN     "card_country" TEXT,
ADD COLUMN     "card_masked_pan" TEXT,
ADD COLUMN     "card_type" TEXT,
ADD COLUMN     "card_vendor" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN     "provider_data" JSONB,
ADD COLUMN     "provider_transaction_id" TEXT,
ADD COLUMN     "risk_level" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "PaymentProvider" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PremiumTransaction_provider_provider_transaction_id_key" ON "PremiumTransaction"("provider", "provider_transaction_id");
