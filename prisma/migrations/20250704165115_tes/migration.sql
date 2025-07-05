/*
  Warnings:

  - You are about to drop the column `dey` on the `Stadion_schedule` table. All the data in the column will be lost.
  - Added the required column `description` to the `Stadion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Stadion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Stadion" ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Stadion_schedule" DROP COLUMN "dey";
