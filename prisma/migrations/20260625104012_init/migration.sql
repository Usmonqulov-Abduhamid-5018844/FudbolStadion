/*
  Warnings:

  - The values [UPCOMING_BOOKINGS,NEW_CUSTOMERS,SYSTEM_UPDATES,FIELD_MAINTENANCE] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `admin_checked` on the `Stadion` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Admin_S" AS ENUM ('ACTIVE', 'BLOCKED');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('DAILY_REPORT', 'WEEKLY_STATS', 'CANCELLED_BOOKINGS', 'PAYMENT_RECEIVED', 'BOOKING_CONFIRMED', 'PREMIUM_EXPIRY');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "Owners" ADD COLUMN     "status" "Admin_S" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Stadion" DROP COLUMN "admin_checked",
ADD COLUMN     "admin_status" "AdminStatus" NOT NULL DEFAULT 'PENDING';
