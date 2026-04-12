

export const getPaymentUrl = (total: number, transaction: { id: number }) => {
  return `https://my.click.uz/pay?merchant_id=${process.env.CLICK_MERCHANT_ID}&amount=${total}&transaction_id=${transaction.id}&callback_url=${encodeURIComponent('https://your-server.com/click-webhook')}`;
};

export const getLocation = (
  latitude: number,
  longitude: number,
  regionName: string,
  regionItemName: string,
) => {
  return `<a href="https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}">${regionName}, ${regionItemName}</a>`;
};
