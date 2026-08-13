-- CreateEnum
CREATE TYPE "AdvertisementClickSource" AS ENUM ('BOT', 'CHANNEL');

-- CreateEnum
CREATE TYPE "AdvertisementStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Payments" AS ENUM ('CASH', 'CARD', 'GIBRID');

-- CreateEnum
CREATE TYPE "Booking_status" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELED', 'NOSHOW', 'REFUNDED');

-- CreateEnum
CREATE TYPE "Pay_method" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "Tranzaktion_status" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PremiumPlan" AS ENUM ('WEEK_1', 'MONTH_1', 'MONTH_3', 'MONTH_6', 'YEAR_1');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DAILY_REPORT', 'WEEKLY_STATS', 'CANCELLED_BOOKINGS', 'PAYMENT_RECEIVED', 'BOOKING_CONFIRMED', 'PREMIUM_EXPIRY');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Admin_S" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PremiumReason" AS ENUM ('TRIAL', 'PURCHASE', 'GIFT', 'COMPENSATION');

-- CreateTable
CREATE TABLE "Owners" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT,
    "chatID" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "Admin_S" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notificationSettings" JSONB NOT NULL,

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
    "mini" BOOLEAN NOT NULL DEFAULT false,
    "stadion_mini" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" INTEGER NOT NULL,
    "admin_status" "AdminStatus" NOT NULL DEFAULT 'PENDING',
    "working_status" BOOLEAN NOT NULL DEFAULT false,
    "length" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "payments_type" "Payments" NOT NULL DEFAULT 'GIBRID',
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
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "check_in" BOOLEAN NOT NULL DEFAULT false,
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
    "owner_amount" DECIMAL(65,30) NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_transactionId" TEXT,
    "status" "Tranzaktion_status" NOT NULL DEFAULT 'PENDING',
    "amount_received" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_card_id" INTEGER NOT NULL,

    CONSTRAINT "Tranzaktion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "plan" "PremiumPlan" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" "PremiumReason" NOT NULL DEFAULT 'PURCHASE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumTransaction" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "subscription_id" INTEGER,
    "duration" INTEGER NOT NULL,
    "plan" "PremiumPlan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "PremiumReason" NOT NULL DEFAULT 'PURCHASE',
    "provider" TEXT NOT NULL,
    "provider_transactionId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" SERIAL NOT NULL,
    "lang" TEXT,
    "step" TEXT,
    "chat_id" TEXT NOT NULL,
    "stadionId" INTEGER,
    "advertisementId" INTEGER,

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

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedBookingId" INTEGER,
    "data" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "translations" JSONB NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "stadionId" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "channelSentCount" INTEGER NOT NULL DEFAULT 0,
    "botViewCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "AdvertisementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisementClick" (
    "id" SERIAL NOT NULL,
    "advertisementId" INTEGER NOT NULL,
    "source" "AdvertisementClickSource" NOT NULL,
    "userId" INTEGER NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertisementClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owners_chatID_key" ON "Owners"("chatID");

-- CreateIndex
CREATE UNIQUE INDEX "Owners_email_key" ON "Owners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_chatID_key" ON "Users"("chatID");

-- CreateIndex
CREATE INDEX "Users_phone_idx" ON "Users"("phone");

-- CreateIndex
CREATE INDEX "Stadion_owner_id_idx" ON "Stadion"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_item_name_region_id_key" ON "Region_item"("name", "region_id");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_card_owner_id_key" ON "Owner_card"("owner_id");

-- CreateIndex
CREATE INDEX "Booking_status_startAt_status_pay_later_idx" ON "Booking"("status", "startAt", "status_pay_later");

-- CreateIndex
CREATE INDEX "Booking_status_endAt_check_in_idx" ON "Booking"("status", "endAt", "check_in");

-- CreateIndex
CREATE INDEX "Booking_stadion_id_date_idx" ON "Booking"("stadion_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Tranzaktion_booking_id_key" ON "Tranzaktion"("booking_id");

-- CreateIndex
CREATE INDEX "Subscription_ownerId_isActive_idx" ON "Subscription"("ownerId", "isActive");

-- CreateIndex
CREATE INDEX "PremiumTransaction_owner_id_idx" ON "PremiumTransaction"("owner_id");

-- CreateIndex
CREATE INDEX "PremiumTransaction_subscription_id_idx" ON "PremiumTransaction"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_chat_id_key" ON "sesion"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "MyFavoriteStadium_chat_id_stadion_id_key" ON "MyFavoriteStadium"("chat_id", "stadion_id");

-- CreateIndex
CREATE INDEX "Notification_ownerId_isRead_sentAt_idx" ON "Notification"("ownerId", "isRead", "sentAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Advertisement_ownerId_idx" ON "Advertisement"("ownerId");

-- CreateIndex
CREATE INDEX "Advertisement_stadionId_idx" ON "Advertisement"("stadionId");

-- CreateIndex
CREATE INDEX "Advertisement_status_idx" ON "Advertisement"("status");

-- CreateIndex
CREATE INDEX "AdvertisementClick_advertisementId_idx" ON "AdvertisementClick"("advertisementId");

-- CreateIndex
CREATE INDEX "AdvertisementClick_userId_idx" ON "AdvertisementClick"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertisementClick_advertisementId_userId_key" ON "AdvertisementClick"("advertisementId", "userId");

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
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_owner_card_id_fkey" FOREIGN KEY ("owner_card_id") REFERENCES "Owner_card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Users"("chatID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedBookingId_fkey" FOREIGN KEY ("relatedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_stadionId_fkey" FOREIGN KEY ("stadionId") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementClick" ADD CONSTRAINT "AdvertisementClick_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementClick" ADD CONSTRAINT "AdvertisementClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
