/*
  Warnings:

  - Added the required column `source` to the `AdvertisementClick` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdvertisementClickSource" AS ENUM ('BOT', 'CHANNEL');

-- AlterTable
ALTER TABLE "AdvertisementClick" ADD COLUMN     "source" "AdvertisementClickSource" NOT NULL;
