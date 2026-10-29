/*
  Warnings:

  - You are about to drop the column `amount_received` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `card_country` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `card_masked_pan` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `card_type` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `card_vendor` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `owner_card_id` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `refund_id` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `refunded_sum` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `retained_percent` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `retained_sum` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `risk_level` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `system_fee` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `transfer_sum` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the `Owner_card` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SplitStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- DropForeignKey
ALTER TABLE "Owner_card" DROP CONSTRAINT "Owner_card_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_owner_card_id_fkey";

-- AlterTable
ALTER TABLE "Tranzaktion" DROP COLUMN "amount_received",
DROP COLUMN "card_country",
DROP COLUMN "card_masked_pan",
DROP COLUMN "card_type",
DROP COLUMN "card_vendor",
DROP COLUMN "owner_card_id",
DROP COLUMN "refund_id",
DROP COLUMN "refunded_sum",
DROP COLUMN "retained_percent",
DROP COLUMN "retained_sum",
DROP COLUMN "risk_level",
DROP COLUMN "system_fee",
DROP COLUMN "transfer_sum",
ADD COLUMN     "owner_amount" INTEGER,
ADD COLUMN     "platform_amount" INTEGER,
ADD COLUMN     "split_data" JSONB,
ADD COLUMN     "split_error" TEXT,
ADD COLUMN     "split_partner_id" TEXT,
ADD COLUMN     "split_sent_at" TIMESTAMP(3),
ADD COLUMN     "split_status" "SplitStatus" NOT NULL DEFAULT 'NONE';

-- DropTable
DROP TABLE "Owner_card";

-- CreateIndex
CREATE INDEX "Tranzaktion_split_status_paid_at_idx" ON "Tranzaktion"("split_status", "paid_at");
