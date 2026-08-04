/*
  Warnings:

  - A unique constraint covering the columns `[advertisementId,userId]` on the table `AdvertisementClick` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AdvertisementClick_advertisementId_userId_key" ON "AdvertisementClick"("advertisementId", "userId");
