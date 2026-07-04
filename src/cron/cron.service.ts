import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { BotService } from 'src/bot/bot.service';
import { formatDate } from 'src/helpers/dateFormat';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DefaultNotificationSettings,
  NotificationSettings_type,
} from 'src/types/notifikation';

@Injectable()
export class CronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifikationService:NotifikationService
  ) {}
  private isCancelRunning = false;
  private isNoShowRunning = false;
  private isCompletedRunning = false;
  private isPayLaterCancelRunning = false;
  private isDeleteTransactionRunning = false;

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredBookings() {
    if (this.isCancelRunning) return;
    this.isCancelRunning = true;
    const now = new Date();
    try {
      const result = await this.prisma.booking.updateMany({
        where: {
          status: 'PENDING',
          status_pay_later: false,
          expires_at: {
            lt: now,
          },
        },
        data: { status: 'CANCELED' },
      });
    } catch (error) {
    } finally {
      this.isCancelRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async no_showBooking() {
    if (this.isNoShowRunning) return;
    this.isNoShowRunning = true;

    try {
      const now = new Date();

      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: ['CONFIRMED', 'PAID'] },
          endAt: { lte: now },
          check_in: false,
        },
        data: { status: 'NOSHOW' },
      });
    } catch (error) {
    } finally {
      this.isNoShowRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async bookingCompleted() {
    if (this.isCompletedRunning) return;
    this.isCompletedRunning = true;

    try {
      const now = new Date();

      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: ['CONFIRMED', 'PAID'] },
          endAt: { lte: now },
          check_in: true,
        },
        data: { status: 'COMPLETED' },
      });
    } catch (error) {
    } finally {
      this.isCompletedRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async bookingCancel() {
    if (this.isPayLaterCancelRunning) return;
    this.isPayLaterCancelRunning = true;
    try {
      const now = new Date();

      await this.prisma.booking.updateMany({
        where: {
          status: 'PENDING',
          startAt: {
            lte: new Date(now.getTime() + 60 * 60 * 1000),
          },
          status_pay_later: true,
        },
        data: { status: 'CANCELED' },
      });
    } catch (error) {
    } finally {
      this.isPayLaterCancelRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async deleteTransaction() {
    const now = new Date();
    if (this.isDeleteTransactionRunning) return;
    this.isDeleteTransactionRunning = true;
    try {
      await this.prisma.premiumTransaction.deleteMany({
        where: {
          status: 'PENDING',
          createdAt: {
            lt: new Date(now.getTime() - 10 * 60 * 1000),
          },
        },
      });
    } catch (error) {
    } finally {
      this.isDeleteTransactionRunning = false;
    }
  }
  @Cron(CronExpression.EVERY_HOUR)
  async deactivateExpiredSubscriptions() {
    const now = new Date();
    await this.prisma.subscription.updateMany({
      where: {
        isActive: true,
        endDate: {
          lt: now,
        },
      },
      data: {
        isActive: false,
      },
    });
  }
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async premiumExpiryReminder() {
    try {
      const now = new Date();

      const targetStart = new Date(now);
      targetStart.setDate(targetStart.getDate() + 3);
      targetStart.setHours(0, 0, 0, 0);

      const targetEnd = new Date(targetStart);
      targetEnd.setHours(23, 59, 59, 999);

      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          isActive: true,
          endDate: {
            gte: targetStart,
            lte: targetEnd,
          },
        },
        include: {
          owner: {
            select: {
              id: true,
              chatID: true,
              notificationSettings: true,
            },
          },
        },
      });

      for (const subscription of subscriptions) {
        const settings: NotificationSettings_type = {
          ...DefaultNotificationSettings,
          ...(subscription.owner
            .notificationSettings as Partial<NotificationSettings_type>),
        };

        if (!settings.PREMIUM_EXPIRY) {
          continue;
        }
        const exists = await this.prisma.notification.findFirst({
          where: {
            ownerId: subscription.ownerId,
            type: NotificationType.PREMIUM_EXPIRY,
            data: {
              path: ['subscriptionId'],
              equals: subscription.id,
            },
          },
        });

        if (exists) continue;

        const diffTime = subscription.endDate.getTime() - now.getTime();

        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const notification = await this.prisma.notification.create({
          data: {
            ownerId: subscription.ownerId,
            type: NotificationType.PREMIUM_EXPIRY,
            translations: {
              uz: {
                title: `⭐ Premium obunangiz tugashiga ${daysLeft} kun qoldi.`,
                message: `Premium xizmatlaridan uzluksiz foydalanishni davom ettirish uchun obunangizni muddatidan oldin yangilashingizni tavsiya qilamiz.

📅 Tugash sanasi: ${formatDate(subscription.endDate, 'uz')}`,
              },

              ru: {
                title: `⭐ До окончания вашей Premium-подписки осталось ${daysLeft} дня.`,
                message: `Чтобы продолжить пользоваться всеми преимуществами Premium без перерыва, рекомендуем заранее продлить подписку.

📅 Дата окончания: ${formatDate(subscription.endDate, 'ru')}`,
              },

              en: {
                title: `⭐ Your Premium subscription will expire in ${daysLeft} days.`,
                message: `To continue enjoying all Premium features without interruption, we recommend renewing your subscription before it expires.

📅 Expiration date: ${formatDate(subscription.endDate, 'en')}`,
              },
            },
            data: {
              subscriptionId: subscription.id,
              endDate: subscription.endDate,
            },
          },
        });
        await this.notifikationService.sendNotification(
          subscription.owner.chatID,
          notification.id,
        );
      }
    } catch (error) {
      console.error(error);
    }
  }
}
