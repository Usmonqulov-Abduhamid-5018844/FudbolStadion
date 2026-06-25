export const getPremiumPaymentUzumUrl = (
  amount: number,
  transactionId: number,
  plan: string,
  fullName: string,
  lang: string,
): string => {
  const baseUrl = 'https://checkout.uzum.uz/pay';

  const params = new URLSearchParams({
    merchant_id: process.env.UZUM_MERCHANT_ID!,
    amount: String(amount),
    order_id: String(transactionId),
    description: `Premium ${plan}`,
    customer_name: fullName,
    return_url: process.env.UZUM_RETURN_URL || '',
  });

  return `${baseUrl}?${params.toString()}`;
};