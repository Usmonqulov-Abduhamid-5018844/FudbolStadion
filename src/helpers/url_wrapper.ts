import { getPremiumPaymentClickUrl } from "./url_click";
import { generateOctoPaymentUrl } from "./url_octo";
import { getPremiumPaymentPaymeUrl } from "./url_payme";
import { getPremiumPaymentPaynetUrl } from "./url_paynet";
import { getPremiumPaymentUzumUrl } from "./url_uzum";

export enum PaymentProvider {
  CLICK = 'CLICK',
  PAYME = 'PAYME',
  PAYNET = 'PAYNET',
  OCTO = "OCTO",
  UZUM = 'UZUM',
}
export const PAYMENT_URL_GENERATORS = {
  [PaymentProvider.CLICK]: getPremiumPaymentClickUrl,
  [PaymentProvider.PAYME]: getPremiumPaymentPaymeUrl,
  [PaymentProvider.PAYNET]: getPremiumPaymentPaynetUrl,
  [PaymentProvider.UZUM]: getPremiumPaymentUzumUrl,
  [PaymentProvider.OCTO]: generateOctoPaymentUrl,
} as const;