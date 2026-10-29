/*
  Warnings:

  - A unique constraint covering the columns `[paylov_partner_id]` on the table `Owners` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PayoutLegalType" AS ENUM ('COMPANY', 'SOLE_PROPRIETOR', 'SELF_EMPLOYED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('NONE', 'SUBMITTED', 'CONTRACT_PENDING', 'ACTIVE', 'REJECTED');

-- AlterTable
ALTER TABLE "Owners" ADD COLUMN     "legal_type" "PayoutLegalType",
ADD COLUMN     "paylov_partner_id" TEXT,
ADD COLUMN     "payout_note" TEXT,
ADD COLUMN     "payout_status" "PayoutStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "payout_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tranzaktion" ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_sum" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Owners_paylov_partner_id_key" ON "Owners"("paylov_partner_id");
