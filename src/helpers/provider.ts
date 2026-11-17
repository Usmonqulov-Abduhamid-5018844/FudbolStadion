import { GatewayMethod } from '@prisma/client';

export const PAYMENT_PROVIDERS = [
  { key: GatewayMethod.CLICK,  icon: '💳', translationKey: 'premium.payment.providers.click' },
  { key: GatewayMethod.PAYME,  icon: '💰', translationKey: 'premium.payment.providers.payme' },
  { key: GatewayMethod.PAYLOV, icon: '🏦', translationKey: 'premium.payment.providers.paylov' },
  { key: GatewayMethod.UZUM,   icon: '🟣', translationKey: 'premium.payment.providers.uzum' },
  { key: GatewayMethod.CARD,   icon: '💳', translationKey: 'premium.payment.providers.card' },
  { key: GatewayMethod.UZQR,   icon: '📱', translationKey: 'premium.payment.providers.uzqr' },
  { key: GatewayMethod.ALIF,   icon: '🟠', translationKey: 'premium.payment.providers.alif' },
] as const;
