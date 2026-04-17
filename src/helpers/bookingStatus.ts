export const statusMap = (status: string,i18n:any, lang: string) => ({
  COMPLETED: i18n.translate('bookingHestory.booking_status.completed', { lang }),
  NO_SHOW: i18n.translate('bookingHestory.booking_status.no_show', { lang }),
  CANCELED: i18n.translate('bookingHestory.booking_status.canceled', { lang }),
  REFUNDED: i18n.translate('bookingHestory.booking_status.refunded', { lang }),
  CONFIRMED: i18n.translate('bookingHestory.booking_status.confirmed', { lang }),
  PAID: i18n.translate("bookingHestory.booking_status.paid", { lang }),
  PENDING: i18n.translate("bookingHestory.booking_status.pending", { lang }),

}[status] || status);