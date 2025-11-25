/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Owners` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Owners` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Owners" ADD COLUMN     "email" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Owners_email_key" ON "Owners"("email");
