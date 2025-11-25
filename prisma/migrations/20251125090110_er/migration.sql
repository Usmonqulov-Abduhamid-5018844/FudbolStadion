/*
  Warnings:

  - A unique constraint covering the columns `[chatID]` on the table `Owners` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chatId]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Owners_chatID_key" ON "Owners"("chatID");

-- CreateIndex
CREATE UNIQUE INDEX "Users_chatId_key" ON "Users"("chatId");
