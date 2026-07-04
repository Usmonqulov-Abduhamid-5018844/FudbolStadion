export type NotificationSettings_type = {
  BOOKING_CONFIRMED: boolean;
  PAYMENT_RECEIVED: boolean;
  CANCELLED_BOOKINGS: boolean;
  DAILY_REPORT: boolean;
  WEEKLY_STATS: boolean;
  PREMIUM_EXPIRY: boolean;
};
export const DefaultNotificationSettings: NotificationSettings_type = {
  BOOKING_CONFIRMED: true,
  PAYMENT_RECEIVED: false,
  CANCELLED_BOOKINGS: false,
  DAILY_REPORT: false,
  WEEKLY_STATS: false,
  PREMIUM_EXPIRY: true,
};

export const NotificationNames = {
  BOOKING_CONFIRMED: {
    uz: '🏟 Yangi bron',
    ru: '🏟 Новое бронирование',
    en: '🏟 New booking',
  },

  PAYMENT_RECEIVED: {
    uz: "💰 To'lov qabul qilindi",
    ru: '💰 Платеж получен',
    en: '💰 Payment received',
  },

  CANCELLED_BOOKINGS: {
    uz: '❌ Bron bekor qilindi',
    ru: '❌ Бронирование отменено',
    en: '❌ Booking cancelled',
  },

  DAILY_REPORT: {
    uz: '📊 Kunlik hisobot',
    ru: '📊 Ежедневный отчет',
    en: '📊 Daily report',
  },

  WEEKLY_STATS: {
    uz: '📈 Haftalik statistika',
    ru: '📈 Недельная статистика',
    en: '📈 Weekly statistics',
  },

  PREMIUM_EXPIRY: {
    uz: '⭐ Premium muddati tugamoqda',
    ru: '⭐ Срок Premium истекает',
    en: '⭐ Premium is expiring',
  },
} as const;

export const NotificationLabels = {
  BOOKING_CONFIRMED: {
    uz: '🏟 Bronlar',
    ru: '🏟 Бронирования',
    en: '🏟 Bookings',
  },

  PAYMENT_RECEIVED: {
    uz: '💰 To‘lovlar',
    ru: '💰 Платежи',
    en: '💰 Payments',
  },

  CANCELLED_BOOKINGS: {
    uz: '❌ Bekor qilingan',
    ru: '❌ Отменённые',
    en: '❌ Cancelled',
  },

  DAILY_REPORT: {
    uz: '📊 Kunlik hisobot',
    ru: '📊 Ежедневный отчет',
    en: '📊 Daily report',
  },

  WEEKLY_STATS: {
    uz: '📈 Haftalik statistika',
    ru: '📈 Недельная статистика',
    en: '📈 Weekly stats',
  },

  PREMIUM_EXPIRY: {
    uz: '⭐ Premium ogohlantirish',
    ru: '⭐ Premium уведомление',
    en: '⭐ Premium alert',
  },
} as const;
