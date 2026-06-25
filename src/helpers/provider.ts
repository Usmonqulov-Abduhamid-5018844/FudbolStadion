import { PaymentProvider } from "./url_wrapper";

export const PAYMENT_PROVIDERS = [
  {
    key: PaymentProvider.CLICK,
    icon: '💳',
    translationKey: 'premium.payment.providers.click',
  },
//   {
//     key: PaymentProvider.PAYME,
//     icon: '💰',
//     translationKey: 'premium.payment.providers.payme',
//   },
//   {
//     key: PaymentProvider.PAYNET,
//     icon: '🏦',
//     translationKey: 'premium.payment.providers.paynet',
//   },
//   {
//     key: PaymentProvider.UZUM,
//     icon: '🟣',
//     translationKey: 'premium.payment.providers.uzum',
//   },
] as const;