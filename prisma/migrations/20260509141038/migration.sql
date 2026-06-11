/*
  Warnings:

  - You are about to drop the column `is_premium` on the `Stadion` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PremiumPlan" AS ENUM ('MONTH_1', 'MONTH_3', 'YEAR_1');

-- AlterTable
ALTER TABLE "Owners" ADD COLUMN     "notification" JSONB;

-- AlterTable
ALTER TABLE "Stadion" DROP COLUMN "is_premium";

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "plan" "PremiumPlan" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_stadion_id_date_idx" ON "Booking"("stadion_id", "date");

-- CreateIndex
CREATE INDEX "Stadion_owner_id_idx" ON "Stadion"("owner_id");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
