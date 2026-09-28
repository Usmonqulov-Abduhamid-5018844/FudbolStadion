import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const logger = new Logger('ClickHelper');

export const getPremiumPaymentClickUrl = (
  amount: number,
  transactionId: string,
  plan: string,
  fullName: string,
  lang: string,
): string => {
  const baseUrl = 'https://my.click.uz/services/pay';

  const serviceId = process.env.CLICK_SERVICE_ID!;
  const merchantId = process.env.CLICK_MERCHANT_ID!;
  const secretKey = process.env.CLICK_SECRET_KEY!;

  const signString = `${serviceId}${merchantId}${transactionId}${amount}${secretKey}`;
  const sign = crypto.createHash('md5').update(signString).digest('hex');

  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(amount),
    transaction_param: transactionId,
    return_url: process.env.CLICK_RETURN_URL || '',
    sign,
  });

  return `${baseUrl}?${params.toString()}`;
};

export const getPaymentCardUrl = (ownerId: number) => {
  return (
    `https://my.click.uz/pay` +
    `?merchant_id=${process.env.CLICK_MERCHANT_ID}` +
    `&amount=0` +
    `&transaction_id=${ownerId}` +
    `&callback_url=${encodeURIComponent(
      `${process.env.BACKEND_URL}/payment/addCard-webhook`,
    )}`
  );
};

export const refundClickPayment = async (
  providerTransactionId: string,
  amount: number,
): Promise<boolean> => {
  logger.warn(
    `refundClickPayment hali to'liq yozilmagan (tx: ${providerTransactionId}, summa: ${amount})`,
  );
  return false;
};
