/*
  Warnings:

  - The values [CLICK,PAYME,PAYINET,UZUM,OCTO] on the enum `PaymentProvider` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "GatewayMethod" AS ENUM ('CLICK', 'PAYME', 'UZUM', 'PAYLOV', 'CARD');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentProvider_new" AS ENUM ('PAYLOV');
ALTER TABLE "Tranzaktion" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TABLE "PremiumTransaction" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "public"."PaymentProvider_old";
COMMIT;

-- AlterTable
ALTER TABLE "PremiumTransaction" ADD COLUMN     "gateway_method" "GatewayMethod",
ADD COLUMN     "provider_order_id" TEXT;

-- AlterTable
ALTER TABLE "Tranzaktion" ADD COLUMN     "gateway_method" "GatewayMethod",
ADD COLUMN     "provider_order_id" TEXT;

-- CreateIndex
CREATE INDEX "PremiumTransaction_provider_order_id_idx" ON "PremiumTransaction"("provider_order_id");

-- CreateIndex
CREATE INDEX "Tranzaktion_provider_order_id_idx" ON "Tranzaktion"("provider_order_id");
