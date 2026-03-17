/*
  Warnings:

  - A unique constraint covering the columns `[booking_id]` on the table `Tranzaktion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_booking_id_key" ON "Tranzaktion"("booking_id");
