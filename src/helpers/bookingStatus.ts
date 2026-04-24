export const statusMap = (status: string,i18n:any, lang: string) => ({
  COMPLETED: i18n.translate('bookingHistory.booking_status.completed', { lang }),
  NOSHOW: i18n.translate('bookingHistory.booking_status.no_show', { lang }),
  CANCELED: i18n.translate('bookingHistory.booking_status.canceled', { lang }),
  REFUNDED: i18n.translate('bookingHistory.booking_status.refunded', { lang }),
  CONFIRMED: i18n.translate('bookingHistory.booking_status.confirmed', { lang }),
  PAID: i18n.translate("bookingHistory.booking_status.paid", { lang }),
  PENDING: i18n.translate("bookingHistory.booking_status.pending", { lang }),

}[status] || status);