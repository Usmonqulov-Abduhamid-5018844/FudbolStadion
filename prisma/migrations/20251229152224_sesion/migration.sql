-- CreateTable
CREATE TABLE "sesion" (
    "id" SERIAL NOT NULL,
    "lang" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesion_chat_id_key" ON "sesion"("chat_id");
