/*
  Warnings:

  - The primary key for the `PremiumTransaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Tranzaktion` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `PremiumTransaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Tranzaktion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "PremiumTransaction" DROP CONSTRAINT "PremiumTransaction_pkey",
ADD COLUMN     "octo_payment_UUID" TEXT,
ADD COLUMN     "paid_at" TIMESTAMP(3),
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "PremiumTransaction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Tranzaktion" DROP CONSTRAINT "Tranzaktion_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Tranzaktion_pkey" PRIMARY KEY ("id");
