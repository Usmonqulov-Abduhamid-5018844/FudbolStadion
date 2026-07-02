-- CreateEnum
CREATE TYPE "PremiumReason" AS ENUM ('PURCHASE', 'GIFT', 'COMPENSATION');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "reason" "PremiumReason" NOT NULL DEFAULT 'PURCHASE';
