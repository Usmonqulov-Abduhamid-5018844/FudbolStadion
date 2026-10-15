import { GatewayMethod } from '@prisma/client';

export const PAYMENT_PROVIDERS = [
  {
    key: GatewayMethod.CLICK,
    icon: '💳',
    translationKey: 'premium.payment.providers.click',
  },
  {
    key: GatewayMethod.PAYME,
    icon: '💰',
    translationKey: 'premium.payment.providers.payme',
  },
   {
    key: GatewayMethod.PAYLOV,
    icon: '🏦',
    translationKey: 'premium.payment.providers.paylov',
  },
  {
    key: GatewayMethod.UZUM,
    icon: '🟣',
    translationKey: 'premium.payment.providers.uzum',
  },
] as const;
