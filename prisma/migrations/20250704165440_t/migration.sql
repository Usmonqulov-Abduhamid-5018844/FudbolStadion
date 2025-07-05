/*
  Warnings:

  - Added the required column `region` to the `Stadion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Stadion" ADD COLUMN     "region" TEXT NOT NULL;
