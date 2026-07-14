-- CreateEnum
CREATE TYPE "AdvertisementStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "stadionId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AdvertisementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisementView" (
    "id" SERIAL NOT NULL,
    "advertisementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertisementView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisementClick" (
    "id" SERIAL NOT NULL,
    "advertisementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertisementClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advertisement_ownerId_idx" ON "Advertisement"("ownerId");

-- CreateIndex
CREATE INDEX "Advertisement_stadionId_idx" ON "Advertisement"("stadionId");

-- CreateIndex
CREATE INDEX "Advertisement_status_idx" ON "Advertisement"("status");

-- CreateIndex
CREATE INDEX "Advertisement_startsAt_endsAt_idx" ON "Advertisement"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AdvertisementView_advertisementId_idx" ON "AdvertisementView"("advertisementId");

-- CreateIndex
CREATE INDEX "AdvertisementView_userId_idx" ON "AdvertisementView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertisementView_advertisementId_userId_key" ON "AdvertisementView"("advertisementId", "userId");

-- CreateIndex
CREATE INDEX "AdvertisementClick_advertisementId_idx" ON "AdvertisementClick"("advertisementId");

-- CreateIndex
CREATE INDEX "AdvertisementClick_userId_idx" ON "AdvertisementClick"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertisementClick_advertisementId_userId_key" ON "AdvertisementClick"("advertisementId", "userId");

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_stadionId_fkey" FOREIGN KEY ("stadionId") REFERENCES "Stadion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementView" ADD CONSTRAINT "AdvertisementView_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementView" ADD CONSTRAINT "AdvertisementView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementClick" ADD CONSTRAINT "AdvertisementClick_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementClick" ADD CONSTRAINT "AdvertisementClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
