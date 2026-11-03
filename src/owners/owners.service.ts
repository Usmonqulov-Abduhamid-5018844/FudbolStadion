import { Injectable, Logger } from '@nestjs/common';
import { AdvertisementStatus, Payments, Prisma } from '@prisma/client';
import { InlineKeyboardButton } from '@telegraf/types';
import { toZonedTime, format, formatInTimeZone } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { APP_TZ } from 'src/helpers/dateFormat';
import { ADVERTISEMENT } from 'src/common/constants/advertisement.constants';
import { statusMap } from 'src/helpers/bookingStatus';
import { MyContext } from 'src/helpers/bot.sesion';
import { formatDate, formatDateTime } from 'src/helpers/dateFormat';
import { IBooking, PLAN_LABELS, Premium_price } from 'src/helpers/interface';
import { ErrorContext } from 'src/helpers/interface/enum';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { getLocation } from 'src/helpers/lokationSeorch';
import { getPaymentText } from 'src/helpers/peyments_type';
import { getPremiumReasonText } from 'src/helpers/reason';
import { canOwnerAcceptCard, escapeHtml } from 'src/helpers/stadions';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DefaultNotificationSettings,
  NotificationLabels,
  NotificationSettings_type,
} from 'src/types/notifikation';
import { formatSum, UtilisService } from 'src/utils/utile.service';
import { Markup } from 'telegraf';

