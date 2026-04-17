-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_booking_id_fkey";

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
