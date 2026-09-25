
import axios from 'axios';

export const gerPremiumPaymentOctoUrl = async (
  amount: number,
  transactionId: string,
  lang: string,
  description:string
) => {


  const response = await axios.post(`${process.env.OCTO_BASE_URL}prepare_payment`,
    {
      octo_shop_id: Number(process.env.OCTO_SHOP_ID),
      octo_secret: process.env.OCTO_SECRET,

      shop_transaction_id: `premium_${transactionId}`,

      auto_capture: true,
      test: true,

      init_time: new Date().toISOString().slice(0, 19).replace('T', ' '),

      total_sum: amount,
      currency: 'UZS',

      description: description,

      return_url: `https://t.me/${process.env.BOT_USERNAME}?start=paymentPremium_success_${transactionId}`,

      notify_url: `${process.env.OCTO_NOTIFY_URL}`,
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


export const generateOctoBookingPaymentUrl = async (
  amount: number,
  transactionId: string,
  lang: string,
  description: string,
) => {
  const response = await axios.post(
    `${process.env.OCTO_BASE_URL}prepare_payment`,
    {
      octo_shop_id: Number(process.env.OCTO_SHOP_ID),
      octo_secret: process.env.OCTO_SECRET,

      shop_transaction_id: `booking_${transactionId}`,

      auto_capture: true,
      test: true,

      init_time: new Date().toISOString().slice(0, 19).replace('T', ' '),

      total_sum: amount,
      currency: 'UZS',

      description: description,

      return_url: `https://t.me/${process.env.BOT_USERNAME}?start=paymentBooking_success_${transactionId}`,

      notify_url: `${process.env.OCTO_NOTIFY_URL}`,
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
