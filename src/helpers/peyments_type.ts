import { Payments } from '@prisma/client';

export const getPaymentText = (
  payments_type: Payments,
  lang: string,
  i18n: any,
) => {
  switch (payments_type) {
    case 'CASH':
      return i18n['cash'][lang];
    case 'CARD':
      return i18n['card'][lang];
    case 'GIBRID':
      return i18n['both'][lang];
    default:
      return payments_type;
  }
};
