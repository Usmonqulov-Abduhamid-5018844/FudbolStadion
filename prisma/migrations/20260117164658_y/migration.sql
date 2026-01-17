-- CreateTable
CREATE TABLE "MyFavoriteStadium" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyFavoriteStadium_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyFavoriteStadium_chat_id_stadion_id_key" ON "MyFavoriteStadium"("chat_id", "stadion_id");

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Users"("chatID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyFavoriteStadium" ADD CONSTRAINT "MyFavoriteStadium_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
