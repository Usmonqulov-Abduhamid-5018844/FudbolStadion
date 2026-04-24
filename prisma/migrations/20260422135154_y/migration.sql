/*
  Warnings:

  - The values [NO_SHOW] on the enum `Booking_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Booking_status_new" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELED', 'NOSHOW', 'REFUNDED');
ALTER TABLE "public"."Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "Booking_status_new" USING ("status"::text::"Booking_status_new");
ALTER TYPE "Booking_status" RENAME TO "Booking_status_old";
ALTER TYPE "Booking_status_new" RENAME TO "Booking_status";
DROP TYPE "public"."Booking_status_old";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
