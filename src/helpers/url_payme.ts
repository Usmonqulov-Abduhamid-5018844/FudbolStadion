import * as crypto from 'crypto';

export const getPremiumPaymentPaymeUrl = (
  amount: number,
  transactionId: string,
  plan: string,
  fullName: string,
  lang: string,
): string => {
  const baseUrl = 'https://checkout.paycom.uz';

  const merchantId = process.env.PAYME_MERCHANT_ID!;
  const secretKey = process.env.PAYME_SECRET_KEY!;

  const params = {
    m: merchantId,
    ac: {
      transaction_id: transactionId,
      amount: amount * 100, // payme tiyin (1 so'm = 100 tiyin)
      plan,
      user: fullName,
    },
  };

  const encoded = Buffer.from(JSON.stringify(params)).toString('base64');

  const sign = crypto
    .createHash('sha256')
    .update(encoded + secretKey)
    .digest('hex');

  return `${baseUrl}/${encoded}?sign=${sign}`;
};