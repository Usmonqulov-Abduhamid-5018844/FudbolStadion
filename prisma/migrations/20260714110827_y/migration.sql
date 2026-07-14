/*
  Warnings:

  - You are about to drop the `AdvertisementView` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AdvertisementView" DROP CONSTRAINT "AdvertisementView_advertisementId_fkey";

-- DropForeignKey
ALTER TABLE "AdvertisementView" DROP CONSTRAINT "AdvertisementView_userId_fkey";

-- DropIndex
DROP INDEX "AdvertisementClick_advertisementId_userId_key";

-- DropTable
DROP TABLE "AdvertisementView";
