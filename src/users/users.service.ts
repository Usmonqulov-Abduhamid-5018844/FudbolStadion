import { Injectable, Logger } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { MyContext } from 'src/helpers/bot.sesion';
import { INITIAL_PENDING_BOOKING, IStadion } from 'src/helpers/interface';
import {
  getDistance,
  getLocation,
  stadionTypeLabel,
} from 'src/helpers/lokationSeorch';
import { getPaymentText } from 'src/helpers/peyments_type';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { toZonedTime, format } from 'date-fns-tz';
import { Decimal } from '@prisma/client/runtime/library';
import { statusMap } from 'src/helpers/bookingStatus';
import {
  Admin_S,
  AdminStatus,
  Pay_method,
  Prisma,
  PaymentProvider,
  TransactionStatus,
  GatewayMethod,
} from '@prisma/client';
import { formatDate } from 'src/helpers/dateFormat';
import { canPayByCard, getStadionIds } from 'src/helpers/stadions';
import { ErrorContext, scheduleType } from 'src/helpers/interface/enum';
import { PaylovService } from 'src/paylov/paylov.service';

const TASHKENT_TZ = 'Asia/Tashkent';
const NEARBY_RADIUS_METERS = 3000;
const NEARBY_LIMIT = 5;
const NEARBY_CANDIDATES_LIMIT = 500;
const CHEAP_PRICE_MAX = 500_000;
const CASH_BOOKING_TTL_MS = 30 * 60 * 1000;
const CARD_BOOKING_TTL_MS = 15 * 60 * 1000;
const SLOTS_PER_ROW = 2;

type TimeSlot = { start: string; end: string };
type StadionForSlots = Parameters<typeof getStadionIds>[0];
type PendingBooking = MyContext['session']['pendingBooking'];

/** Tanlangan vaqt boshqa user tomonidan band qilinganini bildiradi */
class SlotTakenError extends Error {
  constructor() {
    super('Slot band qilingan');
    this.name = 'SlotTakenError';
  }
}

const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatPrice = (price?: number | string | Decimal | null): string =>
  price ? new Intl.NumberFormat('uz-UZ').format(Number(price)) : '❌';

