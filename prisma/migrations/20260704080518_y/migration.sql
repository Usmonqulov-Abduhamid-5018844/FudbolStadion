-- DropForeignKey
ALTER TABLE "PremiumTransaction" DROP CONSTRAINT "PremiumTransaction_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "PremiumTransaction" DROP CONSTRAINT "PremiumTransaction_subscription_id_fkey";

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumTransaction" ADD CONSTRAINT "PremiumTransaction_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
