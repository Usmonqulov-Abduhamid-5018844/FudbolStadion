-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "handled_by_manager_id" INTEGER;

-- CreateTable
CREATE TABLE "managers" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'uz',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_stadions" (
    "manager_id" INTEGER NOT NULL,
    "stadion_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_stadions_pkey" PRIMARY KEY ("manager_id","stadion_id")
);

-- CreateTable
CREATE TABLE "manager_invites" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "stadion_ids" INTEGER[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managers_telegram_id_key" ON "managers"("telegram_id");

-- CreateIndex
CREATE INDEX "managers_owner_id_idx" ON "managers"("owner_id");

-- CreateIndex
CREATE INDEX "manager_stadions_stadion_id_idx" ON "manager_stadions"("stadion_id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_invites_token_hash_key" ON "manager_invites"("token_hash");

-- AddForeignKey
ALTER TABLE "managers" ADD CONSTRAINT "managers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_stadions" ADD CONSTRAINT "manager_stadions_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_stadions" ADD CONSTRAINT "manager_stadions_stadion_id_fkey" FOREIGN KEY ("stadion_id") REFERENCES "Stadion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
