/*
  Warnings:

  - You are about to drop the column `notification` on the `Owners` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('UPCOMING_BOOKINGS', 'DAILY_REPORT', 'WEEKLY_STATS', 'NEW_CUSTOMERS', 'CANCELLED_BOOKINGS', 'SYSTEM_UPDATES', 'PAYMENT_RECEIVED', 'BOOKING_CONFIRMED', 'FIELD_MAINTENANCE', 'PREMIUM_EXPIRY');

-- AlterTable
ALTER TABLE "Owners" DROP COLUMN "notification",
ADD COLUMN     "notificationSettings" JSONB;

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedBookingId" INTEGER,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "translations" JSONB NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_ownerId_isRead_sentAt_idx" ON "Notification"("ownerId", "isRead", "sentAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedBookingId_fkey" FOREIGN KEY ("relatedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
