-- CreateEnum
CREATE TYPE "FiscalType" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" UUID NOT NULL,
    "tranzaktion_id" UUID NOT NULL,
    "type" "FiscalType" NOT NULL,
    "status" "FiscalStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "receipt_url" TEXT,
    "provider_data" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalReceipt_status_next_attempt_at_idx" ON "FiscalReceipt"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_tranzaktion_id_type_key" ON "FiscalReceipt"("tranzaktion_id", "type");

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_tranzaktion_id_fkey" FOREIGN KEY ("tranzaktion_id") REFERENCES "Tranzaktion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
