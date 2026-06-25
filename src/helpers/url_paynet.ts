export const getPremiumPaymentPaynetUrl = (
  amount: number,
  transactionId: number,
  plan: string,
  fullName: string,
  lang: string,
): string => {
  const baseUrl = 'https://paynet.uz/pay';

  const params = new URLSearchParams({
    service_id: process.env.PAYNET_SERVICE_ID!,
    amount: String(amount),
    transaction_id: String(transactionId),
    description: `Premium ${plan} - ${fullName}`,
    return_url: process.env.PAYNET_RETURN_URL || '',
  });

  return `${baseUrl}?${params.toString()}`;
};