-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "Booking_status" ADD VALUE 'REFUND_PENDING';

-- AlterTable
ALTER TABLE "Tranzaktion" ADD COLUMN     "refund_id" TEXT,
ADD COLUMN     "refund_status" "RefundStatus";

-- DropEnum
DROP TYPE "Tranzaktion_status";
