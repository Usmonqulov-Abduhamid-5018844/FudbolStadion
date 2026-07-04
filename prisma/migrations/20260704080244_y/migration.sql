-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_ownerId_fkey";

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
