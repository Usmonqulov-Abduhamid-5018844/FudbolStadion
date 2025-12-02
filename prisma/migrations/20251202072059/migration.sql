/*
  Warnings:

  - The values [CONFIRMED,CANCELLED] on the enum `Booking_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Booking_status_new" AS ENUM ('PENDING', 'APPROVED', 'CANCELED', 'PAID', 'COMPLETED');
ALTER TABLE "public"."Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "Booking_status_new" USING ("status"::text::"Booking_status_new");
ALTER TYPE "Booking_status" RENAME TO "Booking_status_old";
ALTER TYPE "Booking_status_new" RENAME TO "Booking_status";
DROP TYPE "public"."Booking_status_old";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- CreateTable
CREATE TABLE "stadion_off_days" (
    "id" SERIAL NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stadion_off_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadion_special_schedule" (
    "id" SERIAL NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stadion_special_schedule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stadion_off_days" ADD CONSTRAINT "stadion_off_days_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadion_special_schedule" ADD CONSTRAINT "stadion_special_schedule_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
