-- AlterTable
ALTER TABLE "Stadion" ALTER COLUMN "working_status" SET DEFAULT false;

-- AlterTable
ALTER TABLE "sesion" ADD COLUMN     "advertisementId" INTEGER,
ADD COLUMN     "stadionId" INTEGER;
