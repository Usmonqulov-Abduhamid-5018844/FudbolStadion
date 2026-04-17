-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "stadion_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tranzaktion" ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "booking_id" DROP NOT NULL,
ALTER COLUMN "owner_card_id" DROP NOT NULL;
