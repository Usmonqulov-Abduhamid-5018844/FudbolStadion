import axios from 'axios';
import { getPremiumPaymentDescription, PremiumPlan } from './interface';

export const generateOctoPaymentUrl = async (
  amount: number,
  transactionId: string,
  plan: PremiumPlan,
  ownerName: string,
  lang: string,
  type: string,
  description:string
) => {


  const response = await axios.post(
    'https://secure.octo.uz/prepare_payment',
    {
      octo_shop_id: Number(process.env.OCTO_SHOP_ID),
      octo_secret: process.env.OCTO_SECRET,

      shop_transaction_id: `${type}_${transactionId}`,

      auto_capture: true,
      test: true,

      init_time: new Date().toISOString().slice(0, 19).replace('T', ' '),

      total_sum: amount,
      currency: 'UZS',

      description: description,

      return_url: `https://t.me/stadionbronTestbot?start=payment_success_${transactionId}`,

      notify_url:
        'https://d323-188-113-233-153.ngrok-free.app/payment/octo-webhook',

      language: lang,
      ttl: 5,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  if (response.data?.error !== 0) {
    throw new Error(`OCTO error: ${JSON.stringify(response.data)}`);
  }

  return response.data.data.octo_pay_url;
};
