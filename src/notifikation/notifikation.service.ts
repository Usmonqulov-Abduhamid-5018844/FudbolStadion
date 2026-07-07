import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { formatDate } from 'src/helpers/dateFormat';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DefaultNotificationSettings,
  NotificationSettings_type,
} from 'src/types/notifikation';
import { Telegraf } from 'telegraf';

@Injectable()
export class NotifikationService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly prisma: PrismaService,
  ) {}

  async bookingConfirmentNotifikation(bookingId: number, ownerId: number) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: {
          id: ownerId,
        },
        select: {
          chatID: true,
        },
      });

      if (!owner) return;

      const booking = await this.prisma.booking.findUnique({
        where: {
          id: bookingId,
        },
        include: {
          stadion: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!booking) return;

      const notification = await this.prisma.notification.create({
        data: {
          ownerId,
          relatedBookingId: bookingId,
          type: NotificationType.BOOKING_CONFIRMED,
          translations: {
            uz: {
              title: '✅ Bron tasdiqlandi',
              message: `Yangi bron tasdiqlandi.

🎫 Bron ID: #${booking.id}

🏟 Stadion: ${booking.stadion.name}

📅 Sana: ${formatDate(booking.date, 'uz')}

🕒 Vaqt: ${booking.start_time} - ${booking.end_time}

Mijozni belgilangan vaqtda kutib oling.`,
            },
            ru: {
              title: '✅ Бронирование подтверждено',
              message: `Новое бронирование подтверждено.

🎫 ID бронирования: #${booking.id}

🏟 Стадион: ${booking.stadion.name}

📅 Дата: ${formatDate(booking.date, 'ru')}

🕒 Время: ${booking.start_time} - ${booking.end_time}

Пожалуйста, ожидайте клиента в назначенное время.`,
            },
            en: {
              title: '✅ Booking Confirmed',
              message: `A new booking has been confirmed.

🎫 Booking ID: #${booking.id}

🏟 Stadium: ${booking.stadion.name}

📅 Date: ${formatDate(booking.date, 'en')}

🕒 Time: ${booking.start_time} - ${booking.end_time}

Please be ready to welcome the customer at the scheduled time.`,
            },
          },
        },
      });

      await this.sendNotification(owner.chatID, notification.id);
    } catch (error) {
      console.error('bookingConfirmentNotifikation:', error);
    }
  }
  
  async bookingCanceledNotifikation(bookingId: number, ownerId: number) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: {
          id: ownerId,
        },
        select: {
          chatID: true,
        },
      });

      if (!owner) return;

      const booking = await this.prisma.booking.findUnique({
        where: {
          id: bookingId,
        },
        include: {
          stadion: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!booking) return;

      const notification = await this.prisma.notification.create({
        data: {
          ownerId,
          relatedBookingId: bookingId,
          type: NotificationType.CANCELLED_BOOKINGS,
          translations: {
            uz: {
              title: '❌ Bron bekor qilindi',
              message: `Bron bekor qilindi.

🎫 Bron ID: #${booking.id}

🏟 Stadion: ${booking.stadion.name}

📅 Sana: ${formatDate(booking.date, 'uz')}

🕒 Vaqt: ${booking.start_time} - ${booking.end_time}

Bu vaqt oralig'i endi boshqa mijozlar uchun bron qilishga ochiq.`,
            },

            ru: {
              title: '❌ Бронирование отменено',
              message: `Бронирование было отменено.

🎫 ID бронирования: #${booking.id}

🏟 Стадион: ${booking.stadion.name}

📅 Дата: ${formatDate(booking.date, 'ru')}

🕒 Время: ${booking.start_time} - ${booking.end_time}

Теперь это время снова доступно для бронирования другими клиентами.`,
            },

            en: {
              title: '❌ Booking Cancelled',
              message: `A booking has been cancelled.

🎫 Booking ID: #${booking.id}

🏟 Stadium: ${booking.stadion.name}

📅 Date: ${formatDate(booking.date, 'en')}

🕒 Time: ${booking.start_time} - ${booking.end_time}

This time slot is now available for other customers to book.`,
            },
          },
        },
      });

      await this.sendNotification(owner.chatID, notification.id);
    } catch (error) {
      console.error('bookingCanceledNotifikation:', error);
    }
  }

  async sendNotification(chatId: string, notificationId: number) {
    try {
      const session = await this.prisma.sesion.findUnique({
        where: { chat_id: chatId },
        select: { lang: true },
      });

      const owner = await this.prisma.owners.findUnique({
        where: { chatID: chatId },
        select: {
          notificationSettings: true,
        },
      });

      if (!owner) return;

      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          type: true,
          translations: true,
        },
      });

      if (!notification) return;

      const settings: NotificationSettings_type = {
        ...DefaultNotificationSettings,
        ...(owner.notificationSettings as Partial<NotificationSettings_type>),
      };

      if (!settings[notification.type]) {
        return;
      }

      const lang = session?.lang ?? 'uz';

      const translations = notification.translations as {
        [key: string]: {
          title: string;
          message: string;
        };
      };

      const current = translations[lang] ?? translations['uz'];

      if (!current) return;

      await this.bot.telegram.sendMessage(
        chatId,
        `*${current.title}*\n\n${current.message}`,
        {
          parse_mode: 'Markdown',
        },
      );

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }
}
