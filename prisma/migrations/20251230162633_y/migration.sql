/*
  Warnings:

  - You are about to drop the column `card_numbar` on the `Owner_card` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Owner_card` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Owner_card` table. All the data in the column will be lost.
  - Added the required column `cardMask` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cardToken` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cardType` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expireMonth` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expireYear` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isActive` to the `Owner_card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `Owner_card` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Owner_card" DROP COLUMN "card_numbar",
DROP COLUMN "is_active",
DROP COLUMN "updatedAt",
ADD COLUMN     "cardMask" TEXT NOT NULL,
ADD COLUMN     "cardToken" TEXT NOT NULL,
ADD COLUMN     "cardType" TEXT NOT NULL,
ADD COLUMN     "expireMonth" TEXT NOT NULL,
ADD COLUMN     "expireYear" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL;
