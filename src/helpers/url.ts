

export const getPaymentClickUrl = (
  total: number,
  transactionId: number,
) => {
  const merchantId =
    process.env.CLICK_MERCHANT_ID;

  const callbackUrl =
    `${process.env.BACKEND_URL}/payment/click-webhook`;

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
  transactionId: number,
  plan: string,
  ownerName: string,
  lang:string
) => {
  const merchantId = process.env.CLICK_MERCHANT_ID;

  const callbackUrl =
    `${process.env.BACKEND_URL}/payment/click-premium-webhook`;

  const description = encodeURIComponent(
    `Premium obuna (${plan}) - ${ownerName}`,
  );

  return (
    `https://my.click.uz/pay` +
    `?merchant_id=${merchantId}` +
    `&amount=${amount}` +
    `&transaction_id=${transactionId}` +
    `&description=${description}` +
    `&callback_url=${encodeURIComponent(callbackUrl)}`
  );
};


export const getPaymentCardUrl = (
  ownerId: number,
) => {
  return (
    `https://my.click.uz/pay` +
    `?merchant_id=${process.env.CLICK_MERCHANT_ID}` +
    `&amount=0` +
    `&transaction_id=${ownerId}` +
    `&callback_url=${encodeURIComponent(
      `${process.env.BACKEND_URL}/payment/addCard-webhook`
    )}`
  );
};

export const getLocation = (
  latitude: number,
  longitude: number,
  regionName: string,
  regionItemName: string,
) => {
  return `<a href="https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}">${regionName}, ${regionItemName}</a>`;
};
