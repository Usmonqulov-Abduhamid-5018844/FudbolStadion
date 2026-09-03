export const addPaymentCommission = (
  amount: number,
  commissionPercent: number,
): number => {
  return Math.ceil(
    amount * (1 + commissionPercent / 100),
  );
};