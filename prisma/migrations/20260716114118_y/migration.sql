/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `endsAt` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `images` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to alter the column `title` on the `Advertisement` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - Added the required column `durationDays` to the `Advertisement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expiresAt` to the `Advertisement` table without a default value. This is not possible if the table is not empty.
  - Made the column `stadionId` on table `Advertisement` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Advertisement_startsAt_endsAt_idx";

-- AlterTable
ALTER TABLE "Advertisement" DROP COLUMN "createdAt",
DROP COLUMN "endsAt",
DROP COLUMN "images",
DROP COLUMN "startsAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "channelSentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationDays" INTEGER NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ALTER COLUMN "stadionId" SET NOT NULL,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
