import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Admin_S, AdvertisementStatus, NotificationType } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { formatDate } from 'src/helpers/dateFormat';
import { buildDailyReport, renderDailyReport } from 'src/helpers/day_state';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DefaultNotificationSettings,
  NotificationSettings_type,
} from 'src/types/notifikation';
import { Telegraf } from 'telegraf';

@Injectable()
export class CronService {
  private readonly channels = (process.env.CHANNEL_ID ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly prisma: PrismaService,
    private readonly notifikationService: NotifikationService,
    private readonly i18n: I18nService,
    private readonly logger: Logger,
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

  @Cron(CronExpression.EVERY_5_MINUTES)
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

    try {
      const expiredSubscriptions = await this.prisma.subscription.findMany({
        where: {
          isActive: true,
          endDate: {
            lt: now,
          },
        },
        select: {
          ownerId: true,
        },
      });

      if (!expiredSubscriptions.length) {
        return;
      }

      const ownerIds = expiredSubscriptions.map(
        (subscription) => subscription.ownerId,
      );

      await this.prisma.$transaction([
        this.prisma.subscription.updateMany({
          where: {
            ownerId: {
              in: ownerIds,
            },
            isActive: true,
            endDate: {
              lt: now,
            },
          },
          data: {
            isActive: false,
          },
        }),

        this.prisma.owners.updateMany({
          where: {
            id: {
              in: ownerIds,
            },
          },
          data: {
            notificationSettings: DefaultNotificationSettings,
          },
        }),
      ]);
    } catch (error) {
      console.error('Deactivate expired subscriptions error:', error);
    }
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
                title: this.i18n.translate(
                  'notification.notification.premium_expiry.title',
                  {
                    lang: 'uz',
                    args: {
                      daysLeft,
                    },
                  },
                ),
                message: this.i18n.translate(
                  'notification.notification.premium_expiry.message',
                  {
                    lang: 'uz',
                    args: {
                      endDate: formatDate(subscription.endDate, 'uz'),
                    },
                  },
                ),
              },

              ru: {
                title: this.i18n.translate(
                  'notification.notification.premium_expiry.title',
                  {
                    lang: 'ru',
                    args: {
                      daysLeft,
                    },
                  },
                ),
                message: this.i18n.translate(
                  'notification.notification.premium_expiry.message',
                  {
                    lang: 'ru',
                    args: {
                      endDate: formatDate(subscription.endDate, 'ru'),
                    },
                  },
                ),
              },

              en: {
                title: this.i18n.translate(
                  'notification.notification.premium_expiry.title',
                  {
                    lang: 'en',
                    args: {
                      daysLeft,
                    },
                  },
                ),
                message: this.i18n.translate(
                  'notification.notification.premium_expiry.message',
                  {
                    lang: 'en',
                    args: {
                      endDate: formatDate(subscription.endDate, 'en'),
                    },
                  },
                ),
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

  @Cron(CronExpression.EVERY_DAY_AT_8AM, {
    timeZone: 'Asia/Tashkent',
  })
  async sendDailyReports() {
    const now = new Date();

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const owners = await this.prisma.owners.findMany({
      where: {
        status: Admin_S.ACTIVE,
        subscriptions: {
          some: {
            isActive: true,
          },
        },
        notificationSettings: {
          path: ['DAILY_REPORT'],
          equals: true,
        },
      },
      select: {
        id: true,
        chatID: true,
      },
    });

    for (const owner of owners) {
      try {
        const bookings = await this.prisma.booking.findMany({
          where: {
            stadion: {
              owner_id: owner.id,
            },
            createdAt: {
              gte: start,
              lte: end,
            },
          },
          include: { stadion: { select: { name: true } } },
        });

        const report = buildDailyReport(bookings);

        const session = await this.prisma.sesion.findUnique({
          where: {
            chat_id: owner.chatID,
          },
        });

        const lang = session?.lang ?? 'uz';

        await this.prisma.notification.create({
          data: {
            type: NotificationType.DAILY_REPORT,
            ownerId: owner.id,
            translations: {
              uz: renderDailyReport(report, 'uz'),
              ru: renderDailyReport(report, 'ru'),
              en: renderDailyReport(report, 'en'),
            },
          },
        });

        const { title, message } = renderDailyReport(report, lang);

        await this.bot.telegram.sendMessage(
          owner.chatID,
          `<b>${title}</b>\n\n${message}`,
          {
            parse_mode: 'HTML',
          },
        );
      } catch (err) {}
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    timeZone: 'Asia/Tashkent',
  })
  async advertisement_expired() {
    try {
      const now = new Date();

      const { count } = await this.prisma.advertisement.updateMany({
        where: {
          status: AdvertisementStatus.ACTIVE,
          expiresAt: {
            lte: now,
          },
        },
        data: {
          status: AdvertisementStatus.EXPIRED,
        },
      });
    } catch (error) {
      console.log('Reklama muddatini tekshirishda xatolik');
    }
  }
  @Cron(CronExpression.EVERY_HOUR)
  async advertisementSend() {
    const now = new Date();

    const MAX_SEND_PER_DAY = 2;
    const intervalHours = 24 / MAX_SEND_PER_DAY;

    const lastAllowed = new Date(
      now.getTime() - intervalHours * 60 * 60 * 1000,
    );

    try {
      const advertisement = await this.prisma.advertisement.findFirst({
        where: {
          status: 'ACTIVE',
          expiresAt: {
            gt: now,
          },
          OR: [
            {
              lastSentAt: null,
            },
            {
              lastSentAt: {
                lte: lastAllowed,
              },
            },
          ],
        },
        include: {
          stadion: true,
          owner: true,
        },
        orderBy: [
          {
            lastSentAt: 'asc',
          },
          {
            channelSentCount: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
      });

      if (!advertisement) {
        return;
      }

      const ownerLang = await this.prisma.sesion.findUnique({
        where: { chat_id: advertisement.owner.chatID },
      });
      const text = this.i18n.translate('advertisement.book_stadium', {
        lang: ownerLang?.lang ? ownerLang.lang : 'uz',
      });
      const bookingUrl = `https://t.me/${process.env.BOT_USERNAME}?start=stadionBooking_${advertisement.id}`;
      

      const reply_markup = {
        inline_keyboard: [
          [
            {
              text,
              url: bookingUrl,
            },
          ],
        ],
      };

      const caption = `
📢 <b>${advertisement.title}</b>

${advertisement.description}

🏟 <b>${advertisement.stadion.name}</b>
`;

      let successCount = 0;

      for (const channelId of this.channels) {
        try {
          if (advertisement.image) {
            await this.bot.telegram.sendPhoto(channelId, advertisement.image, {
              caption,
              parse_mode: 'HTML',
              reply_markup,
            });
          } else {
            await this.bot.telegram.sendMessage(channelId, caption, {
              parse_mode: 'HTML',
              reply_markup,
            });
          }

          successCount++;
        } catch (error) {
          this.logger.error(`Kanal ${channelId} ga reklama yuborilmadi`, error);
        }
      }
      if (successCount > 0) {
        await this.prisma.advertisement.update({
          where: {
            id: advertisement.id,
          },
          data: {
            lastSentAt: now,
            channelSentCount: {
              increment: successCount,
            },
          },
        });
      }
    } catch (error) {
      this.logger.error('Advertisement cron xatoligi', error);
    }
  }
}
