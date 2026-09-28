import { Booking_status } from "@prisma/client";

export const statusMap = (status: Booking_status, i18n: any, lang: string) =>
  ({
    COMPLETED: i18n.translate('bookingHistory.booking_status.completed', {
      lang,
    }),
    NOSHOW: i18n.translate('bookingHistory.booking_status.no_show', { lang }),
    CANCELED: i18n.translate('bookingHistory.booking_status.canceled', {
      lang,
    }),
    REFUNDED: i18n.translate('bookingHistory.booking_status.refunded', {
      lang,
    }),
    CONFIRMED: i18n.translate('bookingHistory.booking_status.confirmed', {
      lang,
    }),
    PAID: i18n.translate('bookingHistory.booking_status.paid', { lang }),
    PENDING: i18n.translate('bookingHistory.booking_status.pending', { lang }),
    REFUND_PENDING: i18n.translate('bookingHistory.booking_status.refund_pending',{lang})
  })[status] || status;
