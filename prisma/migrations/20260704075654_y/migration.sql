/*
  Warnings:

  - Made the column `notificationSettings` on table `Owners` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Owners" ALTER COLUMN "notificationSettings" SET NOT NULL;
