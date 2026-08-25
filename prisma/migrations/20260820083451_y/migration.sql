-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;
