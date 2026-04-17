/*
  Warnings:

  - Made the column `user_id` on table `Booking` required. This step will fail if there are existing NULL values in that column.
  - Made the column `stadion_id` on table `Booking` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `Tranzaktion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `booking_id` on table `Tranzaktion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `owner_card_id` on table `Tranzaktion` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_stadion_id_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_owner_card_id_fkey";

-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_user_id_fkey";

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "user_id" SET NOT NULL,
ALTER COLUMN "stadion_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tranzaktion" ALTER COLUMN "user_id" SET NOT NULL,
ALTER COLUMN "booking_id" SET NOT NULL,
ALTER COLUMN "owner_card_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_owner_card_id_fkey" FOREIGN KEY ("owner_card_id") REFERENCES "Owner_card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
