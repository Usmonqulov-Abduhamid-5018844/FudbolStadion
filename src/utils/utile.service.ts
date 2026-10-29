import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Booking_status, Pay_method, Payments, Prisma } from '@prisma/client';
import { subDays } from 'date-fns';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import {
  back_owner_Keyboard,
  back_user_Keyboard,
  helpMenuKeyboard_Owner,
  helpMenuKeyboard_Users,
} from 'src/helpers/Inline_keybort';
import {
  CURRENCY_LABELS,
  IBooking,
  PREMIUM_PLANS,
} from 'src/helpers/interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Telegraf } from 'telegraf';
import {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ParseMode,
} from 'telegraf/types';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Decimal } from '@prisma/client/runtime/library';
import { escapeHtml } from 'src/helpers/stadions';
import { formatDate, formatDateTime } from 'src/helpers/dateFormat';
import { AlertService } from 'src/alert/alert.service';
import {
  AlertType,
  CONTEXT_ALERT,
  ErrorContext,
  ErrorLevel,
} from 'src/helpers/interface/enum';
import { APP_TZ } from 'src/helpers/dateFormat';

export interface TimeSlot {
  start: string;
  end: string;
}
const MAX_FIELD_LENGTH = 100;
const ALERT_TITLE_MESSAGE_LENGTH = 80;
const SUPPORTED_LANGS = ['uz', 'ru', 'en'] as const;
const DEFAULT_LANG = 'uz';

@Injectable()
export class UtilisService implements OnModuleInit {
  private readonly logger = new Logger(UtilisService.name);
  constructor(
    @InjectBot() private readonly Bot: Telegraf,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly alert: AlertService,
  ) {}

  private normalizeLang(raw?: string | null): string {
    const code = raw?.toLowerCase().split('-')[0];
    return code && (SUPPORTED_LANGS as readonly string[]).includes(code)
      ? code
      : DEFAULT_LANG;
  }
  private shouldFallbackToReply(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    // Bir xil tugma qayta bosildi: matn o'zgarmagan, dublikat xabar yubormaymiz
    if (msg.includes('message is not modified')) return false;
    this.logger.debug(`editMessageText fallback: ${msg.slice(0, 200)}`);
    return true;
  }

  async onModuleInit() {
    try {
      await this.Bot.telegram.setMyCommands([
        { command: 'start', description: 'start' },
      ]);
    } catch (error) {
      this.logger.error(
        'setMyCommands xatosi',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async isChecket(
    chatID: string,
    ctx: MyContext,
  ): Promise<'owner' | 'user' | 'none' | 'error'> {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { chatID },
        select: { id: true },
      });
      if (owner) return 'owner';

      const user = await this.prisma.users.findUnique({
        where: { chatID },
        select: { id: true },
      });
      return user ? 'user' : 'none';
    } catch (error) {
      await this.errorFunction(ctx, error, ErrorContext.COMMON);
      return 'error';
    }
  }
  async langs(ctx: MyContext): Promise<string> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return DEFAULT_LANG;

