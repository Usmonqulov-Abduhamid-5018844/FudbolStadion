import * as crypto from 'crypto';

export const getPaymentClickUrl = (total: number, transactionId: string) => {
  const merchantId = process.env.CLICK_MERCHANT_ID;

  const callbackUrl = `${process.env.BACKEND_URL}/payment/click-webhook`;

  return (
    `https://my.click.uz/pay` +
    `?merchant_id=${merchantId}` +
    `&amount=${total}` +
    `&transaction_id=${transactionId}` +
    `&callback_url=${encodeURIComponent(callbackUrl)}`
  );
};

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
