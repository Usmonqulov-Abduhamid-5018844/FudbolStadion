/*
  Warnings:

  - You are about to drop the column `click_fee` on the `Tranzaktion` table. All the data in the column will be lost.
  - You are about to drop the column `owner_cred_id` on the `Tranzaktion` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[owner_id]` on the table `Owner_card` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `owner_card_id` to the `Tranzaktion` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_owner_cred_id_fkey";

-- AlterTable
ALTER TABLE "Tranzaktion" DROP COLUMN "click_fee",
DROP COLUMN "owner_cred_id",
ADD COLUMN     "owner_card_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Owner_card_owner_id_key" ON "Owner_card"("owner_id");

-- AddForeignKey
ALTER TABLE "Tranzaktion" ADD CONSTRAINT "Tranzaktion_owner_card_id_fkey" FOREIGN KEY ("owner_card_id") REFERENCES "Owner_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