    try {
      const data = await this.prisma.sesion.findUnique({
        where: { chat_id: String(telegramId) },
        select: { lang: true },
      });
      return this.normalizeLang(data?.lang ?? ctx.from?.language_code);
    } catch (error) {
      this.logger.debug(
        `langs: sesion o'qilmadi, Telegram tiliga o'tildi: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.normalizeLang(ctx.from?.language_code);
    }
  }

  async safeEditOrReply(
    ctx: MyContext,
    text: string,
    keyboard?: InlineKeyboardMarkup,
    parse_mode: ParseMode = 'HTML',
  ) {
    try {
      await ctx.editMessageText(text, { parse_mode, reply_markup: keyboard });
    } catch (error) {
      if (!this.shouldFallbackToReply(error)) return;
      await ctx.reply(text, { parse_mode, reply_markup: keyboard });
    }
  }

  async safeEditHelpReplyOwner(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...back_owner_Keyboard(this.i18n, String(lang)),
      });
    } catch (error) {
      if (!this.shouldFallbackToReply(error)) return;
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...back_owner_Keyboard(this.i18n, String(lang)),
      });
    }
  }
  async safeEditHelpReplyUser(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...back_user_Keyboard(this.i18n, String(lang)),
      });
    } catch (error) {
      if (!this.shouldFallbackToReply(error)) return;
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...back_user_Keyboard(this.i18n, String(lang)),
      });
    }
  }

  async safeEditHelpMenuReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        helpMenuKeyboard_Owner(this.i18n, String(lang)),
      );
    } catch (error) {
      if (!this.shouldFallbackToReply(error)) return;
      await ctx.reply(text, helpMenuKeyboard_Owner(this.i18n, String(lang)));
    }
  }
  async safeEditHelpMenuReply_User(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        helpMenuKeyboard_Users(this.i18n, String(lang)),
      );
    } catch (error) {
      if (!this.shouldFallbackToReply(error)) return;
      await ctx.reply(text, helpMenuKeyboard_Users(this.i18n, String(lang)));
    }
  }

  toMinutesRaw(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
  toMinutes(time: string): number {
    return this.toMinutesRaw(time);
  }

  private formatTimeLeft(totalMinutes: number, lang: string): string {
    const t = Math.max(0, totalMinutes);
    const days = Math.floor(t / 1440);
    const hours = Math.floor((t % 1440) / 60);
    const minutes = t % 60;
    if (days > 0)
      return this.i18n.translate('booking.time_left.days_hours_minutes', {
        lang,
        args: { days, hours, minutes },
      });
    if (hours > 0)
      return this.i18n.translate('booking.time_left.hours_minutes', {
        lang,
        args: { hours, minutes },
      });
    return this.i18n.translate('booking.time_left.minutes_only', {
      lang,
      args: { minutes },
    });
  }

  bookingTimeCalculate(startAt: Date, lang = 'ru') {
    const t = this.timeUntil(startAt);
    return { ...t, timeLeftText: this.formatTimeLeft(t.totalMinutes, lang) };
  }

  premium_End_time(end_time: Date, lang = 'ru') {
    const { totalMinutes } = this.timeUntil(new Date(end_time));
    return {
      timeLeftText: this.formatTimeLeft(totalMinutes, lang),
      expired: totalMinutes <= 0,
      totalMinutes,
    };
  }

  booking_status_handler(
    status: Booking_status,
    id: number,
    booking_peyments: Pay_method,
    stadion_peyments: Payments,
    startAt: Date,
    endAt: Date,
    page: number,
    limit: number,
    total: number,
    check_in: boolean,
    lang: string,
  ) {
    const buttons: InlineKeyboardButton[][] = [];
    const isSinglePage = page === 1 && Math.ceil(total / limit) === 1;

    const { totalMinutes, timeLeftText } = this.bookingTimeCalculate(
      startAt,
      lang,
    );
    const { totalMinutes: endMinutes } = this.timeUntil(endAt);

    const t = (key: string): string => this.i18n.translate(key, { lang });

    const backBtn = { text: t('schedule.back'), callback_data: 'back_user_5' };
    const cancelBtn = {
      text: t('booking.cancel'),
      callback_data: `booking_confirm_cancelChecking_${id}`,
    };
    const confirmBtn = {
      text: t('booking.confirm'),
      callback_data: `booking_confirm_confirm_${id}`,
    };
    const changePaymentBtn = {
      text: t('booking.change_payment_method'),
      callback_data: `booking_confirm_selectPeyments_${id}`,
    };
    const qrBtn = {
      text: t('booking.qr_button'),
      callback_data: `booking_confirm_QR_${id}`,
    };
    const payBtn = {
      text: t('booking.pay_by_card'),
      callback_data: `booking_confirm_paymentChange-${page}_${id}`,
    };

    if (status === 'PENDING') {
      if (booking_peyments === 'CASH') {
        if (stadion_peyments === 'GIBRID') buttons.push([changePaymentBtn]);
        buttons.push([confirmBtn, cancelBtn]);
      }
      if (booking_peyments === 'CARD') {
        buttons.push([payBtn, cancelBtn]);
      }
    }

    if (status === 'CONFIRMED' || status === 'PAID') {
      if (check_in) {
        if (isSinglePage) buttons.push([backBtn]);
        return buttons;
      }

      if (canCancelBooking(totalMinutes)) {
        if (booking_peyments === 'CASH' && stadion_peyments === 'GIBRID') {
          buttons.push([changePaymentBtn]);
        }
        if (status !== 'PAID' && booking_peyments === 'CARD') {
          buttons.push([payBtn]);
        }
        buttons.push([cancelBtn]);
      } else if (totalMinutes > 0) {
        buttons.push([
          { text: timeLeftText, callback_data: `booking_confirm_alerd_${id}` },
          qrBtn,
        ]);
      } else if (endMinutes >= 0) {
        buttons.push([qrBtn]);
      }
    }

    if (isSinglePage) buttons.push([backBtn]);

    return buttons;
  }

  ///////////////Error function
  private classify(error: unknown, context?: ErrorContext): ErrorLevel {
    if (context === ErrorContext.SILENT) return 'silent';
    const msg = error instanceof Error ? error.message : '';

    if (msg.includes('message is not modified')) return 'ignore';
    if (msg.includes('query is too old')) return 'ignore';
    if (msg.includes('query ID is invalid')) return 'ignore';
    if (msg.includes('bot was blocked by the user')) return 'blocked';
    if (msg.includes('user is deactivated')) return 'blocked';
    if (msg.includes('chat not found')) return 'blocked';

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' || error.code === 'P2025') return 'warn';
    }

    if (context && CONTEXT_ALERT[context] !== undefined) return 'critical';
    return 'error';
  }

  private buildContextInfo(ctx: MyContext, context?: string): string {
    const callbackData =
      ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : undefined;

    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

    return [
      context && `context: ${context}`,
      ctx.from?.id && `userId: ${ctx.from.id}`,
      ctx.from?.username && `username: @${ctx.from.username}`,
      ctx.chat?.id && `chatId: ${ctx.chat.id}`,
      callbackData && `callback_data: ${callbackData}`,
      messageText && `message: ${this.maskSensitive(messageText)}`,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private maskSensitive(text: string): string {
    const masked = text.replace(/\+?\d[\d\s()-]{7,}\d/g, (m) => {
      const digits = m.replace(/\D/g, '');
      return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
    });
    return masked.length > MAX_FIELD_LENGTH
      ? `${masked.slice(0, MAX_FIELD_LENGTH)}...`
      : masked;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error === undefined || error === null) return '';
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private async safeLang(ctx: MyContext): Promise<string> {
    try {
      return await this.langs(ctx);
    } catch {
      return 'uz';
    }
  }

  async errorFunction(
    ctx: MyContext,
    error?: unknown,
    context?: ErrorContext,
  ): Promise<void> {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery().catch(() => undefined);
    }

    let level: ErrorLevel = 'error';
    let contextInfo = '';

    try {
      level = this.classify(error, context);
      if (level !== 'silent') {
        contextInfo = this.buildContextInfo(ctx, context);
        const message = this.errorMessage(error);
        const logText = `Xatolik [${contextInfo}]: ${message}`;

        if (level === 'ignore') {
          this.logger.debug(logText);
        } else if (level === 'blocked' || level === 'warn') {
          this.logger.warn(logText);
        } else {
          this.logger.error(
            logText,
            error instanceof Error ? error.stack : undefined,
          );
        }

        if (level === 'critical') {
          this.alert
            .notify(
              `Critical: ${context ?? 'unknown'} | ${message.slice(0, ALERT_TITLE_MESSAGE_LENGTH)}`,
              `${contextInfo}\n${message}`,
              (context && CONTEXT_ALERT[context]) ?? AlertType.ERROR,
            )
            .catch(() => undefined);
        }
      }
    } catch (internalError) {
      this.logger.error(
        'errorFunction ichida xatolik',
        internalError instanceof Error
          ? internalError.stack
          : String(internalError),
      );
    }

    if (level === 'ignore' || level === 'blocked') return;

    const lang = await this.safeLang(ctx);

    let errorText: string;
    let backText: string;
    try {
      errorText = this.i18n.translate('error.error', { lang });
      backText = this.i18n.translate('schedule.back', { lang });
    } catch {
      errorText = 'Xatolik yuz berdi. Qayta urinib ko‘ring.';
      backText = '⬅️';
    }

    await ctx
      .reply(errorText, {
        reply_markup: {
          inline_keyboard: [[{ text: backText, callback_data: 'errorBack_1' }]],
        },
      })
      .catch((replyError: unknown) => {
        this.logger.error(
          `errorFunction: userga xabar yuborib bo'lmadi [${contextInfo}]`,
          replyError instanceof Error ? replyError.stack : String(replyError),
        );
      });
  }

  ///////////////////⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️///////////////////////////////

  buildOwnerBookingButtons(
    booking: IBooking,
    page: number,
    lang: string,
    type: string,
    callback_data: string,
  ) {
    const t = (key: string): string => this.i18n.translate(key, { lang });
    const button: InlineKeyboardButton[][] = [];

    const makeCb = (action: string) => {
      const cb = `bookingChild_${action}_${booking.id}_${page}_${type}_${callback_data}`;
      if (Buffer.byteLength(cb) > 64) {
        this.logger.error(`callback_data 64 baytdan oshdi: ${cb}`);
      }
      return cb;
    };

    const { totalMinutes } = this.timeUntil(booking.startAt);
    const { totalMinutes: endMinutes } = this.timeUntil(booking.endAt);

    const detailBtn = {
      text: t('owner_booking.buttons.detail'),
      callback_data: makeCb('detail'),
    };
    const checkInBtn = {
      text: t('owner_booking.buttons.check_in'),
      callback_data: makeCb('checkin'),
    };
    const cancelBtn = {
      text: t('owner_booking.buttons.cancel'),
      callback_data: makeCb('cancel'),
    };

    switch (booking.status) {
      case 'PAID':
        if (!booking.check_in && totalMinutes <= 60 && endMinutes > 0) {
          button.push([detailBtn, checkInBtn]);
        } else {
          button.push([detailBtn]);
        }
        break;

      case 'CONFIRMED':
        if (!booking.check_in) {
          if (totalMinutes > 60) {
            button.push([detailBtn, cancelBtn]);
          } else if (totalMinutes >= 0) {
            button.push([detailBtn, cancelBtn]);
            button.push([checkInBtn]);
          } else if (endMinutes > 0) {
            button.push([detailBtn, checkInBtn]);
          } else {
            button.push([detailBtn]);
          }
        } else {
          button.push([detailBtn]);
        }
        break;

      case 'PENDING':
        button.push([detailBtn, cancelBtn]);
        break;

      case 'COMPLETED':
      case 'NOSHOW':
      case 'CANCELED':
      case 'REFUNDED':
        button.push([detailBtn]);
        break;
    }

    let backCb: string;
    if (callback_data === 'bookingFilter') {
      const ownerId = booking.stadion.owner?.id ?? booking.stadion.owner_id;
      backCb = `bookingAllData_STADION.${booking.stadion.id}_${ownerId}_${page}`;
    } else if (type.startsWith('STATUS.')) {
      backCb = `bookingAllData_status_${booking.stadion.owner_id}_${page}`;
    } else {
      backCb = 'back_owner_7';
    }

    button.push([{ text: t('schedule.back'), callback_data: backCb }]);

    return button;
  }

  async deleteClickedMessage(ctx: MyContext) {
    const query = ctx.callbackQuery;
    const id =
      query && 'message' in query ? query.message?.message_id : undefined;
    if (id) await ctx.deleteMessage(id).catch(() => undefined);
  }

  async clearSessionMessages(ctx: MyContext) {
    if (ctx.session.ownerActiveBooking?.length) {
      await ctx
        .deleteMessages(ctx.session.ownerActiveBooking)
        .catch(() => undefined);
      ctx.session.ownerActiveBooking = [];
    }
  }

  async sendPagination(
    ctx: MyContext,
    page: number,
    total: number,
    limit: number,
    lang: string,
    callback: string,
  ) {
    try {
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
      if (totalPages <= 1) return;

      const buttons: InlineKeyboardButton[] = [];

      if (page > 1) {
        buttons.push({
          text: this.i18n.translate('stadions.Previous', { lang }),
          callback_data: `${callback}_${page - 1}`,
        });
      }

      buttons.push({
        text: `${page} / ${totalPages}`,
        callback_data: 'ignore',
      });

      if (page < totalPages) {
        buttons.push({
          text: this.i18n.translate('stadions.Next', { lang }),
          callback_data: `${callback}_${page + 1}`,
        });
      }

      const send = await ctx.reply(
        this.i18n.translate('stadions.Select', { lang }),
        { reply_markup: { inline_keyboard: [buttons] } },
      );

      ctx.session.ownerActiveBooking ??= [];
      ctx.session.ownerActiveBooking.push(send.message_id);
    } catch (error) {
      await this.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  ////////////////////⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️////////////////////////////////

  async growthBooking(ctx: MyContext, ownerId: number, lang: string) {
    try {
      const z = toZonedTime(new Date(), APP_TZ);
      const base = new Date(
        Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()),
      );
      const current = await this.prisma.booking.count({
        where: {
          status: 'COMPLETED',
          stadion: { owner_id: ownerId },
          date: {
            gte: subDays(base, 7),
            lt: base,
          },
        },
      });
      const previous = await this.prisma.booking.count({
        where: {
          status: 'COMPLETED',
          stadion: { owner_id: ownerId },
          date: {
            gte: subDays(base, 14),
            lt: subDays(base, 7),
          },
        },
      });
      let growth = 0;

      if (previous === 0) {
        growth = current > 0 ? 100 : 0;
      } else {
        growth = ((current - previous) / previous) * 100;
      }
      const text =
        growth > 0
          ? this.i18n.translate('owner_booking.growth_increase', {
              args: { value: growth.toFixed(1) },
              lang,
            })
          : growth < 0
            ? this.i18n.translate('owner_booking.growth_decrease', {
                args: { value: growth.toFixed(1) },
                lang,
              })
            : this.i18n.translate('owner_booking.growth_no_change', { lang });

      return text;
    } catch (error) {
      await this.errorFunction(ctx, error, ErrorContext.OWNER);
      return '';
    }
  }

  private localeOf(lang: string): string {
    return lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
  }

  groupByDay(bookings: { date: Date }[], lang: string) {
    const locale = this.localeOf(lang);
    const map: Record<string, number> = {};

    bookings.forEach((b) => {
      const day = b.date.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
        timeZone: 'UTC',
      });
      map[day] = (map[day] || 0) + 1;
    });

    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }

  fillLast7Days(data: { label: string; value: number }[], lang: string) {
    const locale = this.localeOf(lang);
    const today = toZonedTime(new Date(), APP_TZ);
    const days: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - i),
      );
      days.push(
        d.toLocaleDateString(locale, {
          day: '2-digit',
          month: 'long',
          timeZone: 'UTC',
        }),
      );
    }

    const map = Object.fromEntries(data.map((d) => [d.label, d.value]));
    return days.map((day) => ({ label: day, value: map[day] || 0 }));
  }

  progressChart(data: { label: string; value: number }[], lang: string) {
    const max = Math.max(1, ...data.map((d) => d.value));

    const unit = this.i18n.translate('owner_booking.unit_count', { lang });

    return data
      .map((d) => {
        const percent = Math.round((d.value / max) * 100);
        const len = Math.round(percent / 10);
        return `${d.label} [ ${'▰'.repeat(len)}${'▱'.repeat(10 - len)} ] ${d.value} ${d.value > 0 ? unit : ''}`;
      })
      .join('\n');
  }

  detectSearchType(input?: string) {
    if (!input) {
      return {
        type: 'invalid',
        value: '',
        error: 'EMPTY_INPUT',
      };
    }

    const value = input.trim();

    if (!value) {
      return {
        type: 'invalid',
        value: '',
        error: 'EMPTY_INPUT',
      };
    }

    const digits = value.replace(/\D/g, '');

    let phone: string | null = null;

    if (digits.length === 9) {
      phone = '+998' + digits;
    } else if (digits.length === 12 && digits.startsWith('998')) {
      phone = '+' + digits;
    }

    if (phone) {
      return { type: 'phone', value: phone };
    }

    if (/^\d{1,8}$/.test(value)) {
      return { type: 'id', value: Number(value) };
    }

    return { type: 'name', value };
  }

  addDays(plan: string) {
    const PLAN_DAYS: Record<string, number> = {
      MONTH_1: 30,
      MONTH_3: 90,
      YEAR_1: 365,
    };
    const days = PLAN_DAYS[plan];
    if (!days) throw new Error(`Unknown plan: ${plan}`);

    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  formatPrice = (plan: keyof typeof PREMIUM_PLANS, lang: string) => {
    const p = PREMIUM_PLANS[plan];
    const currency = CURRENCY_LABELS[lang] ?? CURRENCY_LABELS[DEFAULT_LANG];
    if (p.discount) {
      return `${formatSum(p.price)} ${currency}\n\n❌ <s>${formatSum(p.discount)} ${currency}</s>`;
    }
    return `${formatSum(p.price)} ${currency}`;
  };
  //////////////////////////////////////////////////////////////////////

  relativeMinutes(time: string, referenceStart: string): number {
    const ref = this.toMinutesRaw(referenceStart);
    let t = this.toMinutesRaw(time);
    if (t < ref) t += 24 * 60;
    return t - ref;
  }

  private minutesToTimeStr(totalMinutes: number): string {
    const m = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  }

  private normalizeRange(start: string, end: string) {
    const startRel = 0;
    const endRel = this.relativeMinutes(end, start);
    const fixedEndRel = endRel === 0 ? 1440 : endRel;
    return { startRel, endRel: fixedEndRel };
  }

  async generateSlots(
    start: string,
    end: string,
    intervalMinutes = 60,
  ): Promise<TimeSlot[]> {
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      throw new Error(
        `generateSlots: intervalMinutes noto'g'ri (${intervalMinutes})`,
      );
    }

    const slots: TimeSlot[] = [];
    const { endRel: finish } = this.normalizeRange(start, end);

    let current = 0;

    while (current + intervalMinutes <= finish) {
      const to = current + intervalMinutes;

      slots.push({
        start: this.minutesToTimeStr(this.toMinutesRaw(start) + current),
        end: this.minutesToTimeStr(this.toMinutesRaw(start) + to),
      });

      current += intervalMinutes;
    }

    return slots;
  }

  isSlotFree(
    slot: TimeSlot,
    bookings: { start_time: string; end_time: string }[],
    referenceStart: string,
  ): boolean {
    const slotStart = this.relativeMinutes(slot.start, referenceStart);
    let slotEnd = this.relativeMinutes(slot.end, referenceStart);
    if (slotEnd <= slotStart) slotEnd += 1440;

    for (const b of bookings) {
      const bookingStart = this.relativeMinutes(b.start_time, referenceStart);
      let bookingEnd = this.relativeMinutes(b.end_time, referenceStart);
      if (bookingEnd <= bookingStart) bookingEnd += 1440;

      if (bookingStart < slotEnd && bookingEnd > slotStart) {
        return false;
      }
    }
    return true;
  }

  isCurrentTimeAfter(
    currentTime: string,
    scheduleStart: string,
    referenceStart: string,
  ): boolean {
    const cur = this.relativeMinutes(currentTime, referenceStart);
    const sched = this.relativeMinutes(scheduleStart, referenceStart);
    return cur > sched;
  }

  roundUpToNextHour(date: Date): Date {
    const rounded = new Date(date);
    if (
      rounded.getMinutes() > 0 ||
      rounded.getSeconds() > 0 ||
      rounded.getMilliseconds() > 0
    ) {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0, 0, 0);
    }
    return rounded;
  }

  currentLocalTimeRoundedUpInfo(): { time: string; isNextDay: boolean } {
    const z = toZonedTime(new Date(), APP_TZ);
    let h = z.getHours();
    if (z.getMinutes() > 0 || z.getSeconds() > 0) h += 1;
    const isNextDay = h >= 24;
    return { time: `${String(h % 24).padStart(2, '0')}:00`, isNextDay };
  }

  currentLocalTimeRoundedUp(): string {
    return this.currentLocalTimeRoundedUpInfo().time;
  }

  calculateTotalPrice(
    start: string,
    end: string,
    pricePerHour: number,
    noshowCount: number,
  ) {
    const { endRel: durationMinutes } = this.normalizeRange(start, end);
    const durationHours = durationMinutes / 60;

    let penalty = 0;
    let total = 0;
    if (noshowCount >= 2) {
      penalty = (noshowCount - 1) * 20000;
      total = durationHours * pricePerHour + penalty;
    } else {
      total = durationHours * pricePerHour;
    }

    return {
      total,
      penalty,
      price: durationHours * pricePerHour,
      hors: durationHours,
    };
  }

  calculateTotalPrice_Admins(start: string, end: string, pricePerHour: number) {
    const { endRel: durationMinutes } = this.normalizeRange(start, end);
    const durationHours = durationMinutes / 60;

    let total = durationHours * pricePerHour;

    return {
      total,
      price: durationHours * pricePerHour,
      hors: durationHours,
    };
  }

  combineDateAndTime(
    baseDate: Date,
    time: string,
    referenceStart: string,
  ): Date {
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth();
    const day = baseDate.getUTCDate();

    const [refH, refM] = referenceStart.split(':').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = `${year}-${pad(month + 1)}-${pad(day)}T${pad(refH)}:${pad(refM)}:00`;
    const referenceInstant = fromZonedTime(isoLocal, APP_TZ);

    const relMinutes = this.relativeMinutes(time, referenceStart);
    return new Date(referenceInstant.getTime() + relMinutes * 60000);
  }

  localInstant(baseDate: Date, time: string): Date {
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth();
    const day = baseDate.getUTCDate();
    const [h, m] = time.split(':').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = `${year}-${pad(month + 1)}-${pad(day)}T${pad(h)}:${pad(m)}:00`;
    return fromZonedTime(isoLocal, APP_TZ);
  }

  isSameLocalDay(a: Date, b: Date): boolean {
    const za = toZonedTime(a, APP_TZ);
    const zb = toZonedTime(b, APP_TZ);
    return (
      za.getFullYear() === zb.getFullYear() &&
      za.getMonth() === zb.getMonth() &&
      za.getDate() === zb.getDate()
    );
  }
  currentLocalTime(): string {
    const z = toZonedTime(new Date(), APP_TZ);
    return `${String(z.getHours()).padStart(2, '0')}:${String(z.getMinutes()).padStart(2, '0')}`;
  }

  buildCalendarDate(year: number, month1to12: number, day: number): Date {
    return new Date(Date.UTC(year, month1to12 - 1, day));
  }

  isRangeFree(
    slotStart: Date,
    slotEnd: Date,
    bookings: { startAt: Date; endAt: Date }[],
  ): boolean {
    for (const b of bookings) {
      if (b.startAt < slotEnd && b.endAt > slotStart) {
        return false;
      }
    }
    return true;
  }

  formatCalendarDate(date: Date): string {
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}.${m}.${y}`;
  }

  bookingTimeCalculateRaw(date: Date, start_time: string) {
    return this.timeUntil(this.localInstant(date, start_time));
  }

  timeUntil(startAt: Date) {
    const now = new Date();
    const diffMs = startAt.getTime() - now.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);

    const daysLeft = Math.floor(totalMinutes / 1440);
    const hoursLeft = Math.floor((totalMinutes % 1440) / 60);
    const minutesLeft = totalMinutes % 60;

    return { totalMinutes, daysLeft, hoursLeft, minutesLeft };
  }

  private get adminChatIds(): string[] {
    const raw = [process.env.ADMIN_CHAT_ID, process.env.SUPPER_ADMIN]
      .filter(Boolean)
      .join(',');
    return [
      ...new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }

  async notifyAdmins(text: string): Promise<void> {
    const ids = this.adminChatIds;
    if (ids.length === 0) {
      this.logger.warn(
        'Admin chat ID lar .env da topilmadi, xabar yuborilmadi',
      );
      return;
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        this.Bot.telegram.sendMessage(id, text, { parse_mode: 'HTML' }),
      ),
    );

    const failed = results.flatMap((r, i) =>
      r.status === 'rejected'
        ? [
            `Admin ${ids[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
          ]
        : [],
    );

    if (failed.length) {
      this.logger.error(failed.join(' | '));
      await this.alert.notify(
        'Adminga xabar yuborilmadi',
        failed.join('\n'),
        AlertType.ERROR,
      );
    }
  }

  async refountadministratorSent(p: {
    bookingId: number;
    stadionName?: string;
    date: Date;
    startTime: string;
    endTime: string;
    amount: number;
    transactionId: string;
    orderId: string | null;
    paymentId: string;
    paidAt?: Date | null;
    userName?: string | null;
    username?: string | null;
    userChatId?: string | number | bigint | null;
    phone?: string | null;
  }): Promise<void> {
    const userLines = [
      p.userName
        ? p.userChatId
          ? `• <a href="tg://user?id=${p.userChatId}">${escapeHtml(p.userName)}</a>`
          : `• ${escapeHtml(p.userName)}`
        : null,
      p.username
        ? `• <a href="https://t.me/${escapeHtml(p.username)}">@${escapeHtml(p.username)}</a>`
        : null,
      p.phone ? `• 📞 <code>${escapeHtml(p.phone)}</code>` : null,
      p.userChatId ? `• 🆔 <code>${p.userChatId}</code>` : null,
    ].filter(Boolean);

    const details = [
      "<i>Paylov kabineti orqali, to'liq summa</i>",
      '',
      `📅 <b>Bron #${p.bookingId}</b>${p.stadionName ? ` · ${escapeHtml(p.stadionName)}` : ''}`,
      `🗓 ${formatDate(p.date, 'uz')}`,
      `⏰ ${p.startTime}–${p.endTime}`,
      '',
      `💰 <b>${formatSum(p.amount)} so'm</b>`,
      '',
      '👤 <b>Mijoz</b>',
      ...(userLines.length ? userLines : ["• noma'lum"]),
      '',
      '🔎 <b>Kabinetda qidirish uchun</b>',
      `<blockquote>Payment: <code>${escapeHtml(p.paymentId)}</code>\nOrder: <code>${escapeHtml(p.orderId ?? '-')}</code>\nTranzaksiya: <code>${escapeHtml(p.transactionId)}</code>${
        p.paidAt ? `\nTo'langan: ${formatDateTime(p.paidAt, 'uz')}` : ''
      }</blockquote>`,
      '',
      "👉 <i>Paylov kabinetida shu to'lovni topib, to'liq qaytaring.</i>",
    ].join('\n');

    const sent = await this.alert.notify(
      `<b>Qaytarish kerak</b> · Bron #${p.bookingId}`,
      details,
      AlertType.REFUND,
      { parseMode: 'HTML' },
    );
    if (!sent)
      await this.notifyAdmins(`💸 <b>Qaytarish kerak</b>\n\n${details}`);
  }

  todayLocal(): Date {
    const z = toZonedTime(new Date(), APP_TZ);
    return new Date(Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()));
  }
}

export const MIN_CANCEL_HOURS_BEFORE = 5;

export const canCancelBooking = (totalMinutes: number): boolean =>
  totalMinutes >= MIN_CANCEL_HOURS_BEFORE * 60;

export const formatSum = (value: number | Decimal): string =>
  Number(value)
    .toLocaleString('ru-RU')
    .replace(/\u00A0/g, ' ');
