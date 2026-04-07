-- CreateEnum
CREATE TYPE "Payments" AS ENUM ('CASH', 'CARD', 'GIBRID');

-- CreateEnum
CREATE TYPE "Booking_status" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'REFUNDED');

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
    "parent_id" INTEGER,
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
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desc" TEXT,

    CONSTRAINT "stadion_off_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadion_special_schedule" (
    "id" SERIAL NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cardMask" TEXT NOT NULL,
    "cardToken" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "expireMonth" TEXT NOT NULL,
    "expireYear" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "Owner_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "total_price" DECIMAL(65,30) NOT NULL,
    "status" "Booking_status" NOT NULL DEFAULT 'PENDING',
    "payment_method" "Pay_method" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status_pay_later" BOOLEAN NOT NULL DEFAULT false,

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
    "amount_received" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_card_id" INTEGER NOT NULL,

    CONSTRAINT "Tranzaktion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" SERIAL NOT NULL,
    "lang" TEXT,
    "step" TEXT,
    "chat_id" TEXT NOT NULL,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MyFavoriteStadium" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyFavoriteStadium_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "Owner_card_owner_id_key" ON "Owner_card"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_booking_id_key" ON "Tranzaktion"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_chat_id_key" ON "sesion"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "MyFavoriteStadium_chat_id_stadion_id_key" ON "MyFavoriteStadium"("chat_id", "stadion_id");

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Stadion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadion" ADD CONSTRAINT "Stadion_region_item_id_fkey" FOREIGN KEY ("region_item_id") REFERENCES "Region_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_owner_card_id_fkey" FOREIGN KEY ("owner_card_id") REFERENCES "Owner_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Users"("chatID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
