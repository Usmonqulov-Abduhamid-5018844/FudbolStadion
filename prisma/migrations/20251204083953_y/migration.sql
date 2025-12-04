-- CreateEnum
CREATE TYPE "Payments" AS ENUM ('CASH', 'CARD', 'GIBRID');

-- CreateEnum
CREATE TYPE "Booking_status" AS ENUM ('PENDING', 'APPROVED', 'CANCELED', 'PAID', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Pay_method" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "Tranzaktion_status" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "Owners" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT,
    "chatID" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "phone" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "chatID" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stadion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "image" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "region_id" INTEGER NOT NULL,
    "max_count" INTEGER NOT NULL,
    "region_item_id" INTEGER NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "working_status" BOOLEAN NOT NULL DEFAULT true,
    "length" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "payments_type" "Payments" NOT NULL DEFAULT 'GIBRID',
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stadion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stadion_chedule" (
    "id" SERIAL NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "Stadion_chedule_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Region" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region_item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region_id" INTEGER NOT NULL,

    CONSTRAINT "Region_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner_card" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "card_numbar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "total_price" INTEGER NOT NULL,
    "status" "Booking_status" NOT NULL DEFAULT 'PENDING',
    "payment_method" "Pay_method" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tranzaktion" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "systeam_fee" INTEGER NOT NULL,
    "owner_amount" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_transactionId" TEXT NOT NULL,
    "status" "Tranzaktion_status" NOT NULL DEFAULT 'PENDING',
    "click_fee" INTEGER NOT NULL,
    "owner_cred_id" INTEGER NOT NULL,
    "amount_received" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tranzaktion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owners_chatID_key" ON "Owners"("chatID");

-- CreateIndex
CREATE UNIQUE INDEX "Owners_email_key" ON "Owners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_chatID_key" ON "Users"("chatID");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_item_name_region_id_key" ON "Region_item"("name", "region_id");

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_region_item_id_fkey" FOREIGN KEY ("region_item_id") REFERENCES "Region_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion_chedule" ADD CONSTRAINT "Stadion_chedule_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadion_off_days" ADD CONSTRAINT "stadion_off_days_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadion_special_schedule" ADD CONSTRAINT "stadion_special_schedule_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region_item" ADD CONSTRAINT "Region_item_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner_card" ADD CONSTRAINT "Owner_card_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_owner_cred_id_fkey" FOREIGN KEY ("owner_cred_id") REFERENCES "Owner_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