const toMinutes = (time: string): number => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly utils: UtilisService,
    private readonly botService: BotService,
    private readonly paylov: PaylovService,
  ) {}

  // ───────────────────────── Umumiy yordamchilar ─────────────────────────

  private t(lang: string, key: string, args?: Record<string, unknown>): string {
    return this.i18n.translate(key, { lang, args });
  }

  private backButton(lang: string, callback_data: string): InlineKeyboardButton[] {
    return [{ text: this.t(lang, 'schedule.back'), callback_data }];
  }

  private paginationRow(
    lang: string,
    page: number,
    totalPages: number,
    callback: (page: number) => string,
  ): InlineKeyboardButton[] {
    const row: InlineKeyboardButton[] = [];
    if (page > 1) {
      row.push({
        text: this.t(lang, 'stadions.Previous'),
        callback_data: callback(page - 1),
      });
    }
    row.push({ text: `${page} / ${totalPages}`, callback_data: 'ignore' });
    if (page < totalPages) {
      row.push({
        text: this.t(lang, 'stadions.Next'),
        callback_data: callback(page + 1),
      });
    }
    return row;
  }

  /** Callback query bo'lsa unga javob beradi, xato bersa e'tibor bermaydi */
  private async answerCb(
    ctx: MyContext,
    text?: string,
    showAlert = false,
  ): Promise<void> {
    if (!ctx.callbackQuery) return;
    await ctx
      .answerCbQuery(text, showAlert ? { show_alert: true } : undefined)
      .catch(() => undefined);
  }

  private async findCurrentUser(ctx: MyContext) {
    if (!ctx.from) return null;
    return this.prisma.users.findUnique({
      where: { chatID: String(ctx.from.id) },
    });
  }

  /** User ko'rishi mumkin bo'lgan stadionlar sharti */
  private visibleStadionWhere(): Prisma.StadionWhereInput {
    return {
      working_status: true,
      admin_status: AdminStatus.APPROVED,
      owner: { status: Admin_S.ACTIVE },
      OR: [
        { stadionChedules: { some: {} } },
        { parent: { stadionChedules: { some: {} } } },
      ],
    };
  }

  private countNoShows(userId: number, stadionId: number): Promise<number> {
    return this.prisma.booking.count({
      where: {
        user_id: userId,
        stadion_id: stadionId,
        status: { in: ['NOSHOW', 'REFUNDED'] },
      },
    });
  }

  private isSlotConflict(error: unknown): boolean {
    if (error instanceof SlotTakenError) return true;
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  /** Vaqt oralig'i bo'shligini tekshiradi, band bo'lsa SlotTakenError tashlaydi */
  private async assertSlotFree(
    db: Prisma.TransactionClient,
    stadionIds: number[],
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    const clash = await db.booking.findFirst({
      where: {
        stadion_id: { in: stadionIds },
        status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (clash) throw new SlotTakenError();
  }

  /**
   * Bo'shlikni tekshirish va yaratishni bitta Serializable tranzaksiyada bajaradi.
   * Ikki user bir vaqtda bosganda bittasi SlotTakenError yoki P2034 oladi.
   */
  private runGuarded<T>(
    stadion: StadionForSlots,
    startAt: Date,
    endAt: Date,
    create: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertSlotFree(tx, getStadionIds(stadion), startAt, endAt);
        return create(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async notifyNoFreeSlots(
    ctx: MyContext,
    lang: string,
    backCallback: string,
  ): Promise<void> {
    const text = this.t(lang, 'booking.no_free_slots');
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery(text, { show_alert: true });
        return;
      } catch {
        // alert ko'rsatib bo'lmadi, oddiy xabar yuboramiz
      }
    }
    await ctx.reply(text, {
      reply_markup: { inline_keyboard: [this.backButton(lang, backCallback)] },
    });
  }

  private async handleBookingFailure(
    ctx: MyContext,
    lang: string,
    error: unknown,
    backCallback: string,
    context: ErrorContext = ErrorContext.BOOKING,
  ): Promise<void> {
    if (this.isSlotConflict(error)) {
      await this.notifyNoFreeSlots(ctx, lang, backCallback);
      return;
    }
    await this.utils.errorFunction(ctx, error, context);
  }

  // ───────────────────────── Ro'yxatdan o'tish ─────────────────────────

  async registor(ctx: MyContext, lang: string) {
    try {
      ctx.session = ctx.session || {};
      ctx.session.step = 'user_registor';
      ctx.session.user_registor = ctx.session.user_registor || {
        id: null,
        full_name: null,
        phone: null,
        step: null,
      };
      ctx.session.user_registor.step = 'full_name';
      await ctx.reply(this.t(lang, 'registor.name'));
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  async registor_step(ctx: MyContext, lang: string) {
    try {
      const registration = ctx.session.user_registor;
      if (!registration) {
        await this.utils.errorFunction(
          ctx,
          new Error("user_registor session yo'q"),
          ErrorContext.USER,
        );
        return;
      }

      if (ctx.message && 'text' in ctx.message) {
        if (registration.step !== 'full_name') return;

        registration.full_name = ctx.message.text.trim();
        registration.step = 'phone';
        await ctx.reply(this.t(lang, 'registor.phone'), {
          reply_markup: {
            keyboard: [
              [
                {
                  text: this.t(lang, 'registor.send_phone'),
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }

      if (ctx.message && 'contact' in ctx.message) {
        if (registration.step !== 'phone' || !ctx.from) return;

        const contact = ctx.message.contact;
        // Boshqa odamning kontaktini yuborish mumkin emas
        if (contact.user_id && contact.user_id !== ctx.from.id) {
          await ctx.reply(this.t(lang, 'error.phone_invalid'));
          return;
        }

        const data = {
          username: ctx.from.username ?? '',
          full_name: String(registration.full_name),
          phone: String(contact.phone_number),
          chatID: String(ctx.from.id),
        };
        const user = await this.prisma.users.upsert({
          where: { chatID: data.chatID },
          update: {
            full_name: data.full_name,
            phone: data.phone,
            username: data.username,
          },
          create: data,
        });

        // Session faqat DB muvaffaqiyatli yozilgandan keyin o'zgaradi
        registration.id = user.id;
        registration.phone = data.phone;
        registration.step = null;
        ctx.session.step = 'finish';

        if (ctx.session.advertisement_step === 'advertisement_register') {
          await this.continueAdvertisementBooking(ctx, lang, user.chatID);
          return;
        }

        await ctx.reply(
          this.t(lang, 'registor.finish'),
          Markup.keyboard([
            [this.t(lang, 'menyu_buttons.user_stadion_booking')],
            [
              this.t(lang, 'menyu_buttons.settings'),
              this.t(lang, 'menyu_buttons.help'),
            ],
          ])
            .resize()
            .oneTime(),
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  private async continueAdvertisementBooking(
    ctx: MyContext,
    lang: string,
    chatID: string,
  ): Promise<void> {
    const sesionData = await this.prisma.sesion.findUnique({
      where: { chat_id: chatID },
    });
    const advertisementId = Number(sesionData?.advertisementId);

    if (!sesionData?.advertisementId || Number.isNaN(advertisementId)) {
      ctx.session.advertisement_step = null;
      await this.utils.errorFunction(
        ctx,
        new Error("Session da advertisementId yo'q"),
        ErrorContext.USER,
      );
      return;
    }

    const advertisement = await this.prisma.advertisement.findUnique({
      where: { id: advertisementId },
      include: { stadion: { include: { region: true, region_items: true } } },
    });
    ctx.session.advertisement_step = null;

    if (!advertisement) {
      await this.utils.errorFunction(
        ctx,
        new Error(`Advertisement topilmadi: id=${advertisementId}`),
        ErrorContext.USER,
      );
      return;
    }
    await this.botService.advertisementBooking(ctx, lang, advertisement.stadion);
  }

  async userMenyu(ctx: MyContext, lang: string) {
    try {
      await ctx.reply(
        this.t(lang, 'menyu_buttons.menu'),
        Markup.keyboard([
          [this.t(lang, 'menyu_buttons.user_stadion_booking')],
          [
            this.t(lang, 'menyu_buttons.settings'),
            this.t(lang, 'menyu_buttons.help'),
          ],
        ])
          .resize()
          .oneTime(),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  // ───────────────────────── Sozlamalar ─────────────────────────

  async settings(ctx: MyContext, lang: string) {
    try {
      const user = await this.findCurrentUser(ctx);
      if (!user) {
        await this.utils.errorFunction(
          ctx,
          new Error(`User topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.USER,
        );
        return;
      }

      await ctx.reply(this.t(lang, 'settings.title'), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.t(lang, 'settings.language'),
                callback_data: 'user_language',
              },
            ],
            [
              {
                text: this.t(lang, 'settings.phone'),
                callback_data: 'user_phone',
              },
            ],
            this.backButton(lang, 'back_user_1'),
          ],
        },
      });
      ctx.session.step = null;
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  private phoneKeyboard(lang: string): InlineKeyboardButton[][] {
    return [
      [{ text: this.t(lang, 'success.edit'), callback_data: 'user_editPhone' }],
      this.backButton(lang, 'back_user_2'),
    ];
  }

  async userUpdate_phone(ctx: MyContext, lang: string, text: string) {
    try {
      const phone = text.trim().replace(/[\s()-]/g, '');
      const phoneRegex = /^(?:\+998|998)?[0-9]{9}$/;

      if (!phone || !phoneRegex.test(phone)) {
        await ctx.reply(this.t(lang, 'error.phone_invalid'));
        return;
      }

      const digits = phone.replace(/^\+/, '');
      const normalizedPhone = digits.length === 9 ? `+998${digits}` : `+${digits}`;

      const user = await this.prisma.users.update({
        where: { chatID: String(ctx.from?.id) },
        data: { phone: normalizedPhone },
      });
      if (ctx.session.user_registor) ctx.session.user_registor.phone = null;

      await ctx.reply(this.t(lang, 'success.phone_updated'));
      await ctx.reply(`${this.t(lang, 'success.your_phone')} ${user.phone}`, {
        reply_markup: { inline_keyboard: this.phoneKeyboard(lang) },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  // ───────────────────────── Ortga tugmalari ─────────────────────────

  async userBackSwitch(ctx: MyContext, data: string, lang: string) {
    try {
      if (data.startsWith('payment-')) {
        const page = Number(data.split('-').pop()) || 1;
        if (ctx.session.bookingBrones) {
          await ctx
            .deleteMessages(ctx.session.bookingBrones)
            .catch(() => undefined);
          ctx.session.bookingBrones = [];
        }
        return this.userSwitch(ctx, 'stadionBron', lang, page);
      }

      switch (data) {
        case '1':
          return this.userMenyu(ctx, lang);
        case '2':
          return this.settings(ctx, lang);
        case '3':
          return this.userBooking(ctx, lang);
        case '4':
          return this.userBookingFanc(ctx, lang);
        case '5': {
          if (ctx.session.bookingBrones?.length) {
            await ctx
              .deleteMessages(ctx.session.bookingBrones)
              .catch(() => undefined);
            ctx.session.bookingBrones = [];
            return;
          }
          return this.userBooking(ctx, lang);
        }
        case '6': {
          if (ctx.session.stadionMessages?.length) {
            await ctx
              .deleteMessages(ctx.session.stadionMessages)
              .catch(() => undefined);
            ctx.session.stadionMessages = [];
          }
          await this.answerCb(ctx);
          return this.userSwitch(ctx, 'stadionSearch', lang);
        }
        case 'help':
          return this.utils.safeEditHelpMenuReply_User(
            ctx,
            this.t(lang, 'user_help.menu.title'),
          );
        case 'Booking': {
          const pending = ctx.session.pendingBooking;
          if (
            !pending ||
            !pending.date ||
            !pending.start_time ||
            !pending.end_time ||
            !pending.stadion_id ||
            !pending.type
          ) {
            // Odatda session eskirgan (bot qayta ishga tushgan yoki eski tugma)
            await this.utils.errorFunction(
              ctx,
              new Error('back=Booking: pendingBooking yetarli emas'),
              ErrorContext.USER,
            );
            return;
          }
          return this.bookingScheduleFinish(
            ctx,
            pending.start_time,
            pending.end_time,
            pending.date,
            lang,
            pending.stadion_id,
            pending.type,
          );
        }
        case 'Payments': {
          const pending = ctx.session.pendingBooking;
          if (
            !pending ||
            !pending.date ||
            !pending.stadion_id ||
            !pending.start_time ||
            !pending.end_time ||
            !pending.startAt ||
            !pending.endAt ||
            !pending.user_id ||
            !pending.payment_method ||
            !pending.type ||
            pending.total_price == null ||
            pending.pricePerHur == null ||
            pending.noshowCount == null
          ) {
            await this.utils.errorFunction(
              ctx,
              new Error('back=Payments: pendingBooking yetarli emas'),
              ErrorContext.USER,
            );
            return;
          }
          return this.bookingPayments(
            ctx,
            'card',
            pending.date,
            pending.start_time,
            pending.end_time,
            pending.stadion_id,
            pending.pricePerHur,
            pending.noshowCount,
            pending.type as scheduleType,
            lang,
          );
        }
        default:
          this.logger.debug(`userBackSwitch: noma'lum data: ${data}`);
          await this.answerCb(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  // ───────────────────────── Asosiy user menyusi (callback "user_*") ─────────────────────────

  async userSwitch(
    ctx: MyContext,
    data: string,
    lang: string,
    page: number = 1,
  ) {
    try {
      ctx.session.user_registor = ctx.session.user_registor || {
        id: null,
        full_name: null,
        phone: null,
        step: null,
      };
      const currentPage = Math.max(1, Number(page) || 1);

      switch (data) {
        case 'language': {
          await this.answerCb(ctx);
          await ctx.reply(
            this.t(lang, 'common.START'),
            Markup.inlineKeyboard([
              [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
              [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
              [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
              [Markup.button.callback(this.t(lang, 'schedule.back'), 'back_user_2')],
            ]),
          );
          ctx.session.step = 'user_langs';
          return;
        }
        case 'phone': {
          await this.answerCb(ctx);
          const user = await this.findCurrentUser(ctx);
          if (!user) {
            await ctx.reply(this.t(lang, 'stadions.not_fount'));
            return;
          }
          await ctx.reply(`${this.t(lang, 'success.your_phone')} ${user.phone}`, {
            reply_markup: { inline_keyboard: this.phoneKeyboard(lang) },
          });
          return;
        }
        case 'editPhone': {
          await this.answerCb(ctx);
          ctx.session.user_registor.phone = 'phone';
          await ctx.reply(this.t(lang, 'registor.phone'));
          return;
        }
        case 'stadionNewBron':
          return this.userBookingFanc(ctx, lang);
        case 'stadionBron':
          return this.showActiveBookings(ctx, lang, currentPage);
        case 'stadionBronHistory':
          return this.showBookingHistory(ctx, lang, currentPage);
        case 'stadionFavorite':
          return this.showFavorites(ctx, lang, currentPage);
        case 'stadionSearch': {
          await this.answerCb(ctx);
          await this.utils.safeEditOrReply(
            ctx,
            this.t(lang, 'booking.stadion.search'),
            {
              inline_keyboard: [
                [
                  {
                    text: this.t(lang, 'booking.stadions.nearby'),
                    callback_data: 'user_location',
                  },
                ],
                [
                  {
                    text: this.t(lang, 'booking.stadions.by_time'),
                    callback_data: 'user_working',
                  },
                ],
                [
                  {
                    text: this.t(lang, 'booking.stadions.by_name'),
                    callback_data: 'user_nameSearch',
                  },
                ],
                [
                  {
                    text: this.t(lang, 'booking.stadions.cheap'),
                    callback_data: 'user_cheapPrice',
                  },
                ],
                this.backButton(lang, 'back_user_3'),
              ],
            },
          );
          return;
        }
        case 'location': {
          await this.answerCb(ctx);
          await ctx.reply(this.t(lang, 'stadions.location_else'), {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: this.t(lang, 'stadions.send_location'),
                    request_location: true,
                  },
                ],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
          ctx.session.booking_step = 'user_location_send';
          return;
        }
        case 'working':
          return this.showWorkingDates(ctx, lang);
        case 'nameSearch': {
          await this.answerCb(ctx);
          await ctx.deleteMessage().catch(() => undefined);
          await ctx.reply(this.t(lang, 'booking.stadions.enter_name'));
          if (ctx.session.stadion) ctx.session.stadion.name = 'SeorchName';
          return;
        }
        case 'cheapPrice':
          return this.showCheapStadions(ctx, lang, currentPage);
        default:
          // Masalan "user_offday": hech narsa qilmaydi, faqat tugma yuklanishini to'xtatamiz
          this.logger.debug(`userSwitch: ishlov berilmagan data: ${data}`);
          await this.answerCb(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  private remainingTimeText(startAt: Date, endAt: Date, lang: string): string {
    const { timeLeftText, totalMinutes } = this.utils.bookingTimeCalculate(
      startAt,
      lang,
    );
    const { totalMinutes: endMinutes } = this.utils.bookingTimeCalculate(
      endAt,
      lang,
    );

    if (totalMinutes <= 0 && endMinutes > 0) {
      return this.t(lang, 'booking.game_started');
    }
    if (totalMinutes <= 0) return this.t(lang, 'bookingHistory.time_expired');
    return timeLeftText;
  }

  private async showActiveBookings(ctx: MyContext, lang: string, page: number) {
    const limit = 2;
    const user = await this.findCurrentUser(ctx);
    if (!user) {
      await this.utils.errorFunction(
        ctx,
        new Error(`User topilmadi: chatID=${ctx.from?.id}`),
        ErrorContext.USER,
      );
      return;
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          user_id: user.id,
          status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          stadion: {
            select: {
              id: true,
              name: true,
              latitude: true,
              longitude: true,
              payments_type: true,
              region: { select: { name: true } },
              region_items: { select: { name: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({
        where: {
          user_id: user.id,
          status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
        },
      }),
    ]);

    if (!total) {
      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'stadions.no_active_bookings'),
        { inline_keyboard: [this.backButton(lang, 'back_user_3')] },
      );
      return;
    }

    await this.answerCb(ctx, this.t(lang, 'loading.loading'));
    ctx.session.bookingBrones ??= [];

    for (const item of bookings) {
      const locationText = getLocation(
        item.stadion.latitude,
        item.stadion.longitude,
        item.stadion.region.name,
        item.stadion.region_items.name,
      );

      const lines = [
        `${this.t(lang, 'bookingHistory.booking.id')}: ${item.id}`,
        `${this.t(lang, 'bookingHistory.booking.stadion')}: ${escapeHtml(item.stadion.name)}`,
        `${this.t(lang, 'bookingHistory.booking.date')}: ${format(item.date, 'dd.MM.yyyy')}`,
        `${this.t(lang, 'bookingHistory.booking.time')}: ${item.start_time} - ${item.end_time}`,
        `${this.t(lang, 'bookingHistory.booking.remaining_time')}: ${this.remainingTimeText(item.startAt, item.endAt, lang)}`,
        `${this.t(lang, 'bookingHistory.booking.price')}: ${formatPrice(item.total_price)} ${this.t(lang, 'bookingHistory.booking.price_title')}`,
        `${this.t(lang, 'bookingHistory.booking.payment_type')}: ${getPaymentText(item.payment_method, this.t(lang, 'peyments'))}`,
        `${this.t(lang, 'bookingHistory.booking.status')}: ${statusMap(item.status, this.i18n, lang)}`,
      ];
      if (item.check_in) {
        lines.push(this.t(lang, 'bookingHistory.booking.check_in'));
      }
      lines.push(
        `${this.t(lang, 'bookingHistory.booking.location')}: ${locationText}`,
      );

      const send = await ctx.reply(lines.join('\n\n'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: this.utils.booking_status_handler(
            item.status,
            item.id,
            item.payment_method,
            item.stadion.payments_type,
            item.startAt,
            item.endAt,
            page,
            limit,
            total,
            item.check_in,
            lang,
          ),
        },
      });
      ctx.session.bookingBrones.push(send.message_id);
    }

    const totalPages = Math.ceil(total / limit);
    if (totalPages > 1) {
      const send = await ctx.reply(this.t(lang, 'stadions.Select'), {
        reply_markup: {
          inline_keyboard: [
            this.paginationRow(
              lang,
              page,
              totalPages,
              (p) => `booking_region_page_stadionBron_${p}`,
            ),
            this.backButton(lang, 'back_user_5'),
          ],
        },
      });
      ctx.session.bookingBrones.push(send.message_id);
    }
  }

  private async showBookingHistory(ctx: MyContext, lang: string, page: number) {
    const limit = 4;
    const user = await this.findCurrentUser(ctx);
    if (!user) {
      await this.utils.errorFunction(
        ctx,
        new Error(`User topilmadi: chatID=${ctx.from?.id}`),
        ErrorContext.USER,
      );
      return;
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          user_id: user.id,
          status: {
            in: ['COMPLETED', 'NOSHOW', 'CANCELED', 'REFUNDED', 'REFUND_PENDING'],
          },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          stadion: {
            select: {
              id: true,
              name: true,
              longitude: true,
              latitude: true,
              region: { select: { name: true } },
              region_items: { select: { name: true } },
            },
          },
          tranzaktions: {
            where: { status: TransactionStatus.SUCCESS },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { refunded_sum: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({
        where: {
          user_id: user.id,
          status: {
            in: ['COMPLETED', 'NOSHOW', 'CANCELED', 'REFUNDED', 'REFUND_PENDING'],
          },
        },
      }),
    ]);

    if (!total) {
      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'stadions.booking_history_empty'),
        { inline_keyboard: [this.backButton(lang, 'back_user_3')] },
      );
      return;
    }

    await this.answerCb(ctx, this.t(lang, 'loading.loading'));

    const currency = this.t(lang, 'bookingHistory.booking.price_title');
    const blocks = bookings.map((item) => {
      const lines = [
        `${this.t(lang, 'bookingHistory.booking.id')}: ${item.id}`,
        `${this.t(lang, 'bookingHistory.booking.stadion')}: ${escapeHtml(item.stadion.name)}`,
        `${this.t(lang, 'bookingHistory.booking.date')}: ${format(item.date, 'dd.MM.yyyy')}`,
        `${this.t(lang, 'bookingHistory.booking.time')}: ${item.start_time} - ${item.end_time}`,
        `${this.t(lang, 'bookingHistory.booking.price')}: ${formatPrice(item.total_price)} ${currency}`,
        `${this.t(lang, 'bookingHistory.booking.payment_type')}: ${getPaymentText(item.payment_method, this.t(lang, 'peyments'))}`,
        `${this.t(lang, 'bookingHistory.booking.status')}: ${statusMap(item.status, this.i18n, lang)}`,
      ];

      const tx = item.tranzaktions[0];
      if (item.status === 'REFUNDED' && tx?.refunded_sum != null) {
        lines.push(
          `${this.t(lang, 'bookingHistory.booking.refunded')}: ${formatPrice(tx.refunded_sum)} ${currency}`,
        );
      }
      if (item.status === 'REFUND_PENDING' && tx) {
        lines.push(this.t(lang, 'bookingHistory.booking.refund_in_progress'));
      }

      lines.push(
        `${this.t(lang, 'bookingHistory.booking.location')}: ${getLocation(
          item.stadion.latitude,
          item.stadion.longitude,
          item.stadion.region.name,
          item.stadion.region_items.name,
        )}`,
      );
      return lines.join('\n\n');
    });

    const message = `${this.t(lang, 'bookingHistory.booking.history_title')}\n\n${blocks.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n')}`;

    const totalPages = Math.ceil(total / limit);
    const keyboard: InlineKeyboardButton[][] = [];
    if (totalPages > 1) {
      keyboard.push(
        this.paginationRow(
          lang,
          page,
          totalPages,
          (p) => `booking_region_page_stadionBronHistory_${p}`,
        ),
      );
    }
    keyboard.push(this.backButton(lang, 'back_user_3'));

    await this.utils.safeEditOrReply(ctx, message, { inline_keyboard: keyboard });
  }

  private async showFavorites(ctx: MyContext, lang: string, page: number) {
    const limit = 4;
    const where = {
      chat_id: String(ctx.from?.id),
      stadion: {
        working_status: true,
        admin_status: AdminStatus.APPROVED,
        owner: { status: Admin_S.ACTIVE },
      },
    };

    // count ham findMany bilan bir xil shart bilan: aks holda sahifalash xato chiqadi
    const [favorites, total] = await Promise.all([
      this.prisma.myFavoriteStadium.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { stadion: { include: { region: true, region_items: true } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.myFavoriteStadium.count({ where }),
    ]);

    if (!favorites.length) {
      await this.answerCb(ctx, this.t(lang, 'booking.stadion.noFavorites'), true);
      return;
    }

    await this.answerCb(ctx, this.t(lang, 'loading.loading'));
    for (const favorite of favorites) {
      await this.stadionFavorite(ctx, lang, favorite.stadion);
    }

    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return;

    await this.utils.safeEditOrReply(ctx, this.t(lang, 'stadions.Select'), {
      inline_keyboard: [
        this.paginationRow(
          lang,
          page,
          totalPages,
          (p) => `booking_region_page_favorit_${p}`,
        ),
      ],
    });
  }

  private dateLabel(
    date: Date,
    weekDay: number,
    todayStr: string,
    tomorrowStr: string,
    lang: string,
  ): string {
    const dateStr = format(date, 'yyyy-MM-dd');
    const weekDayText = this.t(lang, `schedule.week_days.${weekDay}`);
    if (dateStr === todayStr) return `${this.t(lang, 'schedule.today')}. ${weekDayText}`;
    if (dateStr === tomorrowStr) return `${this.t(lang, 'schedule.tomorrow')}. ${weekDayText}`;
    const monthText = this.t(lang, `schedule.months.${date.getMonth() + 1}`);
    return `${format(date, 'd')} - ${monthText}. ${weekDayText}`;
  }

  private async showWorkingDates(ctx: MyContext, lang: string) {
    await this.answerCb(ctx);

    const now = toZonedTime(new Date(), TASHKENT_TZ);
    const todayStr = format(now, 'yyyy-MM-dd');
    const tomorrowStr = format(new Date(now.getTime() + 86400000), 'yyyy-MM-dd');

    const buttons: InlineKeyboardButton[][] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const weekDay = date.getDay() === 0 ? 7 : date.getDay();

      buttons.push([
        {
          text: this.dateLabel(date, weekDay, todayStr, tomorrowStr, lang),
          callback_data: `working_date_${format(date, 'yyyy-MM-dd')}`,
        },
      ]);
    }
    buttons.push(this.backButton(lang, 'back_user_6'));

    await this.utils.safeEditOrReply(
      ctx,
      this.t(lang, 'booking.working_time'),
      { inline_keyboard: buttons },
    );
  }

  private async showCheapStadions(ctx: MyContext, lang: string, page: number) {
    const limit = 4;
    await this.answerCb(ctx);
    await ctx.deleteMessage().catch(() => undefined);

    const where: Prisma.StadionWhereInput = {
      ...this.visibleStadionWhere(),
      price: { lte: CHEAP_PRICE_MAX },
    };

    const [stadions, total] = await Promise.all([
      this.prisma.stadion.findMany({
        where,
        include: { region: true, region_items: true },
        orderBy: { price: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stadion.count({ where }),
    ]);

    if (!stadions.length) {
      await ctx.reply(this.t(lang, 'stadions.stadions_not_found'), {
        reply_markup: { inline_keyboard: [this.backButton(lang, 'back_user_6')] },
      });
      return;
    }

    for (const stadion of stadions) {
      await this.stadionAll_data(ctx, lang, stadion, '', true);
    }

    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return;

    const send = await ctx.reply(this.t(lang, 'stadions.Select'), {
      reply_markup: {
        inline_keyboard: [
          this.paginationRow(
            lang,
            page,
            totalPages,
            (p) => `booking_region_page_cheapPrice_${p}`,
          ),
        ],
      },
    });
    ctx.session.stadionMessages ??= [];
    ctx.session.stadionMessages.push(send.message_id);
  }

  // ───────────────────────── Stadion tanlash ─────────────────────────

  async userBooking(ctx: MyContext, lang: string) {
    try {
      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.menuTitle'),
        {
          inline_keyboard: [
            [
              {
                text: this.t(lang, 'booking.stadion.newBooking'),
                callback_data: 'user_stadionNewBron',
              },
            ],
            [
              {
                text: this.t(lang, 'booking.stadion.activeBookings'),
                callback_data: 'user_stadionBron',
              },
            ],
            [
              {
                text: this.t(lang, 'booking.stadion.history'),
                callback_data: 'user_stadionBronHistory',
              },
            ],
            [
              {
                text: this.t(lang, 'booking.stadion.favorites'),
                callback_data: 'user_stadionFavorite',
              },
            ],
            [
              {
                text: this.t(lang, 'booking.stadion.search'),
                callback_data: 'user_stadionSearch',
              },
            ],
            this.backButton(lang, 'back_user_1'),
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  async userBookingFanc(ctx: MyContext, lang: string) {
    try {
      const stadions = await this.prisma.stadion.findMany({
        where: this.visibleStadionWhere(),
        select: { region_id: true },
      });

      if (!stadions.length) {
        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, 'booking.stadion.notAvailable'),
          { inline_keyboard: [this.backButton(lang, 'back_user_3')] },
        );
        return;
      }

      const regionIds = [...new Set(stadions.map((s) => s.region_id))];
      const regions = await this.prisma.region.findMany({
        where: { id: { in: regionIds } },
      });

      const buttons: InlineKeyboardButton[][] = regions.map((r) => [
        { text: r.name, callback_data: `booking_region_${r.id}` },
      ]);
      buttons.push(this.backButton(lang, 'back_user_3'));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.availableRegions'),
        { inline_keyboard: buttons },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async userbookingRegion(ctx: MyContext, lang: string, id: number) {
    try {
      const regionItems = await this.prisma.region_item.findMany({
        where: { region_id: id },
        include: {
          stadions: { where: this.visibleStadionWhere(), select: { id: true } },
        },
      });

      const available = regionItems.filter((i) => i.stadions.length > 0);
      if (!available.length) {
        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, 'booking.stadion.notAvailable'),
          { inline_keyboard: [this.backButton(lang, 'back_user_4')] },
        );
        return;
      }

      const buttons: InlineKeyboardButton[][] = available.map((r) => [
        { text: r.name, callback_data: `booking_regionItem_${r.id}` },
      ]);
      buttons.push(this.backButton(lang, 'back_user_4'));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectRegion'),
        { inline_keyboard: buttons },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async userbookingRegionItems(
    ctx: MyContext,
    lang: string,
    itemId: number,
    page: number = 1,
  ) {
    try {
      const limit = 10;
      const currentPage = Math.max(1, Number(page) || 1);

      if (ctx.session.stadionMessages?.length) {
        await ctx
          .deleteMessages(ctx.session.stadionMessages)
          .catch(() => undefined);
        ctx.session.stadionMessages = [];
      }

      const allStadions = await this.prisma.stadion.findMany({
        where: { ...this.visibleStadionWhere(), region_item_id: itemId },
        orderBy: { id: 'asc' },
        include: {
          owner: {
            select: {
              subscriptions: {
                where: { isActive: true },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });

      if (!allStadions.length) {
        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, 'booking.stadion.notAvailable'),
          { inline_keyboard: [this.backButton(lang, 'back_user_4')] },
        );
        return;
      }

      // Premium owner stadionlari birinchi chiqadi
      const sorted = allStadions.sort((a, b) => {
        const aPremium = a.owner.subscriptions.length > 0 ? 1 : 0;
        const bPremium = b.owner.subscriptions.length > 0 ? 1 : 0;
        return aPremium !== bPremium ? bPremium - aPremium : a.id - b.id;
      });

      const total = sorted.length;
      const totalPages = Math.ceil(total / limit);

      // Eski tugmadan keyin sahifa mavjud bo'lmasa, birinchi sahifaga qaytamiz
      if (currentPage > totalPages) {
        return this.userbookingRegionItems(ctx, lang, itemId, 1);
      }

      const stadions = sorted.slice(
        (currentPage - 1) * limit,
        currentPage * limit,
      );

      const keyboard: InlineKeyboardButton[][] = stadions.map((stadion) => [
        {
          text: `🏟 ${stadion.name}`,
          callback_data: `bookingStadium_${stadion.id}_${itemId}_${currentPage}`,
        },
      ]);

      if (totalPages > 1) {
        keyboard.push(
          this.paginationRow(
            lang,
            currentPage,
            totalPages,
            (p) => `booking_region_page_${itemId}_${p}`,
          ),
        );
      }
      keyboard.push(
        this.backButton(
          lang,
          JSON.stringify({
            type: 'user_back_regionItems',
            id: stadions[0].region_id,
          }),
        ),
      );

      await this.utils.safeEditOrReply(ctx, this.t(lang, 'stadions.select'), {
        inline_keyboard: keyboard,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  // ───────────────────────── Stadion kartalari ─────────────────────────

  private buildStadionCard(
    lang: string,
    stadion: IStadion,
    ownerPhone: string | null | undefined,
    options: { distanceKm?: string; bold: boolean },
  ): string {
    const bold = (value: string | number): string =>
      options.bold ? `<b>${value}</b>` : String(value);

    const statusText = stadion.working_status
      ? `🟢 ${this.t(lang, 'view.active')}`
      : `🔴 ${this.t(lang, 'view.inactive')}`;

    let locationText = this.t(lang, 'view.not_available');
    if (stadion.latitude && stadion.longitude) {
      locationText = getLocation(
        stadion.latitude,
        stadion.longitude,
        stadion.region.name,
        stadion.region_items.name,
      );
    }

    const lines = [
      `🏟 <b>${escapeHtml(stadion.name)}</b>`,
      '',
      `${this.t(lang, 'view.locate')} ${locationText}`,
    ];
    if (options.distanceKm) {
      lines.push(`${this.t(lang, 'view.distance')} ${options.distanceKm} km`);
    }
    lines.push(
      stadionTypeLabel(stadion.mini, stadion.stadion_mini, lang, this.i18n),
      `${this.t(lang, 'view.count')} ${bold(stadion.max_count || this.t(lang, 'view.not'))}`,
      `${this.t(lang, 'view.size')} ${bold(`${stadion.length || '❌'} x ${stadion.width || '❌'}`)}`,
      `${this.t(lang, 'view.price')} ${bold(formatPrice(stadion.price))}`,
      `${this.t(lang, 'view.peyments')} ${getPaymentText(stadion.payments_type, this.t(lang, 'peyments'))}`,
      `${this.t(lang, 'view.phone')} ${escapeHtml(ownerPhone ?? '—')}`,
      `${this.t(lang, 'view.status')} ${bold(statusText)}`,
      `${this.t(lang, 'view.creted')} ${bold(formatDate(stadion.createdAt, lang))}`,
      `${this.t(lang, 'view.update')} ${bold(formatDate(stadion.updatedAt, lang))}`,
    );
    return lines.join('\n');
  }

  /** Avval rasm bilan yuboradi, bo'lmasa (yoki rasm yo'q bo'lsa) oddiy matn bilan */
  private async sendCard(
    ctx: MyContext,
    image: string | null | undefined,
    text: string,
    photoKeyboard: InlineKeyboardButton[][],
    textKeyboard: InlineKeyboardButton[][],
  ): Promise<number> {
    if (image) {
      try {
        const sent = await ctx.replyWithPhoto(image, {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: photoKeyboard },
        });
        return sent.message_id;
      } catch (error) {
        this.logger.debug(
          `Rasm yuborilmadi, matn yuboriladi: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const sent = await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: textKeyboard },
    });
    return sent.message_id;
  }

  async stadionAll_data(
    ctx: MyContext,
    lang: string,
    stadion: IStadion,
    distanceKm?: string,
    isSeorch = false,
  ) {
    try {
      await this.answerCb(ctx);
      const owner = await this.prisma.owners.findUnique({
        where: { id: stadion.owner_id },
        select: { phone: true },
      });

      const text = this.buildStadionCard(lang, stadion, owner?.phone, {
        distanceKm,
        bold: true,
      });

      const searchBack = 'back_user_6';
      const textBack = isSeorch
        ? searchBack
        : JSON.stringify({ type: 'user_back_regionItems', id: stadion.region_id });
      const photoBack = isSeorch
        ? searchBack
        : JSON.stringify({
            type: 'user_back_regionItems_Id',
            id: stadion.region_item_id,
          });

      const keyboard = (back: string): InlineKeyboardButton[][] => [
        [
          {
            text: this.t(lang, 'booking.stadion.favorite'),
            callback_data: `booking_save_${stadion.id}`,
          },
        ],
        [
          {
            text: this.t(lang, 'booking.stadion.book'),
            callback_data: `booking_stadion_${stadion.id}`,
          },
          { text: this.t(lang, 'schedule.back'), callback_data: back },
        ],
      ];

      const messageId = await this.sendCard(
        ctx,
        stadion.image,
        text,
        keyboard(photoBack),
        keyboard(textBack),
      );
      ctx.session.stadionMessages ??= [];
      ctx.session.stadionMessages.push(messageId);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async stadionFavorite(ctx: MyContext, lang: string, stadion: IStadion) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { id: stadion.owner_id },
        select: { phone: true },
      });

      const text = this.buildStadionCard(lang, stadion, owner?.phone, {
        bold: false,
      });

      const keyboard: InlineKeyboardButton[][] = [
        [
          {
            text: this.t(lang, 'booking.stadion.delete_favorite'),
            callback_data: `delete_stadion_fovorite_${stadion.id}`,
          },
        ],
        [
          {
            text: this.t(lang, 'booking.stadion.book'),
            callback_data: `booking_stadion_${stadion.id}`,
          },
          { text: this.t(lang, 'schedule.back'), callback_data: 'back_user_3' },
        ],
      ];

      const messageId = await this.sendCard(
        ctx,
        stadion.image,
        text,
        keyboard,
        keyboard,
      );
      ctx.session.stadionFavoritMessages ??= [];
      ctx.session.stadionFavoritMessages.push(messageId);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async userSaveFnc(ctx: MyContext, lang: string, stadionId: number) {
    try {
      const chat_id = String(ctx.from?.id);

      // Avval o'chirishga urinamiz: bor bo'lsa o'chiriladi, yo'q bo'lsa qo'shamiz
      const { count } = await this.prisma.myFavoriteStadium.deleteMany({
        where: { chat_id, stadion_id: stadionId },
      });
      if (count > 0) {
        await this.answerCb(
          ctx,
          this.t(lang, 'booking.stadion.removedFromFavorites'),
        );
        return;
      }

      try {
        await this.prisma.myFavoriteStadium.create({
          data: { stadion_id: stadionId, chat_id },
        });
      } catch (error) {
        // Tugma ikki marta tez bosilsa, ikkinchisi allaqachon qo'shilgan bo'ladi
        const isDuplicate =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isDuplicate) throw error;
      }
      await this.answerCb(ctx, this.t(lang, 'booking.stadion.addedToFavorites'));
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async handleLocation(
    ctx: MyContext,
    lang: string,
    latitude: number,
    longitude: number,
  ) {
    ctx.session.booking_step = null;
    try {
      // Reply klaviaturani olib tashlash uchun vaqtincha xabar
      const hint = await ctx.reply('location', {
        reply_markup: { remove_keyboard: true },
      });
      await ctx.deleteMessage(hint.message_id).catch(() => undefined);

      // Masofa bo'yicha filtrlashdan OLDIN take qo'llanmaydi: aks holda yaqin stadionlar tushib qoladi
      const stadiums = await this.prisma.stadion.findMany({
        where: this.visibleStadionWhere(),
        take: NEARBY_CANDIDATES_LIMIT,
        include: { region: true, region_items: true },
      });

      const nearby = stadiums
        .flatMap((s) => {
          if (!s.latitude || !s.longitude) return [];
          const distance = getDistance(latitude, longitude, s.latitude, s.longitude);
          return distance <= NEARBY_RADIUS_METERS ? [{ ...s, distance }] : [];
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, NEARBY_LIMIT);

      if (!nearby.length) {
        await ctx.reply(this.t(lang, 'stadions.stadions_not_found'), {
          reply_markup: { inline_keyboard: [this.backButton(lang, 'back_user_6')] },
        });
        return;
      }

      for (const stadium of nearby) {
        await this.stadionAll_data(
          ctx,
          lang,
          stadium,
          (stadium.distance / 1000).toFixed(2),
          true,
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  // ───────────────────────── Sana va vaqt tanlash ─────────────────────────

  async userbookingStadion(ctx: MyContext, lang: string, stadionId: number) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: { parent: true, owner: { select: { id: true } } },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion topilmadi: id=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      const targetStadionId = stadion.parent_id ?? stadion.id;
      const [schedule, offDays, specialDays] = await Promise.all([
        this.prisma.stadion_chedule.findMany({
          where: { stadion_id: targetStadionId },
        }),
        this.prisma.stadion_off_days.findMany({
          where: { stadion_id: targetStadionId },
        }),
        this.prisma.stadion_special_schedule.findMany({
          where: { stadion_id: targetStadionId },
        }),
      ]);

      if (!schedule.length) {
        await ctx.reply(this.t(lang, 'booking.stadion.noWorkingHours'));
        return;
      }

      const now = toZonedTime(new Date(), TASHKENT_TZ);
      const todayStr = format(now, 'yyyy-MM-dd');
      const tomorrowStr = format(new Date(now.getTime() + 86400000), 'yyyy-MM-dd');
      const currentDay = now.getDay() === 0 ? 7 : now.getDay();

      const offSet = new Set(
        offDays.map((d) =>
          format(toZonedTime(new Date(d.date), TASHKENT_TZ), 'yyyy-MM-dd'),
        ),
      );
      const specialMap = new Map(
        specialDays.map((d) => [
          format(toZonedTime(new Date(d.date), TASHKENT_TZ), 'yyyy-MM-dd'),
          d,
        ]),
      );

      // Eng yaqin sanalar birinchi bo'lib chiqishi uchun sanasi bo'yicha tartiblaymiz
      const entries = schedule
        .map((s) => {
          let diff = s.day_of_week - currentDay;
          if (diff < 0) diff += 7;
          const date = new Date(now);
          date.setDate(now.getDate() + diff);
          return { s, date, dateStr: format(date, 'yyyy-MM-dd') };
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      const buttons: InlineKeyboardButton[][] = entries.map(
        ({ s, date, dateStr }) => {
          const label = this.dateLabel(date, s.day_of_week, todayStr, tomorrowStr, lang);
          const special = specialMap.get(dateStr);

          if (special) {
            return [
              {
                text: `⭐ ${label} || ${special.start_time} - ${special.end_time}`,
                callback_data: `booking_specials_${special.id}_${stadion.id}`,
              },
            ];
          }
          if (offSet.has(dateStr)) {
            return [
              {
                text: `🔒 ${label} || ${s.start_time} - ${s.end_time}`,
                callback_data: 'user_offday',
              },
            ];
          }
          return [
            {
              text: `📅 ${label} || ${s.start_time} - ${s.end_time}`,
              callback_data: `booking_schedule_${date.getFullYear()}_${format(date, 'd')}_${date.getMonth() + 1}_${s.id}_${stadion.id}`,
            },
          ];
        },
      );

      buttons.push(
        this.backButton(
          lang,
          ctx.session.admin_step === 'NewBooking_owners'
            ? `Newbooking_firstName_${stadion.owner.id}_${lang}`
            : JSON.stringify({
                type: 'Continue_back_stadion',
                id: stadion.region_item_id,
              }),
        ),
      );

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectDate'),
        { inline_keyboard: buttons },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  /** Bugun bo'lsa va ish boshlangan bo'lsa, o'tib ketgan vaqtlarni ko'rsatmaslik uchun boshlanish vaqtini suradi */
  private resolveSlotStart(
    startOfDay: Date,
    scheduleStart: string,
    referenceStart: string,
  ): string {
    if (!this.utils.isSameLocalDay(startOfDay, new Date())) return scheduleStart;
    const currentTime = this.utils.currentLocalTimeRoundedUp();
    return this.utils.isCurrentTimeAfter(currentTime, scheduleStart, referenceStart)
      ? currentTime
      : scheduleStart;
  }

  private async getFreeSlots(
    stadionIds: number[],
    startOfDay: Date,
    fromTime: string,
    toTime: string,
    referenceStart: string,
  ): Promise<TimeSlot[]> {
    const allSlots: TimeSlot[] = await this.utils.generateSlots(fromTime, toTime);
    const windowStart = this.utils.combineDateAndTime(startOfDay, fromTime, referenceStart);
    const windowEnd = this.utils.combineDateAndTime(startOfDay, toTime, referenceStart);

    const bookings = await this.prisma.booking.findMany({
      where: {
        stadion_id: { in: stadionIds },
        status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
        startAt: { lt: windowEnd },
        endAt: { gt: windowStart },
      },
    });

    return allSlots.filter((slot) => {
      const slotStart = this.utils.combineDateAndTime(startOfDay, slot.start, referenceStart);
      const slotEnd = this.utils.combineDateAndTime(startOfDay, slot.end, referenceStart);
      return this.utils.isRangeFree(slotStart, slotEnd, bookings);
    });
  }

  private slotKeyboard(
    slots: TimeSlot[],
    field: 'start' | 'end',
    callback: (slot: TimeSlot) => string,
  ): InlineKeyboardButton[][] {
    const rows: InlineKeyboardButton[][] = [];
    for (let i = 0; i < slots.length; i += SLOTS_PER_ROW) {
      rows.push(
        slots.slice(i, i + SLOTS_PER_ROW).map((slot) => ({
          text: slot[field],
          callback_data: callback(slot),
        })),
      );
    }
    return rows;
  }

  async special(
    ctx: MyContext,
    lang: string,
    specialId: number,
    stadionId: number,
  ) {
    try {
      if (ctx.session.stadion.schedule_id) ctx.session.stadion.schedule_id = null;

      const [special, stadion] = await Promise.all([
        this.prisma.stadion_special_schedule.findUnique({ where: { id: specialId } }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!special || !stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Special yoki stadion topilmadi: special=${specialId} stadion=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      const referenceStart = special.start_time;
      const startOfDay = this.utils.buildCalendarDate(
        special.date.getUTCFullYear(),
        special.date.getUTCMonth() + 1,
        special.date.getUTCDate(),
      );
      const fromTime = this.resolveSlotStart(startOfDay, special.start_time, referenceStart);
      const freeSlots = await this.getFreeSlots(
        getStadionIds(stadion),
        startOfDay,
        fromTime,
        special.end_time,
        referenceStart,
      );

      const backCallback = `booking_back_${stadionId}`;
      if (!freeSlots.length) {
        await this.notifyNoFreeSlots(ctx, lang, backCallback);
        return;
      }

      const keyboard = this.slotKeyboard(
        freeSlots,
        'start',
        (slot) => `booking_special_${slot.start}_${special.id}_${stadionId}`,
      );
      keyboard.push(this.backButton(lang, backCallback));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectTime'),
        { inline_keyboard: keyboard },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async userbookingSpecialEnd(
    ctx: MyContext,
    lang: string,
    specialId: number,
    stadionId: number,
    start_time: string,
  ) {
    try {
      const [special, stadion] = await Promise.all([
        this.prisma.stadion_special_schedule.findUnique({ where: { id: specialId } }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!special || !stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Special yoki stadion topilmadi: special=${specialId} stadion=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      const referenceStart = special.start_time;
      const year = special.date.getUTCFullYear();
      const month = special.date.getUTCMonth() + 1;
      const day = special.date.getUTCDate();
      const startOfDay = this.utils.buildCalendarDate(year, month, day);

      const freeSlots = await this.getFreeSlots(
        getStadionIds(stadion),
        startOfDay,
        start_time,
        special.end_time,
        referenceStart,
      );

      const backCallback = `booking_specialBack_${special.id}_${stadionId}`;
      if (!freeSlots.length) {
        await this.notifyNoFreeSlots(ctx, lang, backCallback);
        return;
      }

      ctx.session.stadion.schedule_id = special.id;
      const keyboard = this.slotKeyboard(
        freeSlots,
        'end',
        (slot) =>
          `booking_specialEnd_${start_time}_${slot.end}_${stadionId}_${year}_${month}_${day}_${scheduleType.special}`,
      );
      keyboard.push(this.backButton(lang, backCallback));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectEndTime'),
        { inline_keyboard: keyboard },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async bookingSchedule_start(
    ctx: MyContext,
    years: string,
    day: string,
    monthNumber: string,
    scheduleId: number,
    stadionId: number,
    lang: string,
  ) {
    try {
      if (ctx.session.stadion.schedule_id) ctx.session.stadion.schedule_id = null;

      const [scheduleDate, stadion] = await Promise.all([
        this.prisma.stadion_chedule.findUnique({ where: { id: scheduleId } }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!scheduleDate || !stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Jadval yoki stadion topilmadi: schedule=${scheduleId} stadion=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      const referenceStart = scheduleDate.start_time;
      const startOfDay = this.utils.buildCalendarDate(
        Number(years),
        Number(monthNumber),
        Number(day),
      );
      const fromTime = this.resolveSlotStart(startOfDay, scheduleDate.start_time, referenceStart);
      const freeSlots = await this.getFreeSlots(
        getStadionIds(stadion),
        startOfDay,
        fromTime,
        scheduleDate.end_time,
        referenceStart,
      );

      const backCallback = `booking_back_${stadionId}`;
      if (!freeSlots.length) {
        await this.notifyNoFreeSlots(ctx, lang, backCallback);
        return;
      }

      const keyboard = this.slotKeyboard(
        freeSlots,
        'start',
        (slot) =>
          `booking_timeStart_${slot.start}_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
      );
      keyboard.push(this.backButton(lang, backCallback));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectTime'),
        { inline_keyboard: keyboard },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  async bookingSchedule_end(
    ctx: MyContext,
    years: string,
    start_time: string,
    scheduleId: number,
    day: number,
    monthNumber: number,
    stadionId: number,
    lang: string,
  ) {
    try {
      const [scheduleDate, stadion] = await Promise.all([
        this.prisma.stadion_chedule.findUnique({ where: { id: scheduleId } }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!scheduleDate || !stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Jadval yoki stadion topilmadi: schedule=${scheduleId} stadion=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      const referenceStart = scheduleDate.start_time;
      const startOfDay = this.utils.buildCalendarDate(
        Number(years),
        Number(monthNumber),
        Number(day),
      );
      const freeSlots = await this.getFreeSlots(
        getStadionIds(stadion),
        startOfDay,
        start_time,
        scheduleDate.end_time,
        referenceStart,
      );

      const backCallback = `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`;
      if (!freeSlots.length) {
        await this.notifyNoFreeSlots(ctx, lang, backCallback);
        return;
      }

      ctx.session.scheduleId = scheduleDate.id;
      const keyboard = this.slotKeyboard(
        freeSlots,
        'end',
        (slot) =>
          `booking_timeEnd_${start_time}_${slot.end}_${day}_${monthNumber}_${stadionId}_${years}_${scheduleType.schedule}`,
      );
      keyboard.push(this.backButton(lang, backCallback));

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.stadion.selectEndTime'),
        { inline_keyboard: keyboard },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  // ───────────────────────── Bron yaratish ─────────────────────────

  async bookingScheduleFinish(
    ctx: MyContext,
    start_time: string,
    end_time: string,
    date: Date,
    lang: string,
    stadionId: number,
    type: scheduleType,
  ) {
    let conflictBack = 'back_user_3';
    try {
      ctx.session.pendingBooking = { ...INITIAL_PENDING_BOOKING };

      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: { select: { payout_status: true, paylov_partner_id: true } },
          children: true,
          parent: true,
        },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion topilmadi: id=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      let backCallback = `booking_back_${stadionId}`;
      if (ctx.session.scheduleId) {
        const id = ctx.session.scheduleId;
        backCallback =
          type === scheduleType.schedule
            ? `booking_timeStart_${start_time}_${id}_${date.getDate()}_${date.getMonth() + 1}_${date.getFullYear()}_${stadionId}`
            : `booking_special_${start_time}_${id}_${stadionId}`;
      }
      conflictBack = backCallback;

      const targetStadionId = stadion.parent_id ?? stadion.id;
      const dayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();

      const [scheduleRow, specialRow] = await Promise.all([
        this.prisma.stadion_chedule.findFirst({
          where: { stadion_id: targetStadionId, day_of_week: dayOfWeek },
        }),
        this.prisma.stadion_special_schedule.findFirst({
          where: { stadion_id: targetStadionId, date },
        }),
      ]);

      const referenceStart =
        specialRow?.start_time ?? scheduleRow?.start_time ?? start_time;

      // Tungi jadvalda (masalan 22:00-02:00) 00:00 dan keyingi vaqt ertasi kunga tegishli
      const bookingDate = new Date(date);
      if (toMinutes(start_time) < toMinutes(referenceStart)) {
        bookingDate.setUTCDate(bookingDate.getUTCDate() + 1);
      }

      const startAt = this.utils.combineDateAndTime(date, start_time, referenceStart);
      const endAt = this.utils.combineDateAndTime(date, end_time, referenceStart);

      // ── Admin (owner) qo'lda bron qilmoqda ──
      if (ctx.session.admin_step === 'NewBooking_owners') {
        conflictBack = 'back_owner_11';
        const { total, hors } = this.utils.calculateTotalPrice_Admins(
          start_time,
          end_time,
          stadion.price,
        );

        const booking = await this.runGuarded(stadion, startAt, endAt, (tx) =>
          tx.booking.create({
            data: {
              stadion_id: stadion.id,
              date: bookingDate,
              start_time,
              end_time,
              customer_name: ctx.session.admin_bron_name,
              customer_phone: ctx.session.admin_bron_phone,
              startAt,
              endAt,
              status: 'CONFIRMED',
              total_price: total,
              payment_method: 'CASH',
              expires_at: new Date(Date.now() + CASH_BOOKING_TTL_MS),
            },
          }),
        );

        ctx.session.admin_bron_name = null;
        ctx.session.admin_bron_phone = null;
        if (ctx.session.admin_booking_messages?.length) {
          await ctx
            .deleteMessages(ctx.session.admin_booking_messages)
            .catch(() => undefined);
          ctx.session.admin_booking_messages = [];
        }

        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, 'admin.new_booking.success', {
            stadion: stadion.name,
            date: formatDate(bookingDate, lang),
            start_time,
            end_time,
            hours: hors,
            total_price: total,
            status: statusMap(booking.status, this.i18n, lang),
          }),
          { inline_keyboard: [this.backButton(lang, 'back_owner_11')] },
        );
        ctx.session.admin_step = null;
        return;
      }

      // ── Oddiy user bron qilmoqda ──
      const user = await this.findCurrentUser(ctx);
      if (!user) {
        await this.utils.errorFunction(
          ctx,
          new Error(`User topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.USER,
        );
        return;
      }

      const hasCard = canPayByCard(stadion.payments_type, stadion.owner);
      const noshowCount = await this.countNoShows(user.id, stadion.id);
      const { penalty, total, hors } = this.utils.calculateTotalPrice(
        start_time,
        end_time,
        stadion.price,
        noshowCount,
      );

      const cardText = this.t(lang, 'peyments.card');
      const cashText = this.t(lang, 'peyments.cash');
      const baseArgs = {
        date: formatDate(bookingDate, lang),
        start_time,
        end_time,
        hours: hors,
        total: total.toLocaleString(),
      };
      const penaltyBlock =
        penalty > 0
          ? this.t(lang, 'booking.penalty_block', {
              penalty: penalty.toLocaleString(),
            })
          : '';
      const noshowWarning =
        noshowCount === 1
          ? this.t(lang, 'booking.no_show_warning')
          : noshowCount >= 2
            ? this.t(lang, 'booking.penalty')
            : '';

      /** Karta orqali to'lov: bron hali yaratilmaydi, ma'lumot sessionda saqlanadi */
      const startCardFlow = async (warning: string): Promise<void> => {
        ctx.session.pendingBooking = {
          stadion_id: stadion.id,
          date,
          bookingData: bookingDate,
          start_time,
          end_time,
          startAt,
          endAt,
          payment_method: Pay_method.CARD,
          total_price: total,
          user_id: user.id,
          type,
        };
        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, 'booking.message_template', {
            ...baseArgs,
            warning,
            payment_method: cardText,
            penalty_block: penaltyBlock,
          }),
          {
            inline_keyboard: [
              [
                {
                  text: this.t(lang, 'booking.pay_by_card'),
                  callback_data: `bookingPaymentProviders_${lang}`,
                },
              ],
              this.backButton(lang, backCallback),
            ],
          },
          'Markdown',
        );
      };

      /** Naqd to'lov: bron darhol yaratiladi va user tasdiqlashi kutiladi */
      const startCashFlow = async (
        templateKey: string,
        args: Record<string, unknown>,
      ): Promise<void> => {
        const booking = await this.runGuarded(stadion, startAt, endAt, (tx) =>
          tx.booking.create({
            data: {
              stadion_id: stadion.id,
              user_id: user.id,
              date: bookingDate,
              start_time,
              end_time,
              startAt,
              endAt,
              total_price: total,
              payment_method: 'CASH',
              expires_at: new Date(Date.now() + CASH_BOOKING_TTL_MS),
            },
          }),
        );
        await this.utils.safeEditOrReply(
          ctx,
          this.t(lang, templateKey, args),
          {
            inline_keyboard: [
              [
                {
                  text: this.t(lang, 'booking.confirm'),
                  callback_data: `booking_confirm_yes_${booking.id}`,
                },
                {
                  text: this.t(lang, 'booking.cancel'),
                  callback_data: `booking_confirm_no_${booking.id}`,
                },
              ],
            ],
          },
          'Markdown',
        );
      };

      switch (stadion.payments_type) {
        case 'CARD': {
          if (!hasCard) {
            await this.utils.errorFunction(
              ctx,
              new Error(
                `Stadion ${stadion.id} karta qabul qila olmaydi (payout/partner sozlanmagan)`,
              ),
              ErrorContext.BOOKING,
            );
            return;
          }
          await startCardFlow(noshowWarning);
          return;
        }
        case 'CASH': {
          await startCashFlow('booking.booking_confirm', {
            ...baseArgs,
            warning: noshowWarning,
            payment_method: cashText,
            penalty_block: penaltyBlock,
          });
          return;
        }
        case 'GIBRID': {
          // 2 va undan ko'p NOSHOW: karta majburiy (karta bo'lmasa naqd, ogohlantirish bilan)
          if (noshowCount >= 2 && hasCard) {
            await startCardFlow(this.t(lang, 'booking.warning'));
            return;
          }
          if (noshowCount >= 2) {
            await startCashFlow('booking.booking_penalty_notice.message_template', {
              ...baseArgs,
              warning: this.t(lang, 'booking.booking_penalty_notice.warning'),
              payment_method: cashText,
              penalty_block: penaltyBlock,
            });
            return;
          }
          if (!hasCard) {
            await startCashFlow('booking.booking_warning.message_template', {
              ...baseArgs,
              warning:
                noshowCount === 1
                  ? this.t(lang, 'booking.booking_warning.warning')
                  : '',
              payment_method: cashText,
            });
            return;
          }

          const shortDate = bookingDate.toISOString().split('T')[0];
          const suffix = `${start_time}_${end_time}_${shortDate}_${stadionId}_${Number(stadion.price)}_${noshowCount}_${type}`;
          await this.utils.safeEditOrReply(
            ctx,
            this.t(lang, 'booking.select_payment_method'),
            {
              inline_keyboard: [
                [
                  {
                    text: cashText,
                    callback_data: `booking_peyments_cash_${suffix}`,
                  },
                ],
                [
                  {
                    text: cardText,
                    callback_data: `booking_peyments_card_${suffix}`,
                  },
                ],
                this.backButton(lang, backCallback),
              ],
            },
          );
          return;
        }
        default:
          await this.utils.errorFunction(
            ctx,
            new Error(
              `Noma'lum payments_type: ${String(stadion.payments_type)} (stadion=${stadion.id})`,
            ),
            ErrorContext.BOOKING,
          );
      }
    } catch (error) {
      await this.handleBookingFailure(ctx, lang, error, conflictBack);
    }
  }

  async bookingPayments(
    ctx: MyContext,
    type: string,
    date: Date,
    start_time: string,
    end_time: string,
    stadionId: number,
    _pricePerHur: number,
    _noshowCount: number,
    schedule_type: scheduleType,
    lang: string,
  ) {
    try {
      ctx.session.pendingBooking = { ...INITIAL_PENDING_BOOKING };

      const user = await this.findCurrentUser(ctx);
      if (!user) {
        await this.utils.errorFunction(
          ctx,
          new Error(`User topilmadi: chatID=${ctx.from?.id}`),
          ErrorContext.USER,
        );
        return;
      }

      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: { select: { payout_status: true, paylov_partner_id: true } },
          parent: true,
          children: true,
        },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion topilmadi: id=${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      if (!canPayByCard(stadion.payments_type, stadion.owner)) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion ${stadion.id} karta qabul qila olmaydi`),
          ErrorContext.BOOKING,
        );
        return;
      }

      // Narx va noshow soni callback_data dan EMAS, bazadan olinadi (callback soxtalashtirilishi mumkin)
      const pricePerHour = Number(stadion.price);
      const noshowCount = await this.countNoShows(user.id, stadion.id);
      const { total, hors } = this.utils.calculateTotalPrice(
        start_time,
        end_time,
        pricePerHour,
        noshowCount,
      );

      const dayText = format(date, 'yyyy-MM-dd');
      const startAt = new Date(`${dayText}T${start_time}:00`);
      const endAt = new Date(`${dayText}T${end_time}:00`);

      const warning =
        noshowCount === 1
          ? this.t(lang, 'booking.booking_warning.warning')
          : noshowCount >= 2
            ? this.t(lang, 'booking.penalty')
            : '';

      switch (type) {
        case 'cash': {
          const booking = await this.runGuarded(stadion, startAt, endAt, (tx) =>
            tx.booking.create({
              data: {
                stadion_id: stadionId,
                user_id: user.id,
                date,
                start_time,
                end_time,
                startAt,
                endAt,
                total_price: total,
                payment_method: 'CASH',
                expires_at: new Date(Date.now() + CASH_BOOKING_TTL_MS),
              },
            }),
          );

          await this.utils.safeEditOrReply(
            ctx,
            this.t(lang, 'booking.booking_warning.message_template', {
              warning,
              date: formatDate(date, lang),
              start_time,
              end_time,
              hours: hors,
              total: total.toLocaleString(),
              payment_method: this.t(lang, 'peyments.cash'),
            }),
            {
              inline_keyboard: [
                [
                  {
                    text: this.t(lang, 'booking.confirm'),
                    callback_data: `booking_confirm_yes_${booking.id}`,
                  },
                  {
                    text: this.t(lang, 'booking.cancel'),
                    callback_data: `booking_confirm_no_${booking.id}`,
                  },
                ],
              ],
            },
            'Markdown',
          );
          return;
        }
        case 'card': {
          ctx.session.pendingBooking = {
            date,
            start_time,
            end_time,
            startAt,
            endAt,
            bookingData: date,
            payment_method: Pay_method.CARD,
            stadion_id: stadionId,
            user_id: user.id,
            total_price: total,
            pricePerHur: pricePerHour,
            noshowCount,
            type: schedule_type,
          };

          await this.utils.safeEditOrReply(
            ctx,
            this.t(lang, 'booking.booking_details', {
              warning,
              date: formatDate(date, lang),
              start_time,
              end_time,
              hours: hors,
              total: total.toLocaleString(),
              payment_method: this.t(lang, 'peyments.card'),
            }),
            {
              inline_keyboard: [
                [
                  {
                    text: this.t(lang, 'booking.payment_options.prepay'),
                    callback_data: `bookingPaymentProviderStep2_${lang}`,
                  },
                ],
                [
                  {
                    text: this.t(lang, 'booking.payment_options.pay_later'),
                    callback_data: 'booking_confirm_pending_1',
                  },
                ],
                this.backButton(lang, 'back_user_Booking'),
              ],
            },
            'Markdown',
          );
          return;
        }
        default:
          await this.utils.errorFunction(
            ctx,
            new Error(`bookingPayments: noma'lum type: ${type}`),
            ErrorContext.COMMON,
          );
      }
    } catch (error) {
      await this.handleBookingFailure(ctx, lang, error, 'back_user_Booking');
    }
  }

  // ───────────────────────── Vaqt bo'yicha qidirish ─────────────────────────

  async searchWorkingStadions(
    ctx: MyContext,
    date: string,
    start_time: string,
    end_time: string,
    lang: string,
    page: number = 1,
  ) {
    try {
      const searchDate = new Date(date);
      if (Number.isNaN(searchDate.getTime())) {
        await this.utils.errorFunction(
          ctx,
          new Error(`searchWorkingStadions: sana noto'g'ri: ${date}`),
          ErrorContext.COMMON,
        );
        return;
      }

      const currentPage = Math.max(1, Number(page) || 1);
      const limit = 4;
      // new Date('yyyy-MM-dd') UTC yarim tunga teng, shuning uchun hafta kuni ham UTC bo'yicha olinadi
      const dayOfWeek = searchDate.getUTCDay() === 0 ? 7 : searchDate.getUTCDay();

      const coversTime = { start_time: { lte: start_time }, end_time: { gte: end_time } };

      const specialDay: Prisma.StadionWhereInput = {
        stadionOffDays: { none: { date: searchDate } },
        stadionSpecialSchedules: { some: { date: searchDate, ...coversTime } },
      };
      const regularDay: Prisma.StadionWhereInput = {
        AND: [
          { stadionSpecialSchedules: { none: { date: searchDate } } },
          { stadionOffDays: { none: { date: searchDate } } },
          { stadionChedules: { some: { day_of_week: dayOfWeek, ...coversTime } } },
        ],
      };

      const whereCondition: Prisma.StadionWhereInput = {
        working_status: true,
        admin_status: AdminStatus.APPROVED,
        owner: { status: Admin_S.ACTIVE },
        // Faqat faol bronlar vaqtni band qiladi (bekor qilinganlari emas)
        bookings: {
          none: {
            date: searchDate,
            status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
            AND: [
              { start_time: { lt: end_time } },
              { end_time: { gt: start_time } },
            ],
          },
        },
        OR: [
          specialDay,
          { parent: specialDay },
          regularDay,
          { parent: regularDay },
        ],
      };

      const [stadions, total] = await Promise.all([
        this.prisma.stadion.findMany({
          where: whereCondition,
          skip: (currentPage - 1) * limit,
          take: limit,
          include: { region: true, region_items: true },
        }),
        this.prisma.stadion.count({ where: whereCondition }),
      ]);

      if (!stadions.length) {
        await this.answerCb(ctx, this.t(lang, 'booking.no_free_slots'), true);
        return;
      }

      await ctx.deleteMessage().catch(() => undefined);
      if (ctx.session.stadionMessages?.length) {
        await ctx
          .deleteMessages(ctx.session.stadionMessages)
          .catch(() => undefined);
        ctx.session.stadionMessages = [];
      }

      for (const stadion of stadions) {
        await this.stadionAll_data(ctx, lang, stadion, '', true);
      }

      const totalPages = Math.ceil(total / limit);
      if (totalPages <= 1) return;

      await ctx.reply(this.t(lang, 'booking.Select'), {
        reply_markup: {
          inline_keyboard: [
            this.paginationRow(
              lang,
              currentPage,
              totalPages,
              (p) =>
                `search_stadionsPage_${date}_${start_time}_${end_time}_${lang}_${p}`,
            ),
          ],
        },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await this.answerCb(ctx);
    }
  }

  private readPendingForPayment(pending: PendingBooking) {
    if (!pending) return null;
    const {
      stadion_id,
      user_id,
      bookingData,
      start_time,
      end_time,
      startAt,
      endAt,
      total_price,
      payment_method,
      type,
    } = pending;

    if (
      !stadion_id ||
      !user_id ||
      !bookingData ||
      !start_time ||
      !end_time ||
      !startAt ||
      !endAt ||
      !total_price ||
      !payment_method ||
      !type
    ) {
      return null;
    }
    return {
      stadion_id,
      user_id,
      bookingData,
      start_time,
      end_time,
      startAt,
      endAt,
      total_price,
    };
  }

  async BookingPaymentProviders(
    ctx: MyContext,
    provider: GatewayMethod,
    lang: string,
  ) {
    try {
      const pending = this.readPendingForPayment(ctx.session.pendingBooking);
      if (!pending) {
        // Odatda session eskirgan (bot qayta ishga tushgan yoki eski tugma)
        await this.utils.errorFunction(
          ctx,
          new Error("BookingPaymentProviders: pendingBooking topilmadi yoki to'liq emas"),
          ErrorContext.USER,
        );
        return;
      }

      const botUsername = process.env.BOT_USERNAME;
      if (!botUsername) throw new Error('BOT_USERNAME sozlanmagan');

      const slotStadion = await this.prisma.stadion.findUnique({
        where: { id: pending.stadion_id },
        include: { parent: true, children: true },
      });
      if (!slotStadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion topilmadi: id=${pending.stadion_id}`),
          ErrorContext.STADION,
        );
        return;
      }

      // Vaqt bo'shligini tekshirish va booking + tranzaksiya yaratish bitta Serializable tranzaksiyada
      const created = await this.runGuarded(
        slotStadion,
        pending.startAt,
        pending.endAt,
        async (tx) => {
          const booking = await tx.booking.create({
            data: {
              stadion_id: pending.stadion_id,
              user_id: pending.user_id,
              date: pending.bookingData,
              start_time: pending.start_time,
              end_time: pending.end_time,
              startAt: pending.startAt,
              endAt: pending.endAt,
              total_price: pending.total_price,
              payment_method: Pay_method.CARD,
              expires_at: new Date(Date.now() + CARD_BOOKING_TTL_MS),
            },
          });

          const transaction = await tx.tranzaktion.create({
            data: {
              user_id: pending.user_id,
              booking_id: booking.id,
              amount: pending.total_price,
              provider: PaymentProvider.PAYLOV,
              gateway_method: provider,
              status: TransactionStatus.PENDING,
            },
          });

          return { booking, transaction };
        },
      ).catch(async (error: unknown) => {
        if (this.isSlotConflict(error)) {
          await this.notifyNoFreeSlots(ctx, lang, 'back_user_Booking');
          return null;
        }
        throw error;
      });
      if (!created) return;

      const { booking, transaction } = created;

      let checkoutUrl: string;
      try {
        const checkout = await this.paylov.createCheckout({
          externalId: `BK:${transaction.id}`,
          amountSom: pending.total_price,
          method: provider,
          returnUrl: `https://t.me/${botUsername}?start=paymentBooking_success_${transaction.id}`,
        });

        await this.prisma.tranzaktion.update({
          where: { id: transaction.id },
          data: { provider_order_id: String(checkout.order_id) },
        });
        checkoutUrl = checkout.checkout_url;
      } catch (checkoutError) {
        try {
          await this.prisma.$transaction([
            this.prisma.tranzaktion.update({
              where: { id: transaction.id },
              data: { status: TransactionStatus.FAILED },
            }),
            this.prisma.booking.update({
              where: { id: booking.id },
              data: { expires_at: new Date() },
            }),
          ]);
        } catch (rollbackError) {
          this.logger.error(
            `Booking #${booking.id} rollback bo'lmadi (tranzaksiya ${transaction.id})`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
        }
        await this.utils.errorFunction(ctx, checkoutError, ErrorContext.PAYMENT);
        return;
      }

      await this.utils.safeEditOrReply(
        ctx,
        this.t(lang, 'booking.payment.redirect', {
          total: pending.total_price.toLocaleString(),
        }),
        {
          inline_keyboard: [
            [{ text: this.t(lang, 'booking.payment.pay_button'), url: checkoutUrl }],
            [
              {
                text: this.t(lang, 'booking.cancel'),
                callback_data: `booking_confirm_no_${booking.id}`,
              },
            ],
          ],
        },
      );

      ctx.session.pendingBooking = { ...INITIAL_PENDING_BOOKING };
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    }
  }
}