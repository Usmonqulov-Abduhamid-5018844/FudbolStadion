import { Payments } from '@prisma/client';

export const getPaymentText = (
  payments_type: Payments,
  i18nObj: any,
) => {
  switch (payments_type) {
    case 'CASH':
      return i18nObj.cash;
    case 'CARD':
      return i18nObj.card;
    case 'GIBRID':
      return i18nObj.both;
    default:
      return payments_type;
  }
};
