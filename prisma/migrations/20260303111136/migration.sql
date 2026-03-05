/*
  Warnings:

  - The values [APPROVED] on the enum `Booking_status` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `updatedAt` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Booking_status_new" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELED', 'NO_SHOW');
ALTER TABLE "public"."Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "Booking_status_new" USING ("status"::text::"Booking_status_new");
ALTER TYPE "Booking_status" RENAME TO "Booking_status_old";
ALTER TYPE "Booking_status_new" RENAME TO "Booking_status";
DROP TYPE "public"."Booking_status_old";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
