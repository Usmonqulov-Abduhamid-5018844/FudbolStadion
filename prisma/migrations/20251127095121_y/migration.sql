/*
  Warnings:

  - You are about to drop the column `chatId` on the `Users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[chatID]` on the table `Users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `chatID` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Users_chatId_key";

-- AlterTable
ALTER TABLE "Users" DROP COLUMN "chatId",
ADD COLUMN     "chatID" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Users_chatID_key" ON "Users"("chatID");
