/*
  Warnings:

  - You are about to drop the column `activatedAt` on the `Advertisement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Advertisement" DROP CONSTRAINT "Advertisement_stadionId_fkey";

-- AlterTable
ALTER TABLE "Advertisement" DROP COLUMN "activatedAt";

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_stadionId_fkey" FOREIGN KEY ("stadionId") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