const STADION_LIMITS = { maxCount: 100, side: 300, price: 1_500_000 } as const;
const STADION_NAME_REGEX = /^[\p{L}\p{N}\s'’‘ʻʼ.-]{2,50}$/u;
const TIME_RANGE_REGEX =
  /^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const CAPTION_LIMIT = 1024;
const FILTER_YEARS = { min: 2026, max: 2060 } as const;
const AD_TITLE_MAX = 100;
const AD_DESCRIPTION_MAX = 1000;
const AD_CONTACT_PATTERNS = [
  /(^|\s)@[a-zA-Z0-9_]{5,32}\b/,
  /(https?:\/\/|www\.|[a-zA-Z0-9-]+\.(com|net|org|uz|ru|io|me|app|co|xyz|online|site|info|biz|dev|ai)\b)/i,
  /(\+?\d[\d\s\-()]{7,}\d)/,
];
const EMPTY_AD = () => ({
  title: null,
  description: null,
  image: null,
  stadionId: null,
  isAllStadiums: false,
});

const AD_LISTS: Partial<
  Record<
    AdvertisementStatus,
    {
      limit: number;
      empty: string;
      orderBy: Prisma.AdvertisementOrderByWithRelationInput[];
    }
  >
> = {
  ACTIVE: {
    limit: 1,
    empty: 'advertisement.no_active_ads',
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  PENDING: {
    limit: 1,
    empty: 'advertisement.no_pending_ads',
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  EXPIRED: {
    limit: 4,
    empty: 'advertisement.no_expired_ads',
    orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }],
  },
};

const PREMIUM_HISTORY: Record<string, { emoji: string; key: string }> = {
  PURCHASE: { emoji: '💳', key: 'purchase' },
  GIFT: { emoji: '🎁', key: 'gift' },
  COMPENSATION: { emoji: '🤝', key: 'compensation' },
  TRIAL: { emoji: '🎉', key: 'trial' },
};

@Injectable()
export class OwnersService {
  private readonly logger = new Logger(OwnersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly utils: UtilisService,
    private readonly botService: BotService,
  ) {}

  private tr(lang: string) {
    return (key: string, args?: Record<string, unknown>): string =>
      this.i18n.translate(key, { lang, args });
  }

  private normalizeUzPhone(raw: string): string | null {
    const compact = raw.replace(/[\s()-]/g, '');
    const m = /^(?:\+?998)?(\d{9})$/.exec(compact);
    return m ? `+998${m[1]}` : null;
  }

  private async ownedStadionId(ctx: MyContext): Promise<number | null> {
    const id = Number(ctx.session.stadion?.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    const found = await this.prisma.stadion.findFirst({
      where: { id, owner: { chatID: String(ctx.from?.id) } },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  private async readNumber(
    ctx: MyContext,
    lang: string,
    text: string,
    max: number,
  ): Promise<number | null> {
    const t = this.tr(lang);
    const input = text.trim();
    if (!/^\d{1,9}$/.test(input)) {
      await ctx.reply(t('error.number_error'));
      return null;
    }
    const value = Number(input);
    if (value <= 0) {
      await ctx.reply(t('error.positive_number'));
      return null;
    }
    if (value > max) {
      await ctx.reply(t('error.too_large'));
      return null;
    }
    return value;
  }

  private hasScheduleOverlap(
    existing: {
      day_of_week: number | string;
      start_time: string;
      end_time: string;
    }[],
    day: number,
    startMinutes: number,
    endMinutes: number,
  ): boolean {
    const DAY = 24 * 60;
    const WEEK = 7 * DAY;
    const interval = (d: number, s: number, e: number): [number, number] => [
      (d - 1) * DAY + s,
      (d - 1) * DAY + e + (e <= s ? DAY : 0),
    ];
    const [ns, ne] = interval(day, startMinutes, endMinutes);

    return existing.some((item) => {
      const [os, oe] = interval(
        Number(item.day_of_week),
        this.utils.toMinutes(item.start_time),
        this.utils.toMinutes(item.end_time),
      );
      return [-WEEK, 0, WEEK].some(
        (shift) => ns < oe + shift && ne > os + shift,
      );
    });
  }

  private async requireOwner(ctx: MyContext): Promise<{ id: number }> {
    const owner = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
      select: { id: true },
    });
    if (!owner) throw new Error(`Owner topilmadi: chatID=${ctx.from?.id}`);
    return owner;
  }

  async hasActivePremium(ownerId: number): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { ownerId, isActive: true, endDate: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(sub);
  }

  private async deleteTracked(
    ctx: MyContext,
    key: 'stadionMessages' | 'advertisements' | 'ownerActiveBooking',
  ): Promise<void> {
    const ids = ctx.session[key] ?? [];
    for (let i = 0; i < ids.length; i += 100) {
      await ctx.deleteMessages(ids.slice(i, i + 100)).catch(() => undefined);
    }
    ctx.session[key] = [];
  }

  private async replyTracked(
    ctx: MyContext,
    key: 'stadionMessages' | 'advertisements' | 'ownerActiveBooking',
    text: string,
    extra?: Parameters<MyContext['reply']>[1],
  ) {
    const sent = await ctx.reply(text, extra);
    const list = ctx.session[key] ?? [];
    list.push(sent.message_id);
    ctx.session[key] = list;
    return sent;
  }

  private trackUserMessage(ctx: MyContext): void {
    const id = ctx.message?.message_id;
    if (!id) return;
    const list = ctx.session.advertisements ?? [];
    list.push(id);
    ctx.session.advertisements = list;
  }

  private clearRegistorId(ctx: MyContext): void {
    if (ctx.session.owner_registor) ctx.session.owner_registor.id = null;
  }

  private btnJson(
    lang: string,
    key: string,
    type: string,
    id: number | null,
  ): InlineKeyboardButton {
    return {
      text: this.tr(lang)(key),
      callback_data: JSON.stringify({ type, id }),
    };
  }

  private mainMenuKeyboard(lang: string) {
    const t = this.tr(lang);
    return Markup.keyboard([
      [t('menyu_buttons.stadion'), t('menyu_buttons.bron')],
      [t('menyu_buttons.settings'), t('menyu_buttons.help')],
      [t('menyu_buttons.card')],
    ])
      .resize()
      .oneTime();
  }

  private paymentTypeKeyboard(lang: string): InlineKeyboardButton[][] {
    const t = this.tr(lang);
    return [
      [
        {
          text: t('stadions.card'),
          callback_data: `payments_${Payments.CARD}`,
        },
      ],
      [
        {
          text: t('stadions.cash'),
          callback_data: `payments_${Payments.CASH}`,
        },
      ],
      [
        {
          text: t('stadions.both'),
          callback_data: `payments_${Payments.GIBRID}`,
        },
      ],
      [{ text: t('stadions.back'), callback_data: 'back_owner_4' }],
    ];
  }

  async registor(ctx: MyContext, lang: string) {
    try {
      ctx.session = ctx.session || {};
      ctx.session.step = 'owner_registor';
      ctx.session.owner_registor = ctx.session.owner_registor || {
        full_name: null,
        email: null,
        phone: null,
        step: null,
      };
      ctx.session.owner_registor.step = 'full_name';

      await ctx.reply(this.tr(lang)('registor.name'), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.tr(lang)('schedule.back'),
                callback_data: 'back_owner_5',
              },
            ],
          ],
        },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async registor_step(ctx: MyContext, lang: string) {
    try {
      const reg = ctx.session.owner_registor;
      if (!reg || !ctx.message) return;
      const t = this.tr(lang);
      const back = (callback_data: string) => ({
        inline_keyboard: [[{ text: t('schedule.back'), callback_data }]],
      });

      if ('text' in ctx.message) {
        const text = ctx.message.text.trim();

        if (reg.step === 'full_name') {
          if (text.length < 2 || text.length > 100) {
            await ctx.reply(t('registor.name'));
            return;
          }
          reg.full_name = text;
          reg.step = 'email';
          await ctx.reply(t('registor.email'), {
            reply_markup: back('back_owner_6'),
          });
          return;
        }

        if (reg.step === 'email') {
          const email = text.toLowerCase();
          if (!isEmailFormat(email)) {
            await ctx.reply(t('registor.email_format'));
            return;
          }
          const exists = await this.prisma.owners.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
          });
          if (exists) {
            await ctx.reply(t('registor.email_exists_error'), {
              reply_markup: back('back_owner_6'),
            });
            return;
          }
          reg.email = email;
          reg.step = 'phone';
          await ctx.reply(t('registor.phone'), {
            reply_markup: {
              keyboard: [
                [{ text: t('registor.send_phone'), request_contact: true }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
          return;
        }

        if (reg.step === 'phone') {
          await ctx.reply(t('registor.phone'));
        }
        return;
      }

      if ('contact' in ctx.message && reg.step === 'phone') {
        const contact = ctx.message.contact;
        if (contact.user_id !== ctx.from?.id) {
          await ctx.reply(t('registor.phone_own_only'));
          return;
        }

        const phone = `+${contact.phone_number.replace(/\D/g, '')}`;
        const chatID = String(ctx.from?.id);
        const data = {
          username: ctx.from?.username ?? null,
          full_name: String(reg.full_name),
          phone,
          email: String(reg.email),
          chatID,
          notificationSettings: DefaultNotificationSettings,
        };
        await this.prisma.owners.upsert({
          where: { chatID },
          update: {},
          create: data,
        });

        reg.full_name = null;
        reg.email = null;
        reg.phone = null;
        reg.step = null;
        ctx.session.step = 'finish';

        await ctx.reply(
          t('registor.finish'),
          Markup.keyboard([
            [t('menyu_buttons.stadion'), t('menyu_buttons.bron')],
            [t('menyu_buttons.settings'), t('menyu_buttons.help')],
            [t('menyu_buttons.card')],
          ])
            .resize()
            .oneTime(),
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async ownerContakt(ctx: MyContext, owner_id: number) {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const owner = await this.prisma.owners.findFirst({
        where: { id: owner_id, chatID: String(ctx.from?.id) },
        select: { id: true, phone: true },
      });
      if (!owner) {
        await ctx
          .answerCbQuery(t('admin.access_denied'), { show_alert: true })
          .catch(() => undefined);
        return;
      }

      await this.utils.safeEditOrReply(
        ctx,
        `${t('success.your_phone')} ${escapeHtml(owner.phone)}`,
        {
          inline_keyboard: [
            [
              {
                text: t('success.edit'),
                callback_data: JSON.stringify({
                  id: owner.id,
                  type: 'phone_update',
                }),
              },
            ],
            [
              {
                text: t('schedule.back'),
                callback_data: JSON.stringify({
                  id: owner.id,
                  type: 'phone_back',
                }),
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async handleStadionMenu(ctx: MyContext, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: { id: true },
      });
      if (!owner) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Owner topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.OWNER,
        );
        return;
      }

      const stadions = await this.prisma.stadion.findMany({
        where: { owner_id: owner.id, stadion_mini: false },
        select: { id: true, name: true },
        orderBy: { updatedAt: 'desc' },
      });

      const addRow: InlineKeyboardButton[] = [
        { text: t('stadions.add'), callback_data: 'add_stadion' },
      ];
      const backRow: InlineKeyboardButton[] = [
        { text: t('stadions.back'), callback_data: 'back_owner_1' },
      ];

      if (!stadions.length) {
        await ctx.reply(t('stadions.stadion'), {
          reply_markup: { inline_keyboard: [addRow, backRow] },
        });
        return;
      }

      const rows: InlineKeyboardButton[][] = stadions.map((s) => [
        {
          text: `🏟 ${s.name.length > 20 ? `${s.name.slice(0, 20)}...` : s.name}`,
          callback_data: JSON.stringify({ type: 'stadion', id: s.id }),
        },
      ]);
      await ctx.reply(t('stadions.select'), {
        reply_markup: { inline_keyboard: [...rows, addRow, backRow] },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async ownerSettings(ctx: MyContext, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: { id: true },
      });
      if (!owner) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Owner topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.OWNER,
        );
        return;
      }

      const row = (key: string, type: string): InlineKeyboardButton[] => [
        { text: t(key), callback_data: JSON.stringify({ id: owner.id, type }) },
      ];
      await ctx.reply(t('settings.title'), {
        reply_markup: {
          inline_keyboard: [
            row('settings.language', 'language'),
            row('settings.notification', 'notification'),
            row('settings.phone', 'phone'),
            row('premium.advertising.button', 'advertising'),
            row('premium.premium', 'ownerPremium'),
            [{ text: t('schedule.back'), callback_data: 'back_owner_1' }],
          ],
        },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async updatePhone(ctx: MyContext, lang: string, text: string) {
    try {
      const t = this.tr(lang);
      const phone = this.normalizeUzPhone(text.trim());
      if (!phone) {
        await ctx.reply(t('error.phone_invalid'));
        return;
      }

      // chatID bo'yicha: sessiyadagi ID ga ishonilmaydi
      const owner = await this.prisma.owners.update({
        where: { chatID: String(ctx.from?.id) },
        data: { phone },
        select: { id: true },
      });

      if (ctx.session.owner_registor) ctx.session.owner_registor.phone = null;
      await ctx.reply(t('success.phone_updated'));
      await this.ownerContakt(ctx, owner.id);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async handleStadionSteps(ctx: MyContext, lang: string, text: string) {
    try {
      const stadion = ctx.session.stadion;
      if (!stadion) return;
      const t = this.tr(lang);
      const backKeyboard = {
        reply_markup: {
          keyboard: [[{ text: t('stadions.back') }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      if (stadion.name === 'N') {
        const name = text.trim();
        if (!STADION_NAME_REGEX.test(name)) {
          await ctx.reply(t('booking.stadions.format'));
          return;
        }
        await ctx.reply(t('stadions.location'), {
          reply_markup: {
            keyboard: [
              [{ text: t('stadions.send_location'), request_location: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        stadion.name = name;
        stadion.step = 3;
        stadion.lockation = 'L';
        return;
      }

      if (stadion.max_count === 0) {
        const count = await this.readNumber(
          ctx,
          lang,
          text,
          STADION_LIMITS.maxCount,
        );
        if (count === null) return;
        await ctx.reply(t('stadions.length'), backKeyboard);
        stadion.max_count = count;
        stadion.length = 'length';
        stadion.step = 5;
        return;
      }

      if (stadion.length === 'length') {
        const length = await this.readNumber(
          ctx,
          lang,
          text,
          STADION_LIMITS.side,
        );
        if (length === null) return;
        await ctx.reply(t('stadions.width'), backKeyboard);
        stadion.length = length;
        stadion.width = 'width';
        stadion.step = 6;
        return;
      }

      if (stadion.width === 'width') {
        const width = await this.readNumber(
          ctx,
          lang,
          text,
          STADION_LIMITS.side,
        );
        if (width === null) return;
        await ctx.reply(t('stadions.price'), backKeyboard);
        stadion.width = width;
        stadion.price = 'price';
        stadion.step = 7;
        return;
      }

      if (stadion.price === 'price') {
        const price = await this.readNumber(
          ctx,
          lang,
          text,
          STADION_LIMITS.price,
        );
        if (price === null) return;
        await ctx.reply(t('stadions.paymenst_type'), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('stadions.card'),
                  callback_data: `payments_${Payments.CARD}`,
                },
              ],
              [
                {
                  text: t('stadions.cash'),
                  callback_data: `payments_${Payments.CASH}`,
                },
              ],
              [
                {
                  text: t('stadions.both'),
                  callback_data: `payments_${Payments.GIBRID}`,
                },
              ],
              [{ text: t('stadions.back'), callback_data: 'back_owner_4' }],
            ],
          },
        });
        stadion.price = price;
        stadion.payments = 'payments';
        stadion.step = 8;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async handleOffDays(ctx: MyContext, lang: string, text: string) {
    try {
      const t = this.tr(lang);

      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
      if (!m) {
        await ctx.reply(t('schedule.off_day.format'));
        return;
      }
      const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];

      // bazadagi `date` bilan bir xil shakl: UTC yarim tuni, tekshiruv ham UTC bilan
      const date = new Date(Date.UTC(year, month - 1, day));
      const isRealDate =
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;

      // o'tgan sanalar ham shu xabar bilan rad etiladi (xohlasangiz alohida kalit qo'shing)
      if (!isRealDate || date.getTime() < this.utils.todayLocal().getTime()) {
        await ctx.reply(t('schedule.off_day.not_fount_day'));
        return;
      }

      const step = ctx.session.step;
      if (step === 'add_special') {
        await ctx.reply(t('schedule.time_specile'));
        ctx.session.stadion.special = date;
        ctx.session.step = 'special_time';
        return;
      }
      if (step === 'edit_specile') {
        await ctx.reply(t('schedule.update_time'));
        ctx.session.stadion.special = date;
        ctx.session.step = 'special_time_edit';
        return;
      }

      const stadionId = await this.ownedStadionId(ctx);
      if (stadionId === null) {
        throw new Error("Stadion sessiyada yo'q yoki egasiga tegishli emas");
      }

      const editingId =
        step === 'week_edit' ? Number(ctx.session.stadion.off) : null;
      const duplicate = await this.prisma.stadion_off_days.findFirst({
        where: {
          stadion_id: stadionId,
          date,
          ...(editingId ? { id: { not: editingId } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) {
        await ctx.reply(t('schedule.off_day.exists')); // yangi kalit
        return;
      }

      if (editingId) {
        const res = await this.prisma.stadion_off_days.updateMany({
          where: { id: editingId, stadion_id: stadionId },
          data: { date },
        });
        if (res.count === 0)
          throw new Error(`Dam olish kuni topilmadi: id=${editingId}`);
        await ctx.reply(t('schedule.off_day.update'));
      } else {
        await this.prisma.stadion_off_days.create({
          data: { stadion_id: stadionId, date },
        });
        await ctx.reply(t('schedule.off_day.succses'));
      }

      ctx.session.step = null;
      await this.botService.stadion_off_days(ctx, stadionId);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async handleSchedule(ctx: MyContext, lang: string, text: string) {
    const t = this.tr(lang);

    const match = TIME_RANGE_REGEX.exec(text.trim());
    if (!match) {
      await ctx.reply(t('schedule.schedules.format'));
      return;
    }
    const startTime = `${match[1].padStart(2, '0')}:${match[2]}`;
    const endTime = `${match[3].padStart(2, '0')}:${match[4]}`;
    const startMinutes = this.utils.toMinutes(startTime);
    const endMinutes = this.utils.toMinutes(endTime);

    if (startMinutes === endMinutes) {
      await ctx.reply(t('schedule.schedules.error'));
      return;
    }

    try {
      const stadionId = await this.ownedStadionId(ctx);
      if (stadionId === null) {
        throw new Error("Stadion sessiyada yo'q yoki egasiga tegishli emas");
      }
      const step = ctx.session.step;

      // ----- maxsus kun jadvali -----
      if (step === 'special_time' || step === 'special_time_edit') {
        const date = new Date(ctx.session.stadion.special);
        if (Number.isNaN(date.getTime()))
          throw new Error("Maxsus kun sanasi yo'q");

        const editingId =
          step === 'special_time_edit'
            ? Number(ctx.session.stadion.schedule_id)
            : null;

        const duplicate = await this.prisma.stadion_special_schedule.findFirst({
          where: {
            stadion_id: stadionId,
            date,
            ...(editingId ? { id: { not: editingId } } : {}),
          },
          select: { id: true },
        });
        if (duplicate) {
          await ctx.reply(t('schedule.off_day.exists'));
          return;
        }

        if (editingId) {
          // stadion_id yangilanmaydi: boshqa stadionning jadvali ko'chib qolmasin
          const res = await this.prisma.stadion_special_schedule.updateMany({
            where: { id: editingId, stadion_id: stadionId },
            data: { start_time: startTime, end_time: endTime, date },
          });
          if (res.count === 0)
            throw new Error(`Maxsus jadval topilmadi: id=${editingId}`);
          await ctx.reply(t('schedule.off_day.update'));
        } else {
          await this.prisma.stadion_special_schedule.create({
            data: {
              date,
              start_time: startTime,
              end_time: endTime,
              stadion_id: stadionId,
            },
          });
          await ctx.reply(t('schedule.off_day.succses'));
        }

        ctx.session.step = null;
        await this.botService.stadion_special(ctx, stadionId);
        return;
      }

      // ----- haftalik jadval -----
      const isEdit = step === 'edit_schedule_time';
      const editingId = Number(ctx.session.stadion.schedule_id);
      let currentDay = Number(ctx.session.stadion.schedule_day);

      if (isEdit) {
        // kun tahrirlanayotgan yozuvning o'zidan olinadi
        const current = await this.prisma.stadion_chedule.findFirst({
          where: { id: editingId, stadion_id: stadionId },
          select: { day_of_week: true },
        });
        if (!current) throw new Error(`Jadval topilmadi: id=${editingId}`);
        currentDay = Number(current.day_of_week);
      }
      if (!Number.isInteger(currentDay) || currentDay < 1 || currentDay > 7) {
        throw new Error(`Noto'g'ri hafta kuni: ${currentDay}`);
      }

      const others = await this.prisma.stadion_chedule.findMany({
        where: {
          stadion_id: stadionId,
          ...(isEdit ? { id: { not: editingId } } : {}),
        },
      });
      if (
        this.hasScheduleOverlap(others, currentDay, startMinutes, endMinutes)
      ) {
        await ctx.reply(t('schedule.schedules.overlap'));
        return;
      }

      if (isEdit) {
        await this.prisma.stadion_chedule.updateMany({
          where: { id: editingId, stadion_id: stadionId },
          data: { start_time: startTime, end_time: endTime },
        });
        await ctx.reply(t('schedule.schedules.updated'));
      } else {
        await this.prisma.stadion_chedule.create({
          data: {
            stadion_id: stadionId,
            day_of_week: currentDay,
            start_time: startTime,
            end_time: endTime,
          },
        });
        await ctx.reply(t('schedule.schedules.creat'));
      }

      ctx.session.step = null;
      ctx.session.stadion.schedule_day = null;
      await this.botService.renderScheduleMenu(ctx, stadionId);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async handlePrice(ctx: MyContext, lang: string, text: string) {
    try {
      const price = await this.readNumber(
        ctx,
        lang,
        text,
        STADION_LIMITS.price,
      );
      if (price === null) return;

      const stadionId = await this.ownedStadionId(ctx);
      if (stadionId === null) {
        throw new Error("Stadion sessiyada yo'q yoki egasiga tegishli emas");
      }

      await this.prisma.stadion.update({
        where: { id: stadionId },
        data: { price },
      });
      await this.botService.stadion_price(ctx, stadionId);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async handleStadionBack(ctx: MyContext, lang: string) {
    try {
      const stadion = ctx.session.stadion;
      if (!stadion) return;
      const t = this.tr(lang);
      const backKeyboard = {
        reply_markup: {
          keyboard: [[{ text: t('stadions.back') }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      switch (stadion.step) {
        case 4:
          await ctx.reply(t('stadions.location'), {
            reply_markup: {
              keyboard: [
                [{ text: t('stadions.send_location'), request_location: true }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
          stadion.lockation = 'L';
          return;
        case 5:
          await ctx.reply(t('stadions.location_back'));
          stadion.max_count = 0;
          return;
        case 6:
          await ctx.reply(t('stadions.length'), backKeyboard);
          stadion.length = 'length';
          stadion.step = 5;
          return;
        case 7:
          await ctx.reply(t('stadions.width'), backKeyboard);
          stadion.width = 'width';
          stadion.step = 6;
          return;
        case 9:
          await ctx.reply(t('stadions.paymenst_type'), {
            reply_markup: { inline_keyboard: this.paymentTypeKeyboard(lang) },
          });
          stadion.payments = 'payments';
          stadion.step = 8;
          return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async ownerBackSwitch(ctx: MyContext, data: string, lang: string) {
    try {
      const t = this.tr(lang);

      switch (data) {
        case '1':
          await ctx.reply(t('menyu_buttons.menu'), this.mainMenuKeyboard(lang));
          await this.utils.deleteClickedMessage(ctx);
          return;

        case '2':
          await this.handleStadionMenu(ctx, lang);
          return;

        case '3': {
          const regions = await this.prisma.region.findMany();
          if (!regions.length) throw new Error('Regionlar hali yaratilmagan');
          const rows = regions.map((r) => [
            { text: r.name, callback_data: `region_${r.id}` },
          ]);
          rows.push([
            { text: t('stadions.back'), callback_data: 'back_owner_2' },
          ]);
          await ctx.reply(t('stadions.stadion_region'), {
            reply_markup: { inline_keyboard: rows },
          });
          return;
        }

        case '4':
          await ctx.reply(t('stadions.price'), {
            reply_markup: {
              keyboard: [[{ text: t('stadions.back') }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
          if (ctx.session.stadion) {
            ctx.session.stadion.price = 'price';
            ctx.session.stadion.step = 7;
          }
          return;

        case 'help':
          await this.utils.safeEditHelpMenuReply(ctx, t('help.help.title'));
          return;

        case '5':
          await ctx.reply(
            t('registor.title'),
            Markup.keyboard([
              [`💼 ${t('registor.button.0')}`],
              [`🏃🏼 ${t('registor.button.1')}`],
            ])
              .oneTime()
              .resize(),
          );
          ctx.session.step = 'registor';
          return;

        case '6':
          await this.registor(ctx, lang);
          return;

        case '7':
          await this.utils.clearSessionMessages(ctx);
          ctx.session.ownerDataFilter = null;
          this.clearRegistorId(ctx);
          return;

        case '8':
          await this.utils.clearSessionMessages(ctx);
          await this.owner_Bron(ctx, lang);
          return;

        case '9': {
          // eski kod `Number(data)` = 9 ni egasi ID si sifatida ishlatardi
          const owner = await this.requireOwner(ctx);
          await this.premium(ctx, owner.id, lang);
          return;
        }

        case '10':
          if (ctx.session.ownerStadions?.length) {
            await ctx
              .deleteMessages(ctx.session.ownerStadions)
              .catch(() => undefined);
            ctx.session.ownerStadions = [];
          }
          return;

        case '11':
          await this.owner_Bron(ctx, lang);
          return;

        default:
          this.logger.warn(`ownerBackSwitch: noma'lum qiymat: ${data}`);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async stadionSplit(
    ctx: MyContext,
    count: number,
    stadionId: number,
    lang: string,
  ) {
    try {
      const t = this.tr(lang);
      if (![2, 4, 6, 8].includes(count)) {
        throw new Error(`Noto'g'ri bo'linish soni: ${count}`);
      }

      const parent = await this.prisma.stadion.findFirst({
        where: { id: stadionId, owner: { chatID: String(ctx.from?.id) } },
        include: { _count: { select: { children: true } } },
      });
      if (!parent) {
        await this.utils.errorFunction(
          ctx,
          new Error(
            `Stadion topilmadi yoki egasiga tegishli emas: ${stadionId}`,
          ),
          ErrorContext.STADION,
        );
        return;
      }
      if (parent.stadion_mini || parent.mini || parent.parent_id) {
        throw new Error(`Bu stadionni bo'lib bo'lmaydi: ${parent.id}`);
      }
      // eskirgan tugma bilan qayta bo'lishning oldini olamiz
      if (parent._count.children > 0) {
        await this.miniStadionlar(ctx, parent.id, lang);
        return;
      }

      const part = (value: number) => Math.max(1, Math.floor(value / count));

      await this.prisma.stadion.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          stadion_mini: true,
          image: parent.image,
          name: `${parent.name} - ${i + 1}`,
          parent_id: parent.id,
          length: part(parent.length),
          width: part(parent.width),
          price: part(parent.price),
          max_count: part(parent.max_count),
          owner_id: parent.owner_id,
          region_id: parent.region_id,
          region_item_id: parent.region_item_id,
          working_status: true,
          latitude: parent.latitude,
          longitude: parent.longitude,
          admin_status: parent.admin_status,
          mini: parent.mini,
          payments_type: parent.payments_type, // ota bilan bir xil bo'lishi kerak
        })),
      });

      await this.replyTracked(
        ctx,
        'stadionMessages',
        t('success.mini_stadium_created', { count }),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async miniStadion(ctx: MyContext, childId: number, lang: string) {
    try {
      const child = await this.prisma.stadion.findFirst({
        where: {
          id: childId,
          parent_id: { not: null },
          stadion_mini: true,
          owner: { chatID: String(ctx.from?.id) },
        },
        select: { id: true, parent_id: true },
      });
      if (!child) {
        await this.utils.errorFunction(
          ctx,
          new Error(
            `Mini stadion topilmadi yoki egasiga tegishli emas: ${childId}`,
          ),
          ErrorContext.STADION,
        );
        return;
      }

      const b = (key: string, type: string) =>
        this.btnJson(lang, key, type, child.id);
      await this.utils.safeEditOrReply(
        ctx,
        this.tr(lang)('stadions.mini_stadium_settings'),
        {
          inline_keyboard: [
            [
              b('stadions.stadium.name', 'Stadion_nomi'),
              b('schedule.price', 'price'),
            ],
            [
              b('stadions.players_count', 'players_count'),
              b('schedule.image', 'image'),
            ],
            [b('stadions.menyu.all_data', 'all_data')],
            [
              b('schedule.delete', 'delete'),
              this.btnJson(
                lang,
                'schedule.back',
                'miniStadionlar',
                child.parent_id,
              ),
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  async miniStadionlar(ctx: MyContext, stadionId: number, lang: string) {
    try {
      const t = this.tr(lang);
      await this.deleteTracked(ctx, 'stadionMessages');
      await ctx.answerCbQuery().catch(() => undefined);

      const stadion = await this.prisma.stadion.findFirst({
        where: { id: stadionId, owner: { chatID: String(ctx.from?.id) } },
        include: { children: { orderBy: { updatedAt: 'desc' } } },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(
            `Stadion topilmadi yoki egasiga tegishli emas: ${stadionId}`,
          ),
          ErrorContext.STADION,
        );
        return;
      }

      const backRow = [
        this.btnJson(lang, 'schedule.back', 'stadion', stadion.id),
      ];

      if (!stadion.children.length) {
        await this.utils.safeEditOrReply(
          ctx,
          t('stadions.stadium_not_divided'),
          {
            inline_keyboard: [
              [
                {
                  text: t('stadions.stadium_divide'),
                  callback_data: `owner_stadionSplit_${stadion.id}`,
                },
              ],
              backRow,
            ],
          },
        );
        return;
      }

      const rows: InlineKeyboardButton[][] = stadion.children.map((child) => [
        {
          text: t('stadions.stadium_button', {
            name: child.name,
            price: child.price
              ? t('stadions.price_label', { price: formatSum(child.price) })
              : t('stadions.price_unknown'),
          }),
          callback_data: `owner_miniStadion_${child.id}`,
        },
      ]);
      rows.push(backRow);

      await this.utils.safeEditOrReply(ctx, t('stadions.mini_stadium_list'), {
        inline_keyboard: rows,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async stadionMenyu(ctx: MyContext, stadionID: number, lang: string) {
    try {
      const t = this.tr(lang);
      const stadion = await this.prisma.stadion.findFirst({
        where: { id: stadionID, owner: { chatID: String(ctx.from?.id) } },
        select: { id: true, mini: true, stadion_mini: true },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(
            `Stadion topilmadi yoki egasiga tegishli emas: ${stadionID}`,
          ),
          ErrorContext.STADION,
        );
        return;
      }

      const b = (key: string, type: string) =>
        this.btnJson(lang, key, type, stadion.id);
      const workingBtn: InlineKeyboardButton = {
        text: t('stadions.change_working_status'),
        callback_data: `stadion_type_workingStatus-${stadion.id}`,
      };

      const keyboard: InlineKeyboardButton[][] = [
        [
          b('stadions.stadium.name', 'Stadion_nomi'),
          b('stadions.payment_method', 'payment_method'),
        ],
        [b('schedule.working', 'schedule'), b('schedule.price', 'price')],
        [b('schedule.location', 'lokation'), b('schedule.image', 'image')],
      ];
      if (!stadion.stadion_mini && !stadion.mini) {
        keyboard.push(
          [b('stadions.mini_stadium.my_stadiums', 'miniStadionlar')],
          [workingBtn],
        );
      } else if (!stadion.stadion_mini) {
        keyboard.push([workingBtn]);
      }
      keyboard.push(
        [b('stadions.menyu.all_data', 'all_data')],
        [b('schedule.delete', 'delete'), b('schedule.back', 'back_1')],
      );

      await this.utils.safeEditOrReply(ctx, t('stadions.stadion_settings'), {
        inline_keyboard: keyboard,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  async stadionPayments(ctx: MyContext, stadionId: number, lang: string) {
    try {
      const t = this.tr(lang);
      const stadion = await this.prisma.stadion.findFirst({
        where: { id: stadionId, owner: { chatID: String(ctx.from?.id) } },
        select: { id: true, stadion_mini: true, payments_type: true },
      });
      if (!stadion || stadion.stadion_mini) {
        await this.utils.errorFunction(
          ctx,
          new Error(`To'lov sozlamasi mumkin emas: stadion ${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      await this.utils.safeEditOrReply(
        ctx,
        t('stadions.current_payment_type', {
          payment: getPaymentText(
            stadion.payments_type,
            this.i18n.translate('peyments', { lang }),
          ),
        }),
        {
          inline_keyboard: [
            [this.btnJson(lang, 'success.edit', 'Update_Payments', stadion.id)],
            [this.btnJson(lang, 'schedule.back', 'stadion', stadion.id)],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  ///////////////////⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️///////////////////////////////

  async owner_Bron(ctx: MyContext, lang: string) {
    try {
      const t = (key: string): string => this.i18n.translate(key, { lang });

      const ownerData = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: { id: true, _count: { select: { stadions: true } } },
      });
      if (!ownerData) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Owner topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.OWNER,
        );
        return;
      }

      if (ownerData._count.stadions === 0) {
        await ctx.reply(t('owner_booking.no_stadion'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t('schedule.back'), callback_data: 'back_owner_1' }],
            ],
          },
        });
        return;
      }

      const id = ownerData.id;
      const btn = (key: string, callback_data: string) => ({
        text: t(key),
        callback_data,
      });
      const menu = (name: string) =>
        `owner_booking.booking_menu.buttons.${name}`;

      await this.utils.safeEditOrReply(
        ctx,
        t('owner_booking.booking_menu.title'),
        {
          inline_keyboard: [
            [btn('admin.bron', `Newbooking_owners_${id}_${lang}`)],
            [
              btn(menu('active'), `ownerBooking_active_${id}_1`),
              btn(menu('pending'), `ownerBooking_pending_${id}_1`),
            ],
            [
              btn(menu('today'), `ownerBooking_today_${id}_1`),
              btn(menu('tomorrow'), `ownerBooking_tomorrow_${id}_1`),
            ],
            [
              btn(menu('upcoming'), `ownerBooking_upcoming_${id}_1`),
              btn(menu('now'), `ownerBooking_now_${id}_1`),
            ],
            [
              btn(menu('all'), `bookingAllData_all_${id}_1`),
              btn(menu('cancelled'), `ownerBooking_cancelled_${id}_1`),
            ],
            [
              btn(menu('stats'), `BookingOwner_statistica_stats_${id}`),
              btn(menu('search'), `bookingAllData_search_${id}_1`),
            ],
            [btn('schedule.back', 'back_owner_1')],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async sendBookingMessage(
    ctx: MyContext,
    booking: IBooking,
    page: number,
    lang: string,
    type: string,
    callback_data: string,
  ): Promise<void> {
    const t = (key: string): string => this.i18n.translate(key, { lang });

    const button = this.utils.buildOwnerBookingButtons(
      booking,
      page,
      lang,
      type,
      callback_data,
    );

    const sent = await ctx.reply(
      this.i18n.translate('owner_booking.details', {
        lang,
        args: {
          id: booking.id,
          date: formatDate(booking.date, lang),
          time: `${booking.start_time} - ${booking.end_time}`,
          stadium: escapeHtml(booking.stadion.name),
          region: escapeHtml(booking.stadion.region.name),
          user: escapeHtml(
            booking.user?.full_name ?? booking.customer_name ?? '—',
          ),
          status: statusMap(booking.status, this.i18n, lang),
          check_in: booking.check_in
            ? t('owner_booking.check_in')
            : t('owner_booking.not_check_in'),
        },
      }),
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: button } },
    );

    ctx.session.ownerActiveBooking ??= [];
    ctx.session.ownerActiveBooking.push(sent.message_id);
  }

  async bookingDetails(
    ctx: MyContext,
    bookingId: number,
    page: number,
    lang: string,
    type: string,
    callback_data: string,
  ) {
    try {
      const t = (key: string): string => this.i18n.translate(key, { lang });

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          stadion: {
            select: {
              name: true,
              owner_id: true,
              region: { select: { name: true } },
              region_items: { select: { name: true } },
            },
          },
          user: { select: { full_name: true, phone: true, username: true } },
        },
      });

      if (!booking) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Bron topilmadi: ${bookingId}`),
          ErrorContext.OWNER,
        );
        return;
      }

      const { totalMinutes, timeLeftText } = this.utils.bookingTimeCalculate(
        booking.startAt,
        lang,
      );

      const withPlus = (p: string) => (p.startsWith('+') ? p : `+${p}`);
      const phone = booking.user?.phone
        ? withPlus(booking.user.phone)
        : (booking.customer_phone ?? '—');

      const message = this.i18n.translate('owner_booking.full_details', {
        lang,
        args: {
          id: booking.id,
          stadium: escapeHtml(booking.stadion.name),
          region: `${escapeHtml(booking.stadion.region.name)} / ${escapeHtml(booking.stadion.region_items.name)}`,
          date: this.utils.formatCalendarDate(booking.date),
          time: `${booking.start_time} - ${booking.end_time}`,
          time_left:
            totalMinutes > 0 ? timeLeftText : t('bookingHistory.time_expired'),
          user: escapeHtml(
            booking.user?.full_name ?? booking.customer_name ?? '—',
          ),
          phone: escapeHtml(phone),
          username: booking.user?.username
            ? `🔗 @${escapeHtml(booking.user.username)}`
            : '_',
          price: formatSum(booking.total_price),
          payment: getPaymentText(
            booking.payment_method,
            this.i18n.translate('peyments', { lang }),
          ),
          status: statusMap(booking.status, this.i18n, lang),
          created_at: formatInTimeZone(
            booking.createdAt,
            APP_TZ,
            'dd.MM.yyyy HH:mm',
          ),
          check_in: booking.check_in
            ? t('owner_booking.check_in')
            : t('owner_booking.not_check_in'),
        },
      });

      // bookingFilter ro'yxati stadion ID si bilan, qolganlari egasi ID si bilan ishlaydi
      const backId =
        callback_data === 'bookingFilter'
          ? booking.stadion_id
          : booking.stadion.owner_id;

      await this.utils.safeEditOrReply(ctx, message, {
        inline_keyboard: [
          [
            {
              text: t('schedule.back'),
              callback_data: `${callback_data}_${type}_${backId}_${page}`,
            },
          ],
        ],
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }
  ////////////////////⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️////////////////////////////////

  async owner_payout(ctx: MyContext, lang: string) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: {
          id: true,
          payout_status: true,
          paylov_partner_id: true,
        },
      });
      if (!owner)
        return await this.utils.errorFunction(
          ctx,
          new Error('Stadion egasi topilmadi'),
          ErrorContext.OWNER,
        );

      const backBtn = {
        text: this.i18n.translate('schedule.back', { lang }),
        callback_data: 'back_owner_1',
      };

      const connectUrl = process.env.PAYLOV_CONNECT_URL;

      const connectRow = connectUrl
        ? [
            [
              {
                text: this.i18n.translate(
                  'peyments.owner_payout.connect_button',
                  { lang },
                ),
                url: connectUrl,
              },
            ],
          ]
        : [];

      if (!owner.paylov_partner_id) {
        await ctx.reply(
          this.i18n.translate('peyments.owner_payout.empty.text', { lang }),
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [...connectRow, [backBtn]] },
          },
        );
        return;
      }

      const isActive = canOwnerAcceptCard(owner);
      const statusKey = isActive
        ? 'active'
        : String(owner.payout_status).toLowerCase();

      const partnerId = owner.paylov_partner_id;
      const maskedPartnerId =
        partnerId.length > 4 ? `•••• ${partnerId.slice(-4)}` : partnerId;

      await ctx.reply(
        this.i18n.translate('peyments.owner_payout.info.text', {
          lang,
          args: {
            status: this.i18n.translate(
              `peyments.owner_payout.status.${statusKey}`,
              { lang, defaultValue: String(owner.payout_status) },
            ),
            partnerId: maskedPartnerId,
          },
        }),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [...(isActive ? [] : connectRow), [backBtn]],
          },
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    }
  }

  async handleDataFilter(
    ctx: MyContext,
    text: string,
    lang: string,
    _ownerId?: number, // moslik uchun qoldirilgan: egasi chatID bo'yicha aniqlanadi
    page = 1,
  ) {
    try {
      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);
      const limit = 5;
      const input = text.trim();

      const reject = (key: string) =>
        this.replyTracked(ctx, 'ownerActiveBooking', t(key));

      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input);
      if (!m) {
        await reject('owner_booking.invalid_format');
        return;
      }
      const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const selectedDate = new Date(Date.UTC(year, month - 1, day));

      if (
        selectedDate.getUTCFullYear() !== year ||
        selectedDate.getUTCMonth() !== month - 1 ||
        selectedDate.getUTCDate() !== day
      ) {
        await reject('owner_booking.invalid_date');
        return;
      }
      if (year < FILTER_YEARS.min || year > FILTER_YEARS.max) {
        await reject('owner_booking.out_of_range');
        return;
      }

      const where: Prisma.BookingWhereInput = {
        stadion: { owner_id: owner.id },
        date: selectedDate,
      };
      const [bookings, total] = await Promise.all([
        this.prisma.booking.findMany({
          where,
          skip: (Math.max(1, page) - 1) * limit,
          take: limit,
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
          include: {
            stadion: {
              include: { region: true, region_items: true, owner: true },
            },
            user: true,
          },
        }),
        this.prisma.booking.count({ where }),
      ]);

      const deleteUserMessage = async () => {
        if (ctx.updateType === 'message') {
          await ctx.deleteMessage().catch(() => undefined);
        }
      };

      if (!bookings.length) {
        await this.replyTracked(
          ctx,
          'ownerActiveBooking',
          t('owner_booking.no_bookings'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: t('schedule.back'), callback_data: 'back_owner_7' }],
              ],
            },
          },
        );
        await deleteUserMessage();
        return;
      }

      ctx.session.ownerDataFilter = input;
      await deleteUserMessage();

      for (const booking of bookings) {
        await this.sendBookingMessage(
          ctx,
          booking,
          page,
          lang,
          'all',
          'bookingAllData',
        );
      }

      this.clearRegistorId(ctx);
      ctx.session.ownerBrons = null;

      await this.utils.sendPagination(
        ctx,
        page,
        total,
        limit,
        lang,
        `bookingAllData_all_${owner.id}`,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async searchBooking(
    ctx: MyContext,
    input: { type: string; value: string | number },
    lang: string,
    page = 1,
  ) {
    try {
      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);
      const limit = 10;

      const where: Prisma.BookingWhereInput = {
        stadion: { owner_id: owner.id },
      };

      switch (input.type) {
        case 'phone': {
          // foydalanuvchi raqami `+`siz saqlangan, admin kiritgani esa qanday yozilgan bo'lsa shunday
          const withPlus = String(input.value);
          const digits = withPlus.replace(/\D/g, '');
          where.OR = [
            { user: { phone: { in: [withPlus, digits] } } },
            { customer_phone: { in: [withPlus, digits] } },
          ];
          break;
        }
        case 'id':
          where.id = Number(input.value);
          break;
        case 'name': {
          const name = String(input.value);
          where.OR = [
            { user: { full_name: { contains: name, mode: 'insensitive' } } },
            { customer_name: { contains: name, mode: 'insensitive' } },
          ];
          break;
        }
        default:
          // `invalid` yoki noma'lum tur: qidiruv so'rovini qayta so'raymiz
          await this.replyTracked(
            ctx,
            'ownerActiveBooking',
            t('owner_booking.search_by_user'),
          );
          await ctx.deleteMessage().catch(() => undefined);
          return;
      }

      const bookings = await this.prisma.booking.findMany({
        where,
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        skip: (Math.max(1, page) - 1) * limit,
        take: limit,
        include: {
          stadion: {
            include: { region: true, region_items: true, owner: true },
          },
          user: true,
        },
      });

      if (ctx.updateType === 'message') {
        await ctx.deleteMessage().catch(() => undefined);
      }
      await this.utils.clearSessionMessages(ctx);

      if (!bookings.length) {
        await this.replyTracked(
          ctx,
          'ownerActiveBooking',
          t('owner_booking.no_results'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: t('schedule.back'), callback_data: 'back_owner_7' }],
              ],
            },
          },
        );
        return;
      }

      for (const booking of bookings) {
        await this.sendBookingMessage(
          ctx,
          booking,
          page,
          lang,
          'searchBack',
          'bookingAllData',
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      this.clearRegistorId(ctx);
    }
  }
  async premium(ctx: MyContext, _ownerId: number, lang: string) {
    try {
      const t = this.tr(lang);
      // egasi har doim chatID bo'yicha aniqlanadi: parametrdagi ID ga ishonilmaydi
      const owner = await this.requireOwner(ctx);
      const now = new Date();

      const subscription = await this.prisma.subscription.findFirst({
        where: { ownerId: owner.id, isActive: true, endDate: { gte: now } },
        orderBy: { endDate: 'desc' },
      });

      const backBtn = this.btnJson(
        lang,
        'schedule.back',
        'phone_back',
        owner.id,
      );

      if (!subscription) {
        const planRow = (
          plan: 'MONTH_1' | 'MONTH_3' | 'YEAR_1',
        ): InlineKeyboardButton[] => [
          {
            text: `${PLAN_LABELS[lang][plan]} — ${Premium_price[plan]}`,
            callback_data: JSON.stringify({
              type: 'premium_buy',
              plan,
              id: owner.id,
            }),
          },
        ];
        await this.utils.safeEditOrReply(
          ctx,
          t('premium.premium_message.text', {
            month1_label: PLAN_LABELS[lang]['MONTH_1'],
            month3_label: PLAN_LABELS[lang]['MONTH_3'],
            year1_label: PLAN_LABELS[lang]['YEAR_1'],
            month1_price: this.utils.formatPrice('MONTH_1', lang),
            month3_price: this.utils.formatPrice('MONTH_3', lang),
            year1_price: this.utils.formatPrice('YEAR_1', lang),
          }),
          {
            inline_keyboard: [
              planRow('MONTH_1'),
              planRow('MONTH_3'),
              planRow('YEAR_1'),
              [backBtn],
            ],
          },
        );
        return;
      }

      const transactions = await this.prisma.premiumTransaction.findMany({
        where: { owner_id: owner.id, status: 'SUCCESS' },
        take: 4,
        orderBy: { createdAt: 'desc' },
      });

      const dayText = t('premium.premium_active.day');
      const statistics = transactions
        .flatMap((item) => {
          const style = PREMIUM_HISTORY[item.reason];
          if (!style) return [];
          const lines = [
            `${style.emoji} <b>${t(`premium.premium_active.history.${style.key}`)}</b>`,
          ];
          if (item.reason === 'PURCHASE') {
            lines.push(`   📦 ${PLAN_LABELS[lang][item.plan]}`);
          }
          lines.push(
            `   ➕ ${item.duration} ${dayText}`,
            `   📅 ${formatDateTime(item.createdAt, lang)}`,
          );
          return [lines.join('\n')];
        })
        .join('\n\n');

      const daysLeft = Math.max(
        0,
        Math.ceil((subscription.endDate.getTime() - now.getTime()) / DAY_MS),
      );

      await this.utils.safeEditOrReply(
        ctx,
        t('premium.premium_active.active.text', {
          plan: PLAN_LABELS[lang][subscription.plan],
          reason: getPremiumReasonText(subscription.reason, this.i18n, lang),
          start_date: formatDateTime(subscription.startDate, lang),
          end_date: formatDateTime(subscription.endDate, lang),
          statistics: statistics || t('premium.premium_active.no_history'),
          days_left: daysLeft,
        }),
        {
          inline_keyboard: [
            [
              {
                text: t('premium.premium_active.extend'),
                callback_data: `SelectOwnerPremium_extend_${owner.id}`,
              },
            ],
            [backBtn],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async renderNotification(ctx: MyContext, _ownerId: number, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);

      const [unread, read] = await Promise.all([
        this.prisma.notification.count({
          where: { ownerId: owner.id, isRead: false },
        }),
        this.prisma.notification.count({
          where: { ownerId: owner.id, isRead: true },
        }),
      ]);

      const row = (
        emoji: string,
        key: string,
        type: string,
        count?: number,
      ): InlineKeyboardButton[] => [
        {
          text: `${emoji} ${t(key)}${count === undefined ? '' : `  ${count} ${t('notification.count')}`}`,
          callback_data: JSON.stringify({ type, id: owner.id }),
        },
      ];

      await this.utils.safeEditOrReply(ctx, t('notification.title'), {
        inline_keyboard: [
          row('🟢', 'notification.unread', 'notification_unread', unread),
          row('✅', 'notification.read', 'notification_read', read),
          row('📋', 'notification.all', 'notification_all', unread + read),
          row('⚙️', 'notification.settings', 'notification_settings'),
          row('🗑', 'notification.clear', 'notification_clear'),
          [this.btnJson(lang, 'schedule.back', 'phone_back', owner.id)],
        ],
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async notificationSettings(ctx: MyContext, _ownerId: number, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: { id: true, notificationSettings: true },
      });
      if (!owner) throw new Error(`Owner topilmadi: chatID=${ctx.from?.id}`);

      if (!(await this.hasActivePremium(owner.id))) {
        await ctx
          .answerCbQuery(t('premium.premium_notification.only'), {
            show_alert: true,
          })
          .catch(() => undefined);
        return;
      }

      // saqlangan sozlama `null` yoki to'liq bo'lmasa ham yiqilmaydi
      const settings: NotificationSettings_type = {
        ...DefaultNotificationSettings,
        ...(owner.notificationSettings as Partial<NotificationSettings_type>),
      };

      const keys: (keyof NotificationSettings_type)[] = [
        'BOOKING_CONFIRMED',
        'PAYMENT_RECEIVED',
        'CANCELLED_BOOKINGS',
        'DAILY_REPORT',
        'WEEKLY_STATS',
        'PREMIUM_EXPIRY',
      ];
      const rows: InlineKeyboardButton[][] = keys.map((key) => [
        {
          text: `${settings[key] ? '🟢' : '🔴'} ${NotificationLabels[key][lang]}`,
          callback_data: `toggleNotification|${key}|${owner.id}`,
        },
      ]);
      rows.push([
        this.btnJson(lang, 'schedule.back', 'notification_back', owner.id),
      ]);

      await this.utils.safeEditOrReply(
        ctx,
        `⚙️ ${t('notification.settings')}`,
        { inline_keyboard: rows },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async advertisement(
    ctx: MyContext,
    action: string,
    ownerId: number,
    lang: string,
  ) {
    try {
      const t = this.tr(lang);
      const owner = await this.prisma.owners.findFirst({
        where: { id: ownerId, chatID: String(ctx.from?.id) },
        select: { id: true },
      });
      if (!owner) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Owner topilmadi yoki boshqaniki: ${ownerId}`),
          ErrorContext.OWNER,
        );
        return;
      }

      const backRow: InlineKeyboardButton[] = [
        this.btnJson(lang, 'schedule.back', 'advertising', owner.id),
      ];

      switch (action) {
        case 'create':
          ctx.session.step = 'ADVERTISEMENT_TITLE';
          await this.utils.safeEditOrReply(
            ctx,
            t('advertisement.advertisement_title'),
            {
              inline_keyboard: [backRow],
            },
          );
          return;

        case 'list': {
          const grouped = await this.prisma.advertisement.groupBy({
            by: ['status'],
            where: { ownerId: owner.id },
            _count: { _all: true },
          });
          const countOf = (s: AdvertisementStatus) =>
            grouped.find((g) => g.status === s)?._count._all ?? 0;

          const rows: InlineKeyboardButton[][] = [
            AdvertisementStatus.ACTIVE,
            AdvertisementStatus.PENDING,
            AdvertisementStatus.EXPIRED,
          ].map((status) => {
            const count = countOf(status);
            return [
              {
                text: `${t(`advertisement.status.${status}`)} (${count})`,
                callback_data: `advertisements_status_${status}_${owner.id}_${count}_1`,
              },
            ];
          });

          await this.utils.safeEditOrReply(
            ctx,
            t('advertisement.my_advertisements'),
            {
              inline_keyboard: [...rows, backRow],
            },
          );
          return;
        }

        case 'statistics': {
          const ads = await this.prisma.advertisement.findMany({
            where: { ownerId: owner.id },
            include: { stadion: { select: { name: true } } },
          });

          const totalViews = ads.reduce((sum, a) => sum + a.botViewCount, 0);
          if (totalViews === 0) {
            await ctx
              .answerCbQuery(t('advertisement.statistics_not_ready'), {
                show_alert: true,
              })
              .catch(() => undefined);
            return;
          }

          const totalClicks = ads.reduce((sum, a) => sum + a.clickCount, 0);
          const totalChannel = ads.reduce(
            (sum, a) => sum + a.channelSentCount,
            0,
          );
          const ctrOf = (a: { botViewCount: number; clickCount: number }) =>
            a.botViewCount ? a.clickCount / a.botViewCount : 0;
          const top = (score: (a: (typeof ads)[number]) => number) =>
            ads.reduce(
              (best, cur) => (score(cur) > score(best) ? cur : best),
              ads[0],
            );
          const countStatus = (s: AdvertisementStatus) =>
            ads.filter((a) => a.status === s).length;

          const mostViewed = top((a) => a.botViewCount);
          const mostClicked = top((a) => a.clickCount);
          const bestCTR = top(ctrOf);

          await this.utils.safeEditOrReply(
            ctx,
            t('advertisement.statistics', {
              total: ads.length,
              active: countStatus(AdvertisementStatus.ACTIVE),
              pending: countStatus(AdvertisementStatus.PENDING),
              expired: countStatus(AdvertisementStatus.EXPIRED),
              totalViews: formatSum(totalViews),
              totalChannel: formatSum(totalChannel),
              totalClicks: formatSum(totalClicks),
              ctr: ((totalClicks / totalViews) * 100).toFixed(2),
              mostViewedStadium: escapeHtml(mostViewed.stadion.name),
              mostViewedViews: mostViewed.botViewCount,
              mostViewedClicks: mostViewed.clickCount,
              mostClickedStadium: escapeHtml(mostClicked.stadion.name),
              mostClickedClicks: mostClicked.clickCount,
              bestCTRStadium: escapeHtml(bestCTR.stadion.name),
              bestCTR: (ctrOf(bestCTR) * 100).toFixed(2),
              bestCTRViews: bestCTR.botViewCount,
              bestCTRClicks: bestCTR.clickCount,
            }),
            { inline_keyboard: [backRow] },
          );
          return;
        }

        case 'help':
          await this.utils.safeEditOrReply(ctx, t('advertisement.guide'), {
            inline_keyboard: [backRow],
          });
          return;

        default:
          await ctx
            .answerCbQuery(t('error.invalid_action'), { show_alert: true })
            .catch(() => undefined);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  async ownerAdvertisement(
    ctx: MyContext,
    type: string,
    text: string,
    lang: string,
  ) {
    try {
      if (
        type !== 'ADVERTISEMENT_TITLE' &&
        type !== 'ADVERTISEMENT_DESCRIPTION'
      )
        return;

      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);
      ctx.session.advertisements ??= [];
      ctx.session.advertisement ??= EMPTY_AD();
      const draft = ctx.session.advertisement;

      const reject = async (key: string) => {
        await this.replyTracked(ctx, 'advertisements', t(key));
        this.trackUserMessage(ctx);
      };
      const backRow: InlineKeyboardButton[] = [
        this.btnJson(lang, 'schedule.back', 'advertising', owner.id),
      ];

      if (!ctx.message || !('text' in ctx.message)) {
        await reject(
          type === 'ADVERTISEMENT_TITLE'
            ? 'advertisement.title_only_text'
            : 'advertisement.description_only_text',
        );
        return;
      }
      const value = text.trim();

      if (type === 'ADVERTISEMENT_TITLE') {
        if (!value) return reject('advertisement.title_empty');
        if (value.length > AD_TITLE_MAX)
          return reject('advertisement.title_too_long');

        draft.title = value;
        this.trackUserMessage(ctx);
        await this.replyTracked(
          ctx,
          'advertisements',
          t('advertisement.enter_description'),
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [backRow] },
          },
        );
        ctx.session.step = 'ADVERTISEMENT_DESCRIPTION';
        return;
      }

      if (!value) return reject('advertisement.description_empty');
      if (value.length > AD_DESCRIPTION_MAX)
        return reject('advertisement.description_too_long');
      if (AD_CONTACT_PATTERNS.some((re) => re.test(value))) {
        return reject('advertisement.description_invalid');
      }

      draft.description = value;
      this.trackUserMessage(ctx);
      await this.replyTracked(
        ctx,
        'advertisements',
        t('advertisement.enter_image'),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('advertisement.skip_image'),
                  callback_data: JSON.stringify({
                    type: 'advertisement_skip_image',
                  }),
                },
              ],
              [
                {
                  text: t('advertisement.cancel'),
                  callback_data: JSON.stringify({
                    type: 'advertising',
                    id: owner.id,
                  }),
                },
              ],
            ],
          },
        },
      );
      ctx.session.step = 'ADVERTISEMENT_IMAGE';
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async selectAdvertisementStadium(ctx: MyContext, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        include: {
          stadions: {
            where: { admin_status: 'APPROVED', working_status: true },
            select: { id: true, name: true },
          },
        },
      });
      if (!owner) throw new Error(`Owner topilmadi: chatID=${ctx.from?.id}`);

      if (!owner.stadions.length) {
        await this.replyTracked(
          ctx,
          'advertisements',
          t('stadions.not_fount'),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  this.btnJson(
                    lang,
                    'advertisement.cancel',
                    'advertising',
                    owner.id,
                  ),
                ],
              ],
            },
          },
        );
        return;
      }

      await this.replyTracked(
        ctx,
        'advertisements',
        t('advertisement.select_stadium'),
        {
          reply_markup: {
            inline_keyboard: [
              ...owner.stadions.map((item) => [
                {
                  text: `🏟 ${item.name}`,
                  callback_data: JSON.stringify({
                    type: 'advertisement_select_stadium',
                    id: item.id,
                  }),
                },
              ]),
              [
                this.btnJson(
                  lang,
                  'advertisement.cancel',
                  'advertising',
                  owner.id,
                ),
              ],
            ],
          },
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async advertisementPreview(ctx: MyContext, lang: string) {
    try {
      const t = this.tr(lang);
      ctx.session.advertisements ??= [];
      const draft = ctx.session.advertisement;

      const notFound = () =>
        this.replyTracked(
          ctx,
          'advertisements',
          t('advertisement.stadium_not_found'),
        );
      if (!draft?.stadionId || !draft.title || !draft.description) {
        await notFound();
        return;
      }

      const stadion = await this.prisma.stadion.findFirst({
        where: { id: draft.stadionId, owner: { chatID: String(ctx.from?.id) } },
        include: {
          region: true,
          region_items: true,
          owner: { select: { id: true } },
        },
      });
      if (!stadion) {
        await notFound();
        return;
      }

      const locationText =
        stadion.latitude && stadion.longitude
          ? getLocation(
              stadion.latitude,
              stadion.longitude,
              stadion.region.name,
              stadion.region_items.name,
            )
          : t('view.not_available');

      const caption = [
        t('advertisement.preview.title'),
        '━━━━━━━━━━━━━━━',
        `${t('advertisement.preview.stadium')} ${escapeHtml(stadion.name)}`,
        `${t('advertisement.preview.location')} ${locationText}`,
        `${t('advertisement.preview.price')} ${formatSum(stadion.price)} ${t('advertisement.preview.per_hour')}`,
        '━━━━━━━━━━━━━━━',
        `📝 <b>${escapeHtml(draft.title)}</b>\n\n${escapeHtml(draft.description)}`,
        '━━━━━━━━━━━━━━━',
        t('advertisement.preview.shown'),
        t('advertisement.preview.confirm_question'),
      ].join('\n\n');

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: t('advertisement.preview.confirm'),
              callback_data: JSON.stringify({
                type: 'advertisement_confirm',
                id: stadion.owner.id,
              }),
            },
          ],
          [
            {
              text: t('advertisement.preview.cancel'),
              callback_data: JSON.stringify({
                type: 'advertising',
                id: stadion.owner.id,
              }),
            },
          ],
        ],
      };

      const track = (id: number) => ctx.session.advertisements?.push(id);

      if (draft.image && caption.length <= CAPTION_LIMIT) {
        const sent = await ctx.replyWithPhoto(draft.image, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        track(sent.message_id);
        return;
      }
      if (draft.image) {
        const photo = await ctx.replyWithPhoto(draft.image);
        track(photo.message_id);
      }
      const sent = await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      track(sent.message_id);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  async advertisement_created(ctx: MyContext, lang: string) {
    try {
      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);
      ctx.session.advertisements ??= [];
      const fail = (key: string) =>
        this.replyTracked(ctx, 'advertisements', t(key));

      if (!(await this.hasActivePremium(owner.id))) {
        await fail('advertisement.premium_required');
        return;
      }

      const draft = ctx.session.advertisement;
      if (!draft?.stadionId || !draft.title || !draft.description) {
        await fail('advertisement.stadium_not_found');
        return;
      }
      const stadion = await this.prisma.stadion.findFirst({
        where: { id: draft.stadionId, owner_id: owner.id },
        select: { id: true },
      });
      if (!stadion) {
        await fail('advertisement.stadium_not_found');
        return;
      }

      // tugma ikki marta bosilsa ikkita e'lon yaratilmasin: qoralamani avval tozalaymiz,
      // yaratish yiqilsa, qaytarib qo'yamiz
      const snapshot = { ...draft };
      ctx.session.advertisement = EMPTY_AD();
      ctx.session.step = null;

      try {
        await this.prisma.advertisement.create({
          data: {
            ownerId: owner.id,
            stadionId: stadion.id,
            title: snapshot.title!,
            description: snapshot.description!,
            image: snapshot.image,
            expiresAt: new Date(
              Date.now() + ADVERTISEMENT.ACTIVE_DAYS * DAY_MS,
            ),
            status: AdvertisementStatus.PENDING,
          },
        });
      } catch (error) {
        ctx.session.advertisement = snapshot;
        throw error;
      }

      await this.deleteTracked(ctx, 'advertisements');

      await ctx.reply(t('advertisement.created_success'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('schedule.back'), callback_data: 'errorBack_1' }],
          ],
        },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }

  async advertisementStatus(
    ctx: MyContext,
    status: AdvertisementStatus,
    ownerId: number,
    _statusCount: number,
    page: number,
    lang: string,
  ) {
    try {
      const t = this.tr(lang);
      const cfg = AD_LISTS[status];
      if (!cfg) throw new Error(`Noto'g'ri reklama holati: ${status}`);

      const owner = await this.prisma.owners.findFirst({
        where: { id: ownerId, chatID: String(ctx.from?.id) },
        select: { id: true },
      });
      if (!owner)
        throw new Error(`Owner topilmadi yoki boshqaniki: ${ownerId}`);

      const where: Prisma.AdvertisementWhereInput = {
        ownerId: owner.id,
        status,
      };
      const total = await this.prisma.advertisement.count({ where });
      if (!total) {
        await ctx
          .answerCbQuery(t(cfg.empty), { show_alert: true })
          .catch(() => undefined);
        return;
      }


      const totalPages = Math.ceil(total / cfg.limit);
      const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);

      const items = await this.prisma.advertisement.findMany({
        where,
        include: { stadion: { select: { name: true } } },
        orderBy: cfg.orderBy,
        skip: (currentPage - 1) * cfg.limit,
        take: cfg.limit,
      });

      let text: string;
      const rows: InlineKeyboardButton[][] = [];

      if (status === AdvertisementStatus.EXPIRED) {
        text = [
          t('advertisement.expired_list_title'),
          ...items.map((item, index) =>
            t('advertisement.expired_item', {
              index: (currentPage - 1) * cfg.limit + index + 1,
              stadium: escapeHtml(item.stadion.name),
              title: escapeHtml(item.title),
              clicks: item.clickCount,
              views: item.botViewCount,
              channel: item.channelSentCount,
              expiredAt: formatDateTime(item.expiresAt, lang),
            }),
          ),
        ].join('\n\n');
      } else {
        const item = items[0];
        const common = {
          stadium: escapeHtml(item.stadion.name),
          title: escapeHtml(item.title),
          description: escapeHtml(item.description),
        };

        if (status === AdvertisementStatus.ACTIVE) {
          text = t('advertisement.active_info', {
            ...common,
            clickCount: item.clickCount,
            botViewCount: item.botViewCount,
            channelSentCount: item.channelSentCount,
            timeLeft: this.utils.bookingTimeCalculate(item.expiresAt, lang)
              .timeLeftText,
          });
        } else {
          text = t('advertisement.pending_info', {
            ...common,
            createdAt: formatDateTime(item.createdAt, lang),
          });

          const activeCount = await this.prisma.advertisement.count({
            where: { ownerId: owner.id, status: AdvertisementStatus.ACTIVE },
          });
          const deleteBtn: InlineKeyboardButton = {
            text: t('advertisement.delete'),
            callback_data: `advertisementPending_delete_${item.id}_${lang}`,
          };
          if (activeCount >= 2) {
            rows.push(
              [
                {
                  text: t('advertisement.activate_limit'),
                  callback_data: `advertisementPending_ignore_${item.id}_${lang}`,
                },
              ],
              [deleteBtn],
            );
          } else {
            rows.push([
              {
                text: t('advertisement.activate'),
                callback_data: `advertisementPending_activate_${item.id}_${lang}`,
              },
              deleteBtn,
            ]);
          }
        }
      }

      if (totalPages > 1) {
        const pageCb = (n: number) =>
          `advertisements_status_${status}_${owner.id}_${total}_${n}`;
        const pagination: InlineKeyboardButton[] = [];
        if (currentPage > 1) {
          pagination.push({
            text: t('stadions.Previous'),
            callback_data: pageCb(currentPage - 1),
          });
        }
        pagination.push({
          text: `${currentPage}/${totalPages}`,
          callback_data: 'ignore',
        });
        if (currentPage < totalPages) {
          pagination.push({
            text: t('stadions.Next'),
            callback_data: pageCb(currentPage + 1),
          });
        }
        rows.push(pagination);
      }
      rows.push([
        {
          text: t('schedule.back'),
          callback_data: `advertisementList_${owner.id}_${lang}`,
        },
      ]);

      await this.utils.safeEditOrReply(ctx, text, { inline_keyboard: rows });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  async advertisement_checking(
    ctx: MyContext,
    type: string,
    advertisementId: number,
    lang: string,
  ) {
    try {
      const t = this.tr(lang);
      const owner = await this.requireOwner(ctx);
      const toast = (key: string, args?: Record<string, unknown>) =>
        ctx
          .answerCbQuery(t(key, args), { show_alert: true })
          .catch(() => undefined);

      switch (type) {
        case 'ignore':
          await toast('advertisement.active_limit_reached');
          return;

        case 'activate': {
          if (!(await this.hasActivePremium(owner.id))) {
            await toast('advertisement.premium_required');
            return;
          }
          const activeCount = await this.prisma.advertisement.count({
            where: { ownerId: owner.id, status: AdvertisementStatus.ACTIVE },
          });
          if (activeCount >= 2) {
            await toast('advertisement.active_limit_reached');
            return;
          }

          const res = await this.prisma.advertisement.updateMany({
            where: {
              id: advertisementId,
              ownerId: owner.id,
              status: AdvertisementStatus.PENDING,
            },
            data: {
              status: AdvertisementStatus.ACTIVE,
              expiresAt: new Date(
                Date.now() + ADVERTISEMENT.ACTIVE_DAYS * DAY_MS,
              ),
            },
          });
          if (res.count === 0) {
            await toast('advertisement.activate_not_found');
            return;
          }
          await toast('advertisement.activated_success', {
            days: ADVERTISEMENT.ACTIVE_DAYS,
          });
          await this.advertisement(ctx, 'list', owner.id, lang);
          return;
        }

        case 'delete': {
          const res = await this.prisma.advertisement.deleteMany({
            where: {
              id: advertisementId,
              ownerId: owner.id,
              status: AdvertisementStatus.PENDING,
            },
          });
          if (res.count === 0) {
            await toast('advertisement.not_found');
            return;
          }
          await toast('advertisement.deleted_success');
          await this.advertisement(ctx, 'list', owner.id, lang);
          return;
        }

        default:
          throw new Error(`advertisement_checking: noma'lum tur: ${type}`);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    }
  }
}
