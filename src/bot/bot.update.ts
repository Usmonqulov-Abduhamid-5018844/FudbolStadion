import { I18nService, logger } from 'nestjs-i18n';
import { BotService } from './bot.service';
import { Action, Ctx, On, Start, Update } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { OwnersService } from 'src/owners/owners.service';
import { UsersService } from 'src/users/users.service';
import { InlineKeyboardButton } from 'telegraf/types';
import { Markup } from 'telegraf';
import {
  Admin_S,
  AdminStatus,
  AdvertisementStatus,
  Booking_status,
  GatewayMethod,
  Pay_method,
  PaymentProvider,
  Payments,
  PremiumReason,
  Prisma,
  RefundStatus,
  TransactionStatus,
} from '@prisma/client';
import {
  helpMenuKeyboard_Owner,
  helpMenuKeyboard_Users,
} from 'src/helpers/Inline_keybort';
import {
  canCancelBooking,
  formatSum,
  MIN_CANCEL_HOURS_BEFORE,
  UtilisService,
} from 'src/utils/utile.service';
import { format, subDays } from 'date-fns';
import { QrService } from 'src/qr/qr.service';
import {
  CURRENCY_LABELS,
  EStadion_type,
  getPremiumPaymentDescription,
  IBooking,
  INITIAL_PENDING_BOOKING,
  INITIAL_SESSION,
  PLAN_LABELS,
  PREMIUM_PLANS,
  Premium_price,
  PremiumPlan,
} from 'src/helpers/interface';
import {
  canOwnerAcceptCard,
  canPayByCard,
  getRelatedStadionIds,
  getStadionIds,
} from 'src/helpers/stadions';
import { statusMap } from 'src/helpers/bookingStatus';
import {
  DefaultNotificationSettings,
  NotificationNames,
  NotificationSettings_type,
} from 'src/types/notifikation';
import { PAYMENT_PROVIDERS } from 'src/helpers/provider';
import { AdminService } from 'src/admin/admin.service';
import { formatDate } from 'src/helpers/dateFormat';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import {
  AlertType,
  ErrorContext,
  scheduleType,
} from 'src/helpers/interface/enum';
import { Logger } from '@nestjs/common';
import { PaylovService } from 'src/paylov/paylov.service';
import { AlertService } from 'src/alert/alert.service';
class InvalidCallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCallbackError';
  }
}
type AdminLevel = 'admin' | 'super';

interface AdminRunOptions {
  level?: AdminLevel;
  context?: ErrorContext;
}

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);
  private readonly AdminChatid = (process.env.ADMIN_CHAT_ID ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  private readonly SuperAdminChatid = (process.env.SUPPER_ADMIN ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly ownerService: OwnersService,
    private readonly userService: UsersService,
    private readonly utils: UtilisService,
    private readonly qrservice: QrService,
    private readonly adminPaneli: AdminService,
    private readonly notifikationService: NotifikationService,
    private readonly paylov: PaylovService,
    private readonly alert: AlertService,
  ) {}

  private readonly STATUS_FILTERS: Booking_status[] = [
    'PENDING',
    'CONFIRMED',
    'PAID',
    'COMPLETED',
    'CANCELED',
    'NOSHOW',
    'REFUNDED',
  ];

  private readonly BY_START: Prisma.BookingOrderByWithRelationInput[] = [
    { startAt: 'asc' },
    { id: 'asc' },
  ];

  private setRegistorId(ctx: MyContext, id: number | null): void {
    ctx.session.owner_registor = {
      ...ctx.session.owner_registor,
      id,
    } as typeof ctx.session.owner_registor;
  }

  private async sendBookings(
    ctx: MyContext,
    bookings: IBooking[],
    page: number,
    lang: string,
    type: string,
    callbackData: string,
  ): Promise<void> {
    for (const item of bookings) {
      await this.ownerService.sendBookingMessage(
        ctx,
        item,
        page,
        lang,
        type,
        callbackData,
      );
    }
  }
  private tr(lang: string) {
    return (key: string, args?: Record<string, unknown>): string =>
      this.i18n.translate(key, { lang, args });
  }

  private async alertBox(ctx: MyContext, text: string): Promise<void> {
    await ctx.answerCbQuery(text, { show_alert: true }).catch(() => undefined);
  }

  private async deny(ctx: MyContext, lang: string): Promise<void> {
    await this.alertBox(ctx, this.tr(lang)('admin.access_denied'));
  }

  private async notFound(
    ctx: MyContext,
    what: string,
    id: number | string,
    context: ErrorContext = ErrorContext.USER,
  ): Promise<void> {
    await this.utils.errorFunction(
      ctx,
      new Error(`${what} topilmadi: ${id}`),
      context,
    );
  }

  private async isOwnerOf(ctx: MyContext, ownerId: number): Promise<boolean> {
    const owner = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
      select: { id: true },
    });
    return owner?.id === ownerId;
  }

  private async ownsStadion(
    ctx: MyContext,
    stadionId: number,
  ): Promise<boolean> {
    const found = await this.prisma.stadion.findFirst({
      where: { id: stadionId, owner: { chatID: String(ctx.from?.id) } },
      select: { id: true },
    });
    return Boolean(found);
  }

  private isBookingOwner(
    booking: { user?: { chatID: unknown } | null },
    ctx: MyContext,
  ): boolean {
    const chatId = booking.user?.chatID;
    return chatId != null && String(chatId) === String(ctx.from?.id);
  }

  private background(task: unknown, label: string): void {
    Promise.resolve(task).catch((error: unknown) => {
      this.logger.error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private async clearMessages(
    ctx: MyContext,
    key: 'stadionFavoritMessages' | 'bookingBrones' | 'stadionMessages',
  ): Promise<void> {
    const ids = ctx.session[key];
    if (ids?.length) {
      await ctx.deleteMessages(ids).catch(() => undefined);
      ctx.session[key] = [];
    }
  }

  private parseCalendarDate(year: string, month: string, day: string): Date {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      throw new Error(`Noto'g'ri sana: ${year}-${month}-${day}`);
    }
    return date;
  }

  private parseScheduleType(raw: string): scheduleType {
    if (!(Object.values(scheduleType) as string[]).includes(raw)) {
      throw new Error(`Noto'g'ri scheduleType: ${raw}`);
    }
    return raw as scheduleType;
  }

  private async availableProviders() {
    const active = await this.paylov.getActiveMethods();
    return PAYMENT_PROVIDERS.filter((p) =>
      active.some((a) => a.name === p.key.toLowerCase()),
    );
  }

  private async showProviders(
    ctx: MyContext,
    lang: string,
    callbackOf: (providerKey: string) => string,
    backCallback: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const providers = await this.availableProviders();
    const back: InlineKeyboardButton[] = [
      { text: t('schedule.back'), callback_data: backCallback },
    ];

    if (!providers.length) {
      await this.utils.safeEditOrReply(ctx, t('premium.payment.no_methods'), {
        inline_keyboard: [back],
      });
      return;
    }

    const rows: InlineKeyboardButton[][] = providers.map((p) => [
      {
        text: `${p.icon} ${t(p.translationKey)}`,
        callback_data: callbackOf(p.key),
      },
    ]);
    await this.utils.safeEditOrReply(
      ctx,
      t('booking.payment.choose_provider'),
      {
        inline_keyboard: [...rows, back],
      },
    );
  }

  private async ensurePayable(
    ctx: MyContext,
    booking: { status: Booking_status; startAt: Date },
    lang: string,
  ): Promise<boolean> {
    const t = this.tr(lang);
    if (booking.status === Booking_status.PAID) return false;
    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      await this.alertBox(ctx, t('booking.already_cancelled'));
      return false;
    }
    if (this.utils.timeUntil(booking.startAt).totalMinutes < 0) {
      await this.alertBox(ctx, t('booking.play_game'));
      return false;
    }
    return true;
  }

  private async loadCancellable(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ) {
    const t = this.tr(lang);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { stadion: { include: { owner: true } }, user: true },
    });

    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return null;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return null;
    }
    if (!['PENDING', 'CONFIRMED', 'PAID'].includes(booking.status)) {
      await this.alertBox(ctx, t('booking.already_cancelled'));
      return null;
    }

    const { totalMinutes } = this.utils.bookingTimeCalculateRaw(
      booking.date,
      booking.start_time,
    );
    if (!canCancelBooking(totalMinutes)) {
      await this.alertBox(
        ctx,
        t('booking.cancel_too_late', { hours: MIN_CANCEL_HOURS_BEFORE }),
      );
      return null;
    }
    return booking;
  }

  private paymentSwitchBlock(
    current: Payments,
    next: Payments,
    ownerCanCard: boolean,
    bookingsCount: number,
    hasCardBooking: boolean,
  ):
    | 'ownerCard'
    | 'cardToCash'
    | 'cashToCard'
    | 'hybridToCash'
    | 'hybridToCard'
    | null {
    if (bookingsCount === 0) return null;
    if (next === 'CARD' && !ownerCanCard) return 'ownerCard';
    if (current === 'CARD' && next === 'CASH') return 'cardToCash';
    if (current === 'CASH' && next === 'CARD' && !hasCardBooking) {
      return 'cashToCard';
    }
    if (current === 'GIBRID' && next === 'CASH' && hasCardBooking) {
      return 'hybridToCash';
    }
    if (current === 'GIBRID' && next === 'CARD' && !hasCardBooking) {
      return 'hybridToCard';
    }
    return null;
  }

  private isSuperAdmin(ctx: MyContext): boolean {
    const id = ctx.from?.id;
    return id !== undefined && this.SuperAdminChatid.includes(Number(id));
  }

  private isAdmin(ctx: MyContext): boolean {
    const id = ctx.from?.id;
    return (
      this.isSuperAdmin(ctx) ||
      (id !== undefined && this.AdminChatid.includes(Number(id)))
    );
  }

  private hasAccess(ctx: MyContext, level: AdminLevel): boolean {
    return level === 'super' ? this.isSuperAdmin(ctx) : this.isAdmin(ctx);
  }

  private callbackData(ctx: MyContext): string | undefined {
    const query = ctx.callbackQuery;
    return query && 'data' in query ? query.data : undefined;
  }

  private callbackParts(ctx: MyContext): string[] {
    return this.callbackData(ctx)?.split('_') ?? [];
  }

  private parsePremiumReason(raw: string): PremiumReason {
    if (!(Object.values(PremiumReason) as string[]).includes(raw)) {
      throw new InvalidCallbackError(`Noto'g'ri PremiumReason: ${raw}`);
    }
    return raw as PremiumReason;
  }

  private reportSecurity(ctx: MyContext, reason: string): void {
    const userId = ctx.from?.id ?? 'unknown';
    const username = ctx.from?.username ? `@${ctx.from.username}` : '-';
    const details = [
      `reason: ${reason}`,
      `userId: ${userId}`,
      `username: ${username}`,
      `chatId: ${ctx.chat?.id ?? '-'}`,
      `callback_data: ${this.callbackData(ctx) ?? '-'}`,
    ].join('\n');

    this.background(
      this.alert.notify(
        `Security: ${reason} | user ${userId}`,
        details,
        AlertType.SECURITY,
      ),
      'security alert',
    );
  }

  private auditLog(ctx: MyContext, level: AdminLevel): void {
    if (level !== 'super') return;
    this.logger.log(
      `AUDIT super-admin | userId: ${ctx.from?.id} | callback_data: ${this.callbackData(ctx) ?? '-'}`,
    );
  }

  private async runAdmin(
    ctx: MyContext,
    run: (lang: string, parts: string[]) => Promise<unknown>,
    options: AdminRunOptions = {},
  ): Promise<void> {
    const { level = 'admin', context = ErrorContext.ADMIN } = options;
    const lang = await this.utils.langs(ctx);

    if (!this.hasAccess(ctx, level)) {
      const key =
        level === 'super' ? 'admin.super_admin_only' : 'admin.admin_only';
      await this.alertBox(ctx, this.tr(lang)(key));
      this.reportSecurity(ctx, `${level} huquqisiz urinish`);
      return;
    }

    const parts = this.callbackParts(ctx);
    if (!parts.length) return;

    this.auditLog(ctx, level);

    try {
      await run(lang, parts);
    } catch (error) {
      if (error instanceof InvalidCallbackError) {
        this.logger.warn(`${error.message} | userId: ${ctx.from?.id}`);
        this.reportSecurity(ctx, error.message);
        await this.alertBox(ctx, this.tr(lang)('error.error'));
        return;
      }

      await this.utils.errorFunction(ctx, error, context);
    }
  }

  @Start()
  async onStart(@Ctx() ctx: any) {
    try {
      if (!ctx.from?.id) return;
      ctx.session = structuredClone(INITIAL_SESSION);

      const payload: string | undefined = ctx.payload;
      if (payload?.startsWith('stadionBooking_')) {
        return await this.botService.handlePayload(ctx, payload);
      }
      if (payload?.startsWith('paymentPremium_success_')) {
        return await this.botService.handlePayloadSucces(ctx, payload);
      }
      if (payload?.startsWith('paymentBooking_success_')) {
        return await this.botService.handlePayload_bookingSuccess(ctx, payload);
      }

      const data = await this.prisma.sesion.findUnique({
        where: { chat_id: String(ctx.from.id) },
      });
      if (data) {
        ctx.session.lang = data.lang;
        return await this.botService.checket(ctx);
      }
      return await this.botService.start(ctx);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  @Action(/^lang_(uz|ru|en)$/)
  async language(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const chat_id = String(ctx.from?.id);
      const lang = ctx.callbackQuery.data.split('_')[1];

      await this.prisma.sesion.upsert({
        where: { chat_id },
        create: { chat_id, lang },
        update: { lang },
      });
      ctx.session = ctx.session || {};
      ctx.session.lang = lang;

      if (ctx.session.step === 'language') {
        const owner = await this.prisma.owners.findUnique({
          where: { chatID: chat_id },
        });
        if (!owner) {
          await this.utils.errorFunction(
            ctx,
            new Error(`Owner topilmadi: chatID=${chat_id}`),
            ErrorContext.OWNER,
          );
          return;
        }

        const t = (key: string): string => this.i18n.translate(key, { lang });
        const row = (key: string, type: string) => [
          {
            text: t(key),
            callback_data: JSON.stringify({ id: owner.id, type }),
          },
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
        return;
      }

      if (ctx.session.step === 'user_langs') {
        return await this.userService.settings(ctx, lang);
      }
      if (ctx.session.advertisement_step === 'advertisement') {
        ctx.session.advertisement_step = 'advertisement_register';
        return await this.userService.registor(ctx, lang);
      }
      return await this.botService.checket(ctx);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  @Action(/^check_required_channels$/)
  async check_required_channels(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      await this.botService.checket(ctx);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  @Action(/^errorBack_(\d+)$/)
  async errorBack(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      ctx.session = structuredClone(INITIAL_SESSION);
      ctx.session.lang = await this.utils.langs(ctx);
      await this.botService.checket(ctx);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  @Action(/^delete_stadion_fovorite_(\d+)$/)
  async deletStadion(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const stadionId = Number(ctx.callbackQuery.data.split('_')[3]);

      await this.prisma.myFavoriteStadium.deleteMany({
        where: { chat_id: String(ctx.from?.id), stadion_id: stadionId },
      });
      await ctx.deleteMessage().catch(() => undefined);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^bookingStadium_(\d+)_(\d+)_(\d+)$/)
  async bookingStadium(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const [, stadionId] = ctx.callbackQuery.data.split('_');
      const lang = await this.utils.langs(ctx);

      const stadion = await this.prisma.stadion.findUnique({
        where: { id: Number(stadionId) },
        include: { region: true, region_items: true },
      });
      if (!stadion) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Stadion topilmadi: ${stadionId}`),
          ErrorContext.STADION,
        );
        return;
      }

      await this.userService.stadionAll_data(ctx, lang, stadion);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  ////////////////////////⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️///////////////////////////////

  @Action(/^Newbooking_(owners|firstName|stadions)_(\d+)_(\w+)$/)
  async Newbooking(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const [, type, Id, lang] = ctx.callbackQuery.data.split('_');
      const t = (key: string): string => this.i18n.translate(key, { lang });
      const chatId = String(ctx.from?.id);
      const denied = () =>
        ctx.answerCbQuery(t('admin.access_denied'), { show_alert: true });

      switch (type) {
        case 'owners': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: Number(Id) },
          });
          if (!owner || owner.chatID !== chatId) {
            await denied();
            return;
          }
          try {
            await ctx.editMessageText(t('admin.booking.enter_name'));
          } catch {
            const sent = await ctx.reply(t('admin.booking.enter_name'));
            ctx.session.admin_booking_messages ??= [];
            ctx.session.admin_booking_messages.push(sent.message_id);
          }
          ctx.session.admin_step = 'admin_bron_name';
          ctx.session.admin_bron_name = null;
          ctx.session.admin_bron_phone = null;
          break;
        }

        case 'firstName': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: Number(Id) },
          });
          if (!owner || owner.chatID !== chatId) {
            await denied();
            return;
          }
          const stadions = await this.prisma.stadion.findMany({
            where: { owner_id: owner.id },
          });
          if (!stadions.length) {
            await ctx.answerCbQuery(t('stadions.not_fount'));
            return;
          }
          const buttons: InlineKeyboardButton[][] = stadions.map((item) => [
            {
              text:
                item.name.length > 20
                  ? `🏟  ${item.name.slice(0, 20)}...`
                  : `🏟  ${item.name}`,
              callback_data: `Newbooking_stadions_${item.id}_${lang}`,
            },
          ]);
          buttons.push([
            { text: t('schedule.back'), callback_data: 'back_owner_11' },
          ]);
          await this.utils.safeEditOrReply(ctx, t('admin.select_stadium'), {
            inline_keyboard: buttons,
          });
          break;
        }

        case 'stadions': {
          const stadion = await this.prisma.stadion.findUnique({
            where: { id: Number(Id) },
            select: { owner: { select: { chatID: true } } },
          });
          if (!stadion || stadion.owner?.chatID !== chatId) {
            await denied();
            return;
          }
          ctx.session.admin_step = 'NewBooking_owners';
          await this.userService.userbookingStadion(ctx, lang, Number(Id));
          break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  @Action(/^ownerBooking_(\w+)_(\d+)_(\d+)$/)
  async ownerBooking(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = (key: string): string => this.i18n.translate(key, { lang });

      const [, type, ownerIdStr, pageStr] = ctx.callbackQuery.data.split('_');
      const ownerId = Number(ownerIdStr);
      const page = Math.max(1, Number(pageStr));
      const limit = 1;

      const where: Prisma.BookingWhereInput = {
        stadion: { owner_id: ownerId },
      };
      let orderBy: Prisma.BookingOrderByWithRelationInput[] = [
        { createdAt: 'desc' },
        { id: 'desc' },
      ];

      switch (type) {
        case 'active':
          where.status = { in: ['PAID', 'CONFIRMED'] };
          orderBy = this.BY_START;
          break;

        case 'pending':
          where.status = 'PENDING';
          orderBy = this.BY_START;
          break;

        case 'today':
        case 'tomorrow': {
          const base = this.utils.todayLocal();
          if (type === 'tomorrow') base.setUTCDate(base.getUTCDate() + 1);
          where.status = { in: ['PAID', 'CONFIRMED', 'PENDING', 'COMPLETED'] };
          where.date = base;
          orderBy = this.BY_START;
          break;
        }

        case 'cancelled':
          where.status = 'CANCELED';
          orderBy = this.BY_START;
          break;

        case 'upcoming': {
          const now = new Date();
          where.status = { in: ['PAID', 'CONFIRMED'] };
          where.startAt = {
            gte: now,
            lte: new Date(now.getTime() + 5 * 60 * 60 * 1000),
          };
          orderBy = this.BY_START;
          break;
        }

        case 'now': {
          const now = new Date();
          where.status = { in: ['PAID', 'CONFIRMED'] };
          where.startAt = { lte: now };
          where.endAt = { gte: now };
          orderBy = this.BY_START;
          break;
        }
      }

      const [bookings, total] = await Promise.all([
        this.prisma.booking.findMany({
          where,
          include: {
            stadion: { include: { region: true, region_items: true } },
            user: true,
          },
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.booking.count({ where }),
      ]);

      if (!bookings.length) {
        await ctx.answerCbQuery(t(`owner_booking.no_${type}`), {
          show_alert: true,
        });
        return;
      }

      await ctx.answerCbQuery(t('loading.loading'));

      await this.utils.clearSessionMessages(ctx);
      await this.utils.deleteClickedMessage(ctx);

      await this.sendBookings(
        ctx,
        bookings as IBooking[],
        page,
        lang,
        type,
        'ownerBooking',
      );
      await this.utils.sendPagination(
        ctx,
        page,
        total,
        limit,
        lang,
        `ownerBooking_${type}_${ownerId}`,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  @Action(/^bookingChild_(.+)$/)
  async bookingChild(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = (key: string): string => this.i18n.translate(key, { lang });

      const [, action, id, pageStr, type, callback_data] =
        ctx.callbackQuery.data.split('_');
      const bookingId = Number(id);
      const page = Math.max(1, Number(pageStr));

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: true,
          stadion: {
            include: {
              region: true,
              region_items: true,
              owner: { select: { id: true, chatID: true } },
            },
          },
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
      if (booking.stadion.owner?.chatID !== String(ctx.from?.id)) {
        await ctx.answerCbQuery(t('admin.access_denied'), { show_alert: true });
        return;
      }
      const backId =
        callback_data === 'bookingFilter'
          ? booking.stadion.id
          : booking.stadion.owner.id;
      const backBtn = {
        text: t('schedule.back'),
        callback_data: `${callback_data}_${type}_${backId}_${page}`,
      };
      const confirmKeyboard = (yesKey: string, yesAction: string) => ({
        inline_keyboard: [
          [
            {
              text: t(yesKey),
              callback_data: `bookingChild_${yesAction}_${booking.id}_${page}_${type}_${callback_data}`,
            },
            backBtn,
          ],
        ],
      });
      const backOnly = { inline_keyboard: [[backBtn]] };

      switch (action) {
        case 'detail':
          await this.ownerService.bookingDetails(
            ctx,
            booking.id,
            page,
            lang,
            type,
            callback_data,
          );
          return;

        case 'checkin':
          await this.utils.safeEditOrReply(
            ctx,
            t('owner_booking.booking.confirm_check_in'),
            confirmKeyboard('owner_booking.booking.confirm_yes', 'yesCheckin'),
          );
          return;

        case 'yesCheckin': {
          const res = await this.prisma.booking.updateMany({
            where: {
              id: booking.id,
              check_in: false,
              status: { in: ['PAID', 'CONFIRMED'] },
            },
            data: { check_in: true },
          });
          if (res.count === 0) {
            await this.utils.errorFunction(
              ctx,
              new Error(
                `Check-in mumkin emas, holat o'zgargan: bron ${booking.id}`,
              ),
              ErrorContext.SILENT,
            );
            return;
          }
          await this.utils.safeEditOrReply(
            ctx,
            t('owner_booking.booking.confirm_success'),
            backOnly,
          );
          return;
        }

        case 'cancel':
          await this.utils.safeEditOrReply(
            ctx,
            t('owner_booking.booking.confirm_cancel'),
            confirmKeyboard(
              'owner_booking.buttons.confirm_cancel',
              'yesCancel',
            ),
          );
          return;

        case 'yesCancel': {
          const res = await this.prisma.booking.updateMany({
            where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } },
            data: { status: 'CANCELED' },
          });
          if (res.count === 0) {
            await this.utils.errorFunction(
              ctx,
              new Error(
                `Bekor qilish mumkin emas, holat o'zgargan: bron ${booking.id}`,
              ),
              ErrorContext.SILENT,
            );
            return;
          }
          await this.utils.safeEditOrReply(
            ctx,
            t('owner_booking.booking.cancel_success'),
            backOnly,
          );
          return;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  @Action(/^bookingAllData_(.+)_(\d+)_(\d+)$/)
  async bookingAllData(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = (key: string): string => this.i18n.translate(key, { lang });

      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);
      const page = Math.max(1, Number(match[3]));

      if (action === 'all') {
        await this.utils.clearSessionMessages(ctx);
        await this.utils.deleteClickedMessage(ctx);
        if (ctx.session.ownerDataFilter) {
          await this.ownerService.handleDataFilter(
            ctx,
            ctx.session.ownerDataFilter,
            lang,
            ownerId,
            page,
          );
          return;
        }
        await this.utils.safeEditOrReply(
          ctx,
          t('owner_booking.by_stadion.title'),
          {
            inline_keyboard: [
              [
                {
                  text: t('owner_booking.by_stadion.date'),
                  callback_data: `bookingAllData_dateFilter_${ownerId}_${page}`,
                },
                {
                  text: t('owner_booking.by_stadion.status'),
                  callback_data: `bookingAllData_status_${ownerId}_${page}`,
                },
              ],
              [
                {
                  text: t('owner_booking.by_stadion.stadium'),
                  callback_data: `bookingAllData_stadiumFilter_${ownerId}_${page}`,
                },
              ],
              [{ text: t('schedule.back'), callback_data: 'back_owner_8' }],
            ],
          },
        );
        return;
      }

      if (action === 'status') {
        const buttons: InlineKeyboardButton[][] = this.STATUS_FILTERS.map(
          (status) => [
            {
              text: statusMap(status, this.i18n, lang),
              callback_data: `bookingAllData_STATUS.${status}_${ownerId}_${page}`,
            },
          ],
        );
        buttons.push([
          {
            text: t('schedule.back'),
            callback_data: `bookingAllData_all_${ownerId}_${page}`,
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          t('owner_booking.filter_by_status'),
          { inline_keyboard: buttons },
        );
        return;
      }

      if (action.startsWith('STATUS.')) {
        const status = action.slice('STATUS.'.length) as Booking_status;
        if (!this.STATUS_FILTERS.includes(status)) {
          throw new Error(`Noto'g'ri status: ${action}`);
        }

        const limit = 5;
        const where: Prisma.BookingWhereInput = {
          stadion: { owner_id: ownerId },
          status,
        };
        const [bookings, total] = await Promise.all([
          this.prisma.booking.findMany({
            where,
            orderBy: this.BY_START,
            include: {
              stadion: { include: { region: true, region_items: true } },
              user: true,
            },
            skip: (page - 1) * limit,
            take: limit,
          }),
          this.prisma.booking.count({ where }),
        ]);

        if (!bookings.length) {
          await ctx.answerCbQuery(t(`owner_booking.no_${status}`), {
            show_alert: true,
          });
          return;
        }
        await ctx.answerCbQuery(t('loading.loading'));

        await this.utils.clearSessionMessages(ctx);
        await this.utils.deleteClickedMessage(ctx);

        await this.sendBookings(
          ctx,
          bookings as IBooking[],
          page,
          lang,
          action,
          'bookingAllData',
        );
        await this.utils.sendPagination(
          ctx,
          page,
          total,
          limit,
          lang,
          `bookingAllData_${action}_${ownerId}`,
        );
        return;
      }

      if (action === 'dateFilter') {
        const sent = await ctx.reply(t('owner_booking.filterData'));
        ctx.session.ownerActiveBooking ??= [];
        ctx.session.ownerActiveBooking.push(sent.message_id);
        ctx.session.ownerBrons = 'dataFilter';
        this.setRegistorId(ctx, ownerId);
        return;
      }

      if (action === 'stadiumFilter') {
        const stadions = await this.prisma.stadion.findMany({
          where: { owner_id: ownerId },
          select: { id: true, name: true },
        });
        if (!stadions.length) {
          await ctx.answerCbQuery(t('stadions.not_fount'), {
            show_alert: true,
          });
          return;
        }

        const buttons: InlineKeyboardButton[][] = stadions.map((s) => [
          {
            text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
            callback_data: `bookingAllData_STADION.${s.id}_${ownerId}_${page}`,
          },
        ]);
        buttons.push([
          {
            text: t('schedule.back'),
            callback_data: `bookingAllData_all_${ownerId}_${page}`,
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          t('owner_booking.stadion.select'),
          {
            inline_keyboard: buttons,
          },
        );
        return;
      }

      if (action.startsWith('STADION.')) {
        const stadionId = Number(action.slice('STADION.'.length));
        if (!Number.isInteger(stadionId)) {
          throw new Error(`Noto'g'ri stadion ID: ${action}`);
        }

        const count = await this.prisma.booking.count({
          where: { stadion_id: stadionId, stadion: { owner_id: ownerId } },
        });
        if (count === 0) {
          await ctx.answerCbQuery(
            t('owner_booking.not_found_stadium_bookings'),
            { show_alert: true },
          );
          return;
        }

        await this.utils.clearSessionMessages(ctx);
        await this.utils.deleteClickedMessage(ctx);

        await this.utils.safeEditOrReply(
          ctx,
          t('owner_booking.booking_filter.title'),
          {
            inline_keyboard: [
              [
                {
                  text: t('owner_booking.booking_filter.seven_days'),
                  callback_data: `bookingFilter_7days_${stadionId}_${page}`,
                },
                {
                  text: t('owner_booking.booking_filter.thirty_days'),
                  callback_data: `bookingFilter_30days_${stadionId}_${page}`,
                },
              ],
              [
                {
                  text: t('owner_booking.booking_filter.active'),
                  callback_data: `bookingFilter_active_${stadionId}_${page}`,
                },
                {
                  text: t('owner_booking.booking_filter.all'),
                  callback_data: `bookingFilter_allFilter_${stadionId}_${page}`,
                },
              ],
              [
                {
                  text: t('schedule.back'),
                  callback_data: `bookingAllData_stadiumFilter_${ownerId}_${page}`,
                },
              ],
            ],
          },
        );
        return;
      }

      if (action === 'search') {
        ctx.session.ownerBrons = 'search';
        this.setRegistorId(ctx, ownerId);
        const sent = await ctx.reply(t('owner_booking.search_by_user'));
        ctx.session.ownerActiveBooking ??= [];
        ctx.session.ownerActiveBooking.push(sent.message_id);
        return;
      }

      if (action === 'searchBack') {
        await this.utils.clearSessionMessages(ctx);
        ctx.session.ownerDataFilter = null;
        this.setRegistorId(ctx, null);
        return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  @Action(/^bookingFilter_(.+)_(\d+)_(\d+)$/)
  async filter(@Ctx() ctx: MyContext) {
    try {
      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const stadionId = Number(match[2]);
      const page = Math.max(1, Number(match[3]));

      if (!['7days', '30days', 'active', 'allFilter'].includes(action)) return;

      const limit = 4;
      const lang = await this.utils.langs(ctx);
      const t = (key: string): string => this.i18n.translate(key, { lang });
      const base = this.utils.todayLocal();

      const where: Prisma.BookingWhereInput = { stadion_id: stadionId };
      const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
        { date: 'asc' },
        { startAt: 'asc' },
        { id: 'asc' },
      ];

      if (action === '7days' || action === '30days') {
        const from = new Date(base);
        from.setUTCDate(base.getUTCDate() - (action === '7days' ? 7 : 30));
        where.date = { gte: from, lt: base };
      }
      if (action === 'active') {
        where.date = { gte: base };
        where.status = { in: ['PENDING', 'CONFIRMED', 'PAID'] };
      }

      const [bookings, total] = await Promise.all([
        this.prisma.booking.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            stadion: {
              include: { region: true, region_items: true, owner: true },
            },
            user: true,
          },
        }),
        this.prisma.booking.count({ where }),
      ]);

      if (!bookings.length) {
        await ctx.answerCbQuery(t(`owner_booking.not_found_${action}`), {
          show_alert: true,
        });
        return;
      }
      await ctx.answerCbQuery(t('loading.loading'));

      await this.utils.clearSessionMessages(ctx);
      await this.utils.deleteClickedMessage(ctx);

      await this.sendBookings(
        ctx,
        bookings as IBooking[],
        page,
        lang,
        action,
        'bookingFilter',
      );
      await this.utils.sendPagination(
        ctx,
        page,
        total,
        limit,
        lang,
        `bookingFilter_${action}_${stadionId}`,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  ////////////////////⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️////////////////////////////////

  @Action(/^BookingOwner_statistica_(\w+)_(\d+)$/)
  async statistica(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);

      if (!(await this.isOwnerOf(ctx, ownerId))) {
        await this.deny(ctx, lang);
        return;
      }
      if (action !== 'stats') return;

      const completedCount = await this.prisma.booking.count({
        where: { stadion: { owner_id: ownerId }, status: 'COMPLETED' },
      });
      if (completedCount < 10) {
        await this.alertBox(ctx, t('owner_booking.stats_not_enough_data'));
        return;
      }
      await ctx.answerCbQuery(t('loading.loading')).catch(() => undefined);

      const base = this.utils.todayLocal();
      const ownerWhere: Prisma.BookingWhereInput = {
        stadion: { owner_id: ownerId },
      };

      const [
        stadionCount,
        activeBookings,
        endedBookings,
        cancelBookings,
        revenue,
        bookingsLast7Days,
        totalCount,
      ] = await Promise.all([
        this.prisma.stadion.count({ where: { owner_id: ownerId } }),
        this.prisma.booking.count({
          where: {
            ...ownerWhere,
            status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
          },
        }),
        this.prisma.booking.count({
          where: { ...ownerWhere, status: 'COMPLETED' },
        }),
        this.prisma.booking.count({
          where: {
            ...ownerWhere,
            status: { in: ['CANCELED', 'NOSHOW', 'REFUNDED'] },
          },
        }),
        this.prisma.booking.aggregate({
          where: { ...ownerWhere, status: 'COMPLETED' },
          _sum: { total_price: true },
        }),
        this.prisma.booking.findMany({
          where: {
            ...ownerWhere,
            status: { in: ['PENDING', 'CONFIRMED', 'PAID', 'COMPLETED'] },
            date: { gte: subDays(base, 6), lte: base },
          },
          select: { date: true },
        }),
        this.prisma.booking.count({ where: ownerWhere }),
      ]);

      const growth = await this.utils.growthBooking(ctx, ownerId, lang);
      const chartData = this.utils.groupByDay(bookingsLast7Days, lang);
      const chart = this.utils.progressChart(
        this.utils.fillLast7Days(chartData, lang),
        lang,
      );

      await this.utils.safeEditOrReply(
        ctx,
        t('owner_booking.owner_stats.message', {
          stadionCount,
          totalCount,
          activeBookings,
          endedBookings,
          cancelBookings,
          revenue: formatSum(revenue._sum.total_price ?? 0),
          growth,
          chart,
        }),
        {
          inline_keyboard: [
            [{ text: t('schedule.back'), callback_data: 'back_owner_8' }],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^advertisement_(\w+)_(\d+)/)
  async advertisement(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);

      if (!(await this.isOwnerOf(ctx, ownerId))) {
        await this.deny(ctx, lang);
        return;
      }
      await this.ownerService.advertisement(ctx, action, ownerId, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  @Action(/^advertisements_status_(\w+)_(\d+)_(\d+)_(\d+)/)
  async advertisementStatus(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const status = match[1];
      const ownerId = Number(match[2]);
      const statusCount = Number(match[3]);
      const page = Math.max(1, Number(match[4]));

      if (!(Object.values(AdvertisementStatus) as string[]).includes(status)) {
        throw new Error(`Noto'g'ri reklama holati: ${status}`);
      }
      if (!(await this.isOwnerOf(ctx, ownerId))) {
        await this.deny(ctx, lang);
        return;
      }
      await this.ownerService.advertisementStatus(
        ctx,
        status as AdvertisementStatus,
        ownerId,
        statusCount,
        page,
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^advertisementList_(\d+)_(\w+)/)
  async advertisementList(@Ctx() ctx: MyContext) {
    try {
      const match = ctx.match as RegExpMatchArray;
      const ownerId = Number(match[1]);
      const lang = match[2];

      if (!(await this.isOwnerOf(ctx, ownerId))) {
        await this.deny(ctx, lang);
        return;
      }
      await this.ownerService.advertisement(ctx, 'list', ownerId, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^advertisementPending_(\w+)_(\d+)_(\w+)/)
  async advertisementPending(@Ctx() ctx: MyContext) {
    try {
      const match = ctx.match as RegExpMatchArray;
      const type = match[1];
      const advertisementId = Number(match[2]);
      const lang = match[3];

      await this.ownerService.advertisement_checking(
        ctx,
        type,
        advertisementId,
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  /////////////////////////////////////// BOOKING CONFIRM /////////////////////////////////////////////////////

  @Action(/^booking_confirm_(.+)_(\d+)$/)
  async confirment(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , rawType, idStr] = ctx.callbackQuery.data.split('_');
      const bookingId = Number(idStr);

      if (rawType.startsWith('paymentChange-')) {
        const page = Number(rawType.split('-').pop()) || 1;
        await this.paymentChange(ctx, bookingId, page, lang);
        return;
      }
      const type = /^-?\d+(?:\.\d+)?-cancel$/.test(rawType)
        ? 'cancel'
        : rawType;

      switch (type) {
        case 'yes':
          await this.confirmCashBooking(ctx, bookingId, lang, 'edit');
          break;
        case 'confirm':
          await this.confirmCashBooking(ctx, bookingId, lang, 'reply');
          break;
        case 'no':
          await this.rejectCashBooking(ctx, bookingId, lang);
          break;
        case 'pending':
          await this.createPayLaterBooking(ctx, lang);
          break;
        case 'cancelChecking':
          await this.cancelChecking(ctx, bookingId, lang);
          break;
        case 'cancel':
          await this.cancelBooking(ctx, bookingId, lang);
          break;
        case 'selectPeyments':
          await this.switchToCard(ctx, bookingId, lang);
          break;
        case 'alerd':
          await this.alertBox(ctx, this.tr(lang)('booking.cancel_not_allowed'));
          break;
        case 'QR':
          await this.sendBookingQr(ctx, bookingId, lang);
          break;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.BOOKING);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  private async paymentChange(
    ctx: MyContext,
    bookingId: number,
    page: number,
    lang: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: { select: { chatID: true } } },
    });
    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return;
    }
    if (!(await this.ensurePayable(ctx, booking, lang))) return;

    await this.showProviders(
      ctx,
      lang,
      (key) => `paymentProvider_${key}_${bookingId}_${page}`,
      `back_user_payment-${page}`,
    );
  }
  private async confirmCashBooking(
    ctx: MyContext,
    bookingId: number,
    lang: string,
    mode: 'edit' | 'reply',
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { chatID: true } },
        stadion: { include: { owner: true } },
      },
    });
    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return;
    }

    const res = await this.prisma.booking.updateMany({
      where: { id: booking.id, status: 'PENDING', payment_method: 'CASH' },
      data: { status: 'CONFIRMED' },
    });
    if (res.count === 0) {
      await this.alertBox(
        ctx,
        t(
          booking.status === 'CONFIRMED'
            ? 'booking.already_confirmed'
            : 'booking.already_cancelled',
        ),
      );
      return;
    }

    // Egasiga bildirishnoma xabar yuborishdan oldin: xabar yiqilsa ham yo'qolmasin
    const settings: NotificationSettings_type = {
      ...DefaultNotificationSettings,
      ...(booking.stadion.owner
        .notificationSettings as Partial<NotificationSettings_type>),
    };
    if (settings.BOOKING_CONFIRMED) {
      this.background(
        this.notifikationService.bookingConfirmentNotifikation(
          booking.id,
          booking.stadion.owner_id,
        ),
        `BookingConfirmed #${booking.id}`,
      );
    }

    const message = t('booking.booking_confirmed', {
      stadion_name: booking.stadion.name,
      date: formatDate(booking.date, lang),
      start_time: booking.start_time,
      end_time: booking.end_time,
      payment_method: t('peyments.cash'),
      total: formatSum(booking.total_price),
    });

    if (mode === 'edit') {
      await this.utils.safeEditOrReply(
        ctx,
        message,
        {
          inline_keyboard: [
            [{ text: t('schedule.back'), callback_data: 'errorBack_1' }],
          ],
        },
        'Markdown',
      );
      return;
    }

    const sent = await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: 'back_user_5' }],
        ],
      },
    });
    ctx.session.bookingBrones ??= [];
    ctx.session.bookingBrones.push(sent.message_id);
  }
  private async rejectCashBooking(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: { select: { chatID: true } } },
    });
    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return;
    }

    await this.utils.safeEditOrReply(
      ctx,
      t('booking.booking_cancelled_notice', {
        date: formatDate(booking.date, lang),
        start_time: booking.start_time,
        end_time: booking.end_time,
      }),
      {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: 'errorBack_1' }],
        ],
      },
      'Markdown',
    );
  }
  private async createPayLaterBooking(
    ctx: MyContext,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const pending = ctx.session.pendingBooking;

    if (
      !pending ||
      !pending.date ||
      !pending.stadion_id ||
      !pending.start_time ||
      !pending.end_time ||
      !pending.startAt ||
      !pending.endAt ||
      !pending.total_price ||
      !pending.user_id ||
      !pending.payment_method
    ) {
      this.logger.warn("Sessiya ma'lumotlari to'liq emas");
      await this.utils.errorFunction(
        ctx,
        new Error("Sessiya ma'lumotlari to'liq emas (pendingBooking)"),
        ErrorContext.USER,
      );
      return;
    }

    // sessiya JSON ko'rinishida saqlansa, sanalar matn bo'lib qaytadi
    const date = new Date(pending.date);
    const startAt = new Date(pending.startAt);
    const endAt = new Date(pending.endAt);
    const stadionId = Number(pending.stadion_id);

    const { timeLeftText, totalMinutes } = this.utils.bookingTimeCalculate(
      startAt,
      lang,
    );
    if (totalMinutes < 60) {
      await this.alertBox(
        ctx,
        t('booking.payment_time_alert', { time_left: timeLeftText }),
      );
      return;
    }

    const stadion = await this.prisma.stadion.findUnique({
      where: { id: stadionId },
      select: { name: true },
    });
    if (!stadion) {
      await this.notFound(ctx, 'Stadion', stadionId, ErrorContext.STADION);
      return;
    }

    const data = {
      date,
      stadion_id: stadionId,
      user_id: pending.user_id,
      start_time: pending.start_time,
      end_time: pending.end_time,
      startAt,
      endAt,
      total_price: pending.total_price,
    };
    // Sessiyani avval tozalaymiz: tugma ikki marta bosilsa, ikkita bron yaratilmasin
    ctx.session.pendingBooking = { ...INITIAL_PENDING_BOOKING };

    const booking = await this.prisma.booking.create({
      data: {
        ...data,
        payment_method: Pay_method.CARD,
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        status_pay_later: true,
      },
    });

    await this.utils.safeEditOrReply(
      ctx,
      t('booking.confirm_with_payment', {
        stadion_name: stadion.name,
        date: formatDate(booking.date, lang),
        start_time: booking.start_time,
        end_time: booking.end_time,
        payment_method: t('peyments.card'),
        total: formatSum(booking.total_price),
        time_left: timeLeftText,
      }),
      {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: 'errorBack_1' }],
        ],
      },
      'Markdown',
    );
  }
  private async cancelChecking(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.loadCancellable(ctx, bookingId, lang);
    if (!booking) return;

    await this.utils.safeEditOrReply(
      ctx,
      t('booking.cancel_confirm', {
        stadion: booking.stadion.name,
        date: formatDate(booking.date, lang),
        start_time: booking.start_time,
        end_time: booking.end_time,
      }),
      {
        inline_keyboard: [
          [
            {
              text: t('booking.cancel_yes'),
              callback_data: `booking_confirm_0-cancel_${booking.id}`,
            },
          ],
          [{ text: t('schedule.back'), callback_data: 'back_user_5' }],
        ],
      },
    );
  }
  private async cancelBooking(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.loadCancellable(ctx, bookingId, lang);
    if (!booking) return;

    const wasPaid = booking.status === 'PAID';

    if (wasPaid) {
      const transaction = await this.prisma.tranzaktion.findFirst({
        where: { booking_id: booking.id, status: TransactionStatus.SUCCESS },
        orderBy: { createdAt: 'desc' },
      });
      if (
        !transaction ||
        !transaction.provider ||
        !transaction.provider_payment_id
      ) {
        // g'ayrioddiy holat: BOOKING kontekstida alert ketadi
        throw new Error(
          `Bron #${booking.id} PAID, lekin yaroqli SUCCESS tranzaksiya topilmadi`,
        );
      }

      // Bron holati va tranzaksiya birga o'zgaradi: yarim holat qolmaydi
      const locked = await this.prisma.$transaction(async (tx) => {
        const res = await tx.booking.updateMany({
          where: { id: booking.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        });
        if (res.count === 0) return false;
        await tx.tranzaktion.update({
          where: { id: transaction.id },
          data: { refund_status: RefundStatus.PENDING },
        });
        return true;
      });
      if (!locked) return;

      try {
        await this.utils.refountadministratorSent({
          bookingId: booking.id,
          stadionName: booking.stadion.name,
          date: booking.date,
          startTime: booking.start_time,
          endTime: booking.end_time,
          amount: transaction.amount ?? Number(booking.total_price),
          transactionId: transaction.id,
          orderId: transaction.provider_order_id,
          paymentId: transaction.provider_payment_id,
          paidAt: transaction.paid_at,
          userName: booking.user?.full_name,
          username: booking.user?.username,
          userChatId: booking.user?.chatID,
          phone: booking.user?.phone,
        });
      } catch (error) {
        await this.alert.notify(
          `Qaytarish xabari yuborilmadi · Bron #${booking.id}`,
          [
            error instanceof Error ? error.message : String(error),
            `Payment: ${transaction.provider_payment_id}`,
            `Order: ${transaction.provider_order_id ?? '-'}`,
            `Tranzaksiya: ${transaction.id}`,
          ].join('\n'),
          AlertType.REFUND,
        );
      }
    } else {
      const updated = await this.prisma.booking.updateMany({
        where: { id: booking.id, status: booking.status },
        data: { status: 'CANCELED' },
      });
      if (updated.count === 0) return;
    }

    if (booking.status === 'CONFIRMED' || booking.status === 'PAID') {
      const settings: NotificationSettings_type = {
        ...DefaultNotificationSettings,
        ...(booking.stadion.owner
          .notificationSettings as Partial<NotificationSettings_type>),
      };
      if (settings.CANCELLED_BOOKINGS) {
        this.background(
          this.notifikationService.bookingCanceledNotifikation(
            booking.id,
            booking.stadion.owner.id,
          ),
          `BookingCanceled #${booking.id}`,
        );
      }
    }

    const sent = await ctx.reply(
      t(
        wasPaid
          ? 'booking.booking_cancelled_refunded'
          : 'booking.booking_cancelled',
        {
          date: formatDate(booking.date, lang),
          start_time: booking.start_time,
          end_time: booking.end_time,
          refundable: formatSum(booking.total_price),
        },
      ),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('schedule.back'), callback_data: 'back_user_5' }],
          ],
        },
      },
    );
    ctx.session.bookingBrones ??= [];
    ctx.session.bookingBrones.push(sent.message_id);
  }
  private async switchToCard(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { chatID: true } },
        stadion: {
          include: {
            owner: { select: { payout_status: true, paylov_partner_id: true } },
          },
        },
      },
    });
    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return;
    }
    if (!canPayByCard(booking.stadion.payments_type, booking.stadion.owner)) {
      await this.alertBox(ctx, t('peyments.change_card_block'));
      return;
    }
    if (this.utils.timeUntil(booking.startAt).totalMinutes < 0) {
      await this.alertBox(ctx, t('booking.play_game'));
      return;
    }

    const res = await this.prisma.booking.updateMany({
      where: {
        id: booking.id,
        payment_method: 'CASH',
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      data: {
        payment_method: 'CARD',
        status: 'PENDING',
        status_pay_later: true,
      },
    });
    if (res.count === 0) {
      await this.alertBox(ctx, t('booking.already_cancelled'));
      return;
    }

    const sent = await ctx.reply(t('booking.payments'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: 'back_user_5' }],
        ],
      },
    });
    ctx.session.bookingBrones ??= [];
    ctx.session.bookingBrones.push(sent.message_id);
  }
  private async sendBookingQr(
    ctx: MyContext,
    bookingId: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, user: { select: { chatID: true } } },
    });
    if (!booking) {
      await this.notFound(ctx, 'Bron', bookingId);
      return;
    }
    if (!this.isBookingOwner(booking, ctx)) {
      await this.deny(ctx, lang);
      return;
    }
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PAID') {
      await this.alertBox(ctx, t('booking.already_cancelled'));
      return;
    }

    const { qr } = await this.qrservice.generateQr(bookingId);
    const base64 = qr.split(',')[1];
    if (!base64) throw new Error(`QR noto'g'ri formatda: bron ${bookingId}`);

    const sent = await ctx.replyWithPhoto(
      { source: Buffer.from(base64, 'base64') },
      {
        caption: t('booking.qr_caption'),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('schedule.back'), callback_data: 'back_user_5' }],
          ],
        },
      },
    );
    ctx.session.bookingBrones ??= [];
    ctx.session.bookingBrones.push(sent.message_id);
  }

  @Action(/^paymentProvider_(\w+)_(\d+)_(\d+)$/)
  async payment(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const [, providerKey, bookingIdStr, page] =
        ctx.callbackQuery.data.split('_');
      const bookingId = Number(bookingIdStr);

      if (!(Object.values(GatewayMethod) as string[]).includes(providerKey)) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Noto'g'ri to'lov provayderi: ${providerKey}`),
          ErrorContext.USER,
        );
        return;
      }
      const gatewayMethod = providerKey as GatewayMethod;

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: true,
          stadion: {
            include: {
              owner: {
                select: { payout_status: true, paylov_partner_id: true },
              },
            },
          },
        },
      });
      if (!booking) {
        await this.notFound(ctx, 'Bron', bookingId);
        return;
      }
      if (!this.isBookingOwner(booking, ctx)) {
        await this.deny(ctx, lang);
        return;
      }
      if (!(await this.ensurePayable(ctx, booking, lang))) return;

      if (!canPayByCard(booking.stadion.payments_type, booking.stadion.owner)) {
        await this.alertBox(ctx, t('booking.payment.no_active_card'));
        return;
      }

      const amount = Number(booking.total_price);

      const tranzaktion = await this.prisma.tranzaktion.create({
        data: {
          user_id: booking.user_id!,
          booking_id: booking.id,
          amount,
          provider: PaymentProvider.PAYLOV,
          gateway_method: gatewayMethod,
          status: TransactionStatus.PENDING,
        },
      });

      let checkoutUrl: string;
      try {
        const checkout = await this.paylov.createCheckout({
          externalId: `BK:${tranzaktion.id}`,
          amountSom: amount,
          method: gatewayMethod,
          returnUrl: `https://t.me/${process.env.BOT_USERNAME}?start=paymentBooking_success_${tranzaktion.id}`,
        });
        await this.prisma.tranzaktion.update({
          where: { id: tranzaktion.id },
          data: { provider_order_id: String(checkout.order_id) },
        });
        checkoutUrl = checkout.checkout_url;
      } catch (err) {
        await this.prisma.tranzaktion.update({
          where: { id: tranzaktion.id },
          data: { status: TransactionStatus.FAILED },
        });
        throw new Error(
          `Checkout yaratilmadi (bron #${booking.id}, tranzaksiya ${tranzaktion.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      await this.utils.safeEditOrReply(ctx, t('booking.payment.link_ready'), {
        inline_keyboard: [
          [{ text: t('booking.payment.pay_button'), url: checkoutUrl }],
          [
            {
              text: t('schedule.back'),
              callback_data: `booking_confirm_paymentChange-${page}_${booking.id}`,
            },
          ],
        ],
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^back_(owner|user)_(.+)$/)
  async brckAll(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, role, data] = ctx.callbackQuery.data.split('_');

      if (role === 'owner') {
        await this.ownerService.ownerBackSwitch(ctx, data, lang);
      } else if (role === 'user') {
        await this.userService.userBackSwitch(ctx, data, lang);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.COMMON);
    }
  }

  @Action(
    /^booking_peyments_(cash|card)_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d{4}-\d{1,2}-\d{1,2})_(\d+)_(\d+)_(\d+)_(\w+)/,
  )
  async bookingPeyments(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [
        ,
        ,
        type,
        start_time,
        end_time,
        days,
        stadionId,
        price,
        noshowCount,
        schedule_type,
      ] = ctx.callbackQuery.data.split('_');

      const [year, month, day] = days.split('-');
      await this.userService.bookingPayments(
        ctx,
        type,
        this.parseCalendarDate(year, month, day),
        start_time,
        end_time,
        Number(stadionId),
        Number(price),
        Number(noshowCount),
        this.parseScheduleType(schedule_type),
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.BOOKING);
    }
  }

  @Action(/^booking_back_(\d+)$/)
  async bookingBack(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , stadionId] = ctx.callbackQuery.data.split('_');
      await this.userService.userbookingStadion(ctx, lang, Number(stadionId));
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_specialBack_(\d+)_(\d+)$/)
  async bookingSpecilaBack(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , specialId, stadionId] = ctx.callbackQuery.data.split('_');
      await this.userService.special(
        ctx,
        lang,
        Number(specialId),
        Number(stadionId),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_scheduleBack_(\d+)_(\d+)_(\d+)_(\d{4})_(\d+)$/)
  async bookingScheduleBack(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , scheduleId, day, monthNumber, years, stadionId] =
        ctx.callbackQuery.data.split('_');
      await this.userService.bookingSchedule_start(
        ctx,
        years,
        day,
        monthNumber,
        Number(scheduleId),
        Number(stadionId),
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_timeStart_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})_(\d+)$/)
  async bookingTimeStart(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , start_time, scheduleId, day, monthNumber, years, stadionId] =
        ctx.callbackQuery.data.split('_');
      await this.userService.bookingSchedule_end(
        ctx,
        years,
        start_time,
        Number(scheduleId),
        Number(day),
        Number(monthNumber),
        Number(stadionId),
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(
    /^booking_timeEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})_(\w+)/,
  )
  async bookingTimeEnd(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [
        ,
        ,
        start_time,
        end_time,
        day,
        monthNumber,
        stadionId,
        years,
        type,
      ] = ctx.callbackQuery.data.split('_');

      await this.userService.bookingScheduleFinish(
        ctx,
        start_time,
        end_time,
        this.parseCalendarDate(years, monthNumber, day),
        lang,
        Number(stadionId),
        this.parseScheduleType(type),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_specials_(\d+)_(\d+)$/)
  async bookingBookingSpecile(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , specileId, stadionId] = ctx.callbackQuery.data.split('_');
      await this.userService.special(
        ctx,
        lang,
        Number(specileId),
        Number(stadionId),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_special_(\d{2}:\d{2})_(\d+)_(\d+)$/)
  async userBookingSpecial(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , start_time, specialId, stadionId] =
        ctx.callbackQuery.data.split('_');
      await this.userService.userbookingSpecialEnd(
        ctx,
        lang,
        Number(specialId),
        Number(stadionId),
        start_time,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(
    /^booking_specialEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d{4})_(\d+)_(\d+)_(\w+)/,
  )
  async userBookingSpecialEnd(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , start_time, end_time, id, year, month, day, type] =
        ctx.callbackQuery.data.split('_');

      await this.userService.bookingScheduleFinish(
        ctx,
        start_time,
        end_time,
        this.parseCalendarDate(year, month, day),
        lang,
        Number(id),
        this.parseScheduleType(type),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_schedule_(\d{4})_(\d+)_(\d+)_(\d+)_(\d+)$/)
  async userBookingSchedule(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , year, day, monthNumber, scheduleId, stadionId] =
        ctx.callbackQuery.data.split('_');
      await this.userService.bookingSchedule_start(
        ctx,
        year,
        day,
        monthNumber,
        Number(scheduleId),
        Number(stadionId),
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^bookingPaymentProviders_(uz|ru|en)$/)
  async bookingPaymentProviders(@Ctx() ctx: MyContext) {
    try {
      const lang = (ctx.match as RegExpMatchArray)[1];
      await this.showProviders(
        ctx,
        lang,
        (key) => `SelectPaymentProviders_${key}_${lang}`,
        'back_user_Booking',
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^bookingPaymentProviderStep2_(uz|ru|en)$/)
  async bookingPaymentProviderStep2(@Ctx() ctx: MyContext) {
    try {
      const lang = (ctx.match as RegExpMatchArray)[1];
      await this.showProviders(
        ctx,
        lang,
        (key) => `SelectPaymentProviders_${key}_${lang}`,
        'back_user_Payments',
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^SelectPaymentProviders_(\w+)_(\w+)$/)
  async SelectPaymentProviders(@Ctx() ctx: MyContext) {
    try {
      const match = ctx.match as RegExpMatchArray;
      const providerKey = match[1];
      const lang = match[2];

      if (!(Object.values(GatewayMethod) as string[]).includes(providerKey)) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Noto'g'ri to'lov provayderi: ${providerKey}`),
          ErrorContext.USER,
        );
        return;
      }
      await this.userService.BookingPaymentProviders(
        ctx,
        providerKey as GatewayMethod,
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PAYMENT);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^ignore/)
  async ignore(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
  }

  @Action(/^booking_region_page_(.+)_(\d+)$/)
  async stadionPage(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const [, , , anonimus, pageStr] = ctx.callbackQuery.data.split('_');
      const page = Math.max(1, Number(pageStr));

      switch (anonimus) {
        case 'favorit':
          await this.clearMessages(ctx, 'stadionFavoritMessages');
          await ctx.deleteMessage().catch(() => undefined);
          await this.userService.userSwitch(ctx, 'stadionFavorite', lang, page);
          break;

        case 'stadionBronHistory':
          await this.userService.userSwitch(ctx, anonimus, lang, page);
          break;

        case 'stadionBron':
          await this.clearMessages(ctx, 'bookingBrones');
          await this.userService.userSwitch(ctx, anonimus, lang, page);
          break;

        case 'cheapPrice':
          await this.clearMessages(ctx, 'stadionMessages');
          await this.userService.userSwitch(ctx, anonimus, lang, page);
          break;

        default: {
          const regionItemId = Number(anonimus);
          if (!Number.isInteger(regionItemId)) {
            throw new Error(`Noto'g'ri sahifa turi: ${anonimus}`);
          }
          await this.clearMessages(ctx, 'stadionMessages');
          await this.userService.userbookingRegionItems(
            ctx,
            lang,
            regionItemId,
            page,
          );
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^booking_(region|regionItem|stadion|save)_(\d+)$/)
  async userBooking(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const type = match[1];
      const id = Number(match[2]);

      if (type !== 'save') await ctx.answerCbQuery().catch(() => undefined);

      if (type === 'region') {
        await this.userService.userbookingRegion(ctx, lang, id);
      } else if (type === 'regionItem') {
        await this.userService.userbookingRegionItems(ctx, lang, id);
      } else if (type === 'stadion') {
        await this.userService.userbookingStadion(ctx, lang, id);
      } else {
        await this.userService.userSaveFnc(ctx, lang, id);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^user_(.+)$/)
  async userSetting(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const data = ctx.callbackQuery.data.split('_')[1];

      if (data === 'offday') {
        await this.alertBox(ctx, this.tr(lang)('booking.stadion.alert'));
      }
      await this.userService.userSwitch(ctx, data, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^working_date_(.+)$/)
  async working_date(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const date = ctx.callbackQuery.data.split('_')[2];
      const data = new Date(date);
      if (Number.isNaN(data.getTime())) {
        throw new Error(`Noto'g'ri sana: ${date}`);
      }

      const today = this.utils.todayLocal();
      const isToday = data.getTime() === today.getTime();
      const noSlots = () =>
        ctx.answerCbQuery(t('booking.not_available_stadiums'));

      if (data.getTime() < today.getTime()) {
        await noSlots();
        return;
      }

      const available = await this.prisma.stadion.findFirst({
        where: {
          working_status: true,
          admin_status: AdminStatus.APPROVED,
          owner: { status: Admin_S.ACTIVE },
          OR: [
            {
              stadionOffDays: { none: { date: data } },
              stadionChedules: { some: {} },
            },
            {
              parent: {
                stadionChedules: { some: {} },
                stadionOffDays: { none: { date: data } },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!available) {
        await noSlots();
        return;
      }

      let startTime = '08:00';
      if (isToday) {
        const { time, isNextDay } = this.utils.currentLocalTimeRoundedUpInfo();
        if (
          isNextDay ||
          this.utils.toMinutes(time) >= this.utils.toMinutes('23:00')
        ) {
          await noSlots();
          return;
        }
        startTime = time;
      }

      await ctx.answerCbQuery().catch(() => undefined);

      const slots = await this.utils.generateSlots(startTime, '23:00');
      const perRow = 3;
      const buttons: InlineKeyboardButton[][] = [];
      for (let i = 0; i < slots.length; i += perRow) {
        buttons.push(
          slots.slice(i, i + perRow).map((slot) => ({
            text: slot.start,
            callback_data: `search_working_start_${date}_${slot.start}`,
          })),
        );
      }
      buttons.push([
        { text: t('schedule.back'), callback_data: 'user_working' },
      ]);

      await this.utils.safeEditOrReply(ctx, t('booking.stadion.selectTime'), {
        inline_keyboard: buttons,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^search_working_(start|end)_(.+)_(.+)$/)
  async search_working(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const [, , type, date, time] = ctx.callbackQuery.data.split('_');

      if (type === 'start') {
        if (!/^\d{2}:\d{2}$/.test(time)) {
          throw new Error(`Noto'g'ri vaqt: ${time}`);
        }
        await ctx.answerCbQuery().catch(() => undefined);

        const slots = await this.utils.generateSlots(time, '23:00');
        const perRow = 3;
        const buttons: InlineKeyboardButton[][] = [];
        for (let i = 0; i < slots.length; i += perRow) {
          buttons.push(
            slots.slice(i, i + perRow).map((slot) => ({
              text: slot.end,
              callback_data: `search_working_end_${date}_${time}-${slot.end}`,
            })),
          );
        }
        buttons.push([
          { text: t('schedule.back'), callback_data: `working_date_${date}` },
        ]);

        await this.utils.safeEditOrReply(
          ctx,
          t('booking.stadion.selectEndTime'),
          { inline_keyboard: buttons },
        );
        return;
      }

      const [start_time, end_time] = time.split('-');
      await this.userService.searchWorkingStadions(
        ctx,
        date,
        start_time,
        end_time,
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^search_stadionsPage_(.+)$/)
  async search_stadionsPage(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const [, , date, start_time, end_time, lang, page] =
        ctx.callbackQuery.data.split('_');

      await this.userService.searchWorkingStadions(
        ctx,
        date,
        start_time,
        end_time,
        lang,
        Math.max(1, Number(page)),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  @Action(/^toggleNotification\|(\w+)\|(\d+)$/)
  async toggleNotification(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const type = match[1];
      const ownerId = Number(match[2]);

      if (!(type in DefaultNotificationSettings)) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Noto'g'ri bildirishnoma turi: ${type}`),
          ErrorContext.USER,
        );
        return;
      }
      const notificationType = type as keyof NotificationSettings_type;

      const owner = await this.prisma.owners.findUnique({
        where: { id: ownerId },
      });
      if (!owner) {
        await this.notFound(ctx, 'Owner', ownerId, ErrorContext.OWNER);
        return;
      }
      if (owner.chatID !== String(ctx.from?.id)) {
        await this.deny(ctx, lang);
        return;
      }

      const settings: NotificationSettings_type = {
        ...DefaultNotificationSettings,
        ...(owner.notificationSettings as Partial<NotificationSettings_type>),
      };
      settings[notificationType] = !settings[notificationType];

      await this.prisma.owners.update({
        where: { id: owner.id },
        data: { notificationSettings: settings },
      });

      await this.alertBox(
        ctx,
        this.tr(lang)(
          settings[notificationType]
            ? 'notification.enabled'
            : 'notification.disabled',
          { label: NotificationNames[notificationType][lang] },
        ),
      );
      await this.ownerService.notificationSettings(ctx, owner.id, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^premiumProvider\|(.+)\|(.+)\|(\d+)$/)
  async premiumProvider(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const [, providerKey, premiumPlan, idStr] =
        ctx.callbackQuery.data.split('|');
      const plan = premiumPlan as PremiumPlan;

      const durationMap: Record<PremiumPlan, number> = {
        WEEK_1: 7,
        MONTH_1: 30,
        MONTH_3: 90,
        MONTH_6: 180,
        YEAR_1: 365,
      };

      if (!PREMIUM_PLANS[plan]) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Noto'g'ri premium reja: ${premiumPlan}`),
          ErrorContext.USER,
        );
        return;
      }
      const providerItem = PAYMENT_PROVIDERS.find((p) => p.key === providerKey);
      if (!providerItem) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Noto'g'ri to'lov provayderi: ${providerKey}`),
          ErrorContext.USER,
        );
        return;
      }
      const gatewayMethod = providerItem.key;

      const owner = await this.prisma.owners.findUnique({
        where: { id: Number(idStr) },
        select: { full_name: true, id: true, chatID: true },
      });
      if (!owner) {
        await this.notFound(ctx, 'Owner', idStr, ErrorContext.PREMIUM);
        return;
      }
      if (String(ctx.from?.id) !== String(owner.chatID)) {
        await this.deny(ctx, lang);
        return;
      }

      const amount = PREMIUM_PLANS[plan].price;
      const premiumTranzaction = await this.prisma.premiumTransaction.create({
        data: {
          owner_id: owner.id,
          amount,
          plan,
          duration: durationMap[plan],
          provider: PaymentProvider.PAYLOV,
          gateway_method: gatewayMethod,
        },
      });

      let paymentUrl: string;
      try {
        const checkout = await this.paylov.createCheckout({
          externalId: `PR:${premiumTranzaction.id}`,
          amountSom: amount,
          method: gatewayMethod.toLowerCase(),
          returnUrl: `https://t.me/${process.env.BOT_USERNAME}?start=paymentPremium_success_${premiumTranzaction.id}`,
        });
        await this.prisma.premiumTransaction.update({
          where: { id: premiumTranzaction.id },
          data: { provider_order_id: String(checkout.order_id) },
        });
        paymentUrl = checkout.checkout_url;
      } catch (e) {
        await this.prisma.premiumTransaction.update({
          where: { id: premiumTranzaction.id },
          data: { status: 'FAILED' },
        });
        throw new Error(
          `Premium checkout yaratilmadi (owner #${owner.id}, tranzaksiya ${premiumTranzaction.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      await this.utils.safeEditOrReply(
        ctx,
        t('premium.payment.pay_now', { amount: formatSum(amount) }),
        {
          inline_keyboard: [
            [{ text: t('premium.payment.button'), url: paymentUrl }],
            [
              {
                text: t('schedule.back'),
                callback_data: JSON.stringify({
                  type: 'premium_provider',
                  plan: premiumPlan,
                  id: owner.id,
                }),
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PREMIUM);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^owner_([\w-]+)_(\d+)$/)
  async onOwner(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const match = ctx.match as RegExpMatchArray;
      const type = match[1];
      const stadionId = Number(match[2]);

      if (!(await this.ownsStadion(ctx, stadionId))) {
        await this.deny(ctx, lang);
        return;
      }

      if (type === 'stadionSplit') {
        const option = (index: number, count: number) => ({
          text: t(`stadions.stadionSplit.options.${index}`),
          callback_data: `owner_Split-${count}_${stadionId}`,
        });
        await this.utils.safeEditOrReply(
          ctx,
          t('stadions.stadionSplit.title'),
          {
            inline_keyboard: [
              [option(0, 2), option(1, 4)],
              [option(2, 6), option(3, 8)],
              [
                {
                  text: t('schedule.back'),
                  callback_data: JSON.stringify({
                    type: 'miniStadionlar',
                    id: stadionId,
                  }),
                },
              ],
            ],
          },
        );
        return;
      }

      if (type === 'miniStadion') {
        await this.ownerService.miniStadion(ctx, stadionId, lang);
        return;
      }

      if (type.startsWith('Split-')) {
        const count = Number(type.split('-')[1]);
        if (![2, 4, 6, 8].includes(count)) {
          throw new Error(`Noto'g'ri bo'linish soni: ${type}`);
        }
        await this.ownerService.stadionSplit(ctx, count, stadionId, lang);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  @Action(/^SelectOwnerPremium_(\w+)_(\d+)/)
  async ownerPremium(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const ownerId = Number((ctx.match as RegExpMatchArray)[2]);

      const owner = await this.prisma.owners.findUnique({
        where: { id: ownerId },
        select: { id: true, chatID: true },
      });
      if (!owner) {
        await this.notFound(ctx, 'Owner', ownerId, ErrorContext.PREMIUM);
        return;
      }
      if (owner.chatID !== String(ctx.from?.id)) {
        await this.deny(ctx, lang);
        return;
      }

      const plans = ['MONTH_1', 'MONTH_3', 'YEAR_1'] as const;
      const planButtons: InlineKeyboardButton[][] = plans.map((plan) => [
        {
          text: `${PLAN_LABELS[lang][plan]} — ${Premium_price[plan]}`,
          callback_data: JSON.stringify({
            type: 'premium_buy',
            plan,
            id: ownerId,
          }),
        },
      ]);

      await this.utils.safeEditOrReply(
        ctx,
        t('premium.premium_extend.text', {
          month1_label: PLAN_LABELS[lang]['MONTH_1'],
          month3_label: PLAN_LABELS[lang]['MONTH_3'],
          year1_label: PLAN_LABELS[lang]['YEAR_1'],
          month1_price: this.utils.formatPrice('MONTH_1', lang),
          month3_price: this.utils.formatPrice('MONTH_3', lang),
          year1_price: this.utils.formatPrice('YEAR_1', lang),
        }),
        {
          inline_keyboard: [
            ...planButtons,
            [
              {
                text: t('schedule.back'),
                callback_data: `backOwner_premium_${ownerId}`,
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PREMIUM);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^backOwner_premium_(\d+)$/)
  async backOwner(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const ownerId = Number((ctx.match as RegExpMatchArray)[1]);

      if (!(await this.isOwnerOf(ctx, ownerId))) {
        await this.deny(ctx, lang);
        return;
      }
      await this.ownerService.premium(ctx, ownerId, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.PREMIUM);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^stadion_type_(.+)$/)
  async stadion_type(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const type = ctx.callbackQuery.data.split('_')[2];

      if (ctx.session.stadion_step === 'stadion_type') {
        await ctx.answerCbQuery().catch(() => undefined);
        ctx.session.stadion_step = null;
        await this.botService.createStadion(ctx, type as EStadion_type);
        return;
      }

      if (!type?.startsWith('workingStatus-')) return;
      const id = Number(type.split('-')[1]);

      const stadion = await this.prisma.stadion.findUnique({
        where: { id },
        include: {
          parent: true,
          children: true,
          owner: {
            select: {
              payout_status: true,
              paylov_partner_id: true,
              chatID: true,
            },
          },
        },
      });
      if (!stadion) {
        await this.notFound(ctx, 'Stadion', id, ErrorContext.STADION);
        return;
      }
      if (stadion.owner.chatID !== String(ctx.from?.id)) {
        await this.deny(ctx, lang);
        return;
      }

      const stadionIds = getRelatedStadionIds(stadion);
      const activeBookings = await this.prisma.booking.count({
        where: {
          stadion_id: { in: stadionIds },
          status: { in: ['CONFIRMED', 'PENDING', 'PAID'] },
        },
      });

      if (stadion.working_status && activeBookings > 0) {
        await this.alertBox(ctx, t('stadions.workingStatus.alert'));
        return;
      }

      if (stadion.working_status) {
        await this.prisma.stadion.updateMany({
          where: { id: { in: stadionIds } },
          data: { working_status: false },
        });
        await this.alertBox(ctx, t('stadions.workingStatus.off'));
        return;
      }

      if (
        stadion.payments_type === 'CARD' &&
        !canOwnerAcceptCard(stadion.owner)
      ) {
        await this.alertBox(ctx, t('stadions.workingStatus.ownerCard'));
        return;
      }

      await this.prisma.stadion.updateMany({
        where: { id: { in: stadionIds } },
        data: { working_status: true },
      });
      await this.alertBox(ctx, t('stadions.workingStatus.on'));
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^payments_(CARD|CASH|GIBRID)$/)
  async onPayments(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const payment = (ctx.match as RegExpMatchArray)[1] as Payments;
      const sessionStadion = ctx.session.stadion;

      if (
        ctx.session.stadion_step === 'stadion' &&
        sessionStadion?.payments === 'payments'
      ) {
        sessionStadion.payments_type = payment;
        sessionStadion.image = 'image';
        sessionStadion.step = 9;
        await ctx.reply(t('stadions.image'), {
          reply_markup: {
            keyboard: [[{ text: t('stadions.back') }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        sessionStadion.payments = null;
        return;
      }

      const stadionId = Number(sessionStadion?.id);
      if (
        sessionStadion?.payments !== 'PAYMENTS' ||
        !Number.isInteger(stadionId)
      ) {
        await ctx.reply(t('error.sesion'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t('schedule.back'), callback_data: 'errorBack_1' }],
            ],
          },
        });
        return;
      }

      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: {
            select: {
              payout_status: true,
              paylov_partner_id: true,
              chatID: true,
            },
          },
          children: true,
        },
      });
      if (!stadion) {
        await this.notFound(ctx, 'Stadion', stadionId, ErrorContext.STADION);
        return;
      }
      if (stadion.owner.chatID !== String(ctx.from?.id)) {
        await this.deny(ctx, lang);
        return;
      }

      if (stadion.payments_type === payment) {
        await this.alertBox(ctx, t('stadions.payments.alert'));
        return;
      }

      const relatedStadionIds = getRelatedStadionIds(stadion);
      const activeWhere: Prisma.BookingWhereInput = {
        stadion_id: { in: relatedStadionIds },
        status: { in: ['CONFIRMED', 'PENDING', 'PAID'] },
      };
      const [bookingsCount, cardBooking] = await Promise.all([
        this.prisma.booking.count({ where: activeWhere }),
        this.prisma.booking.findFirst({
          where: { ...activeWhere, payment_method: 'CARD' },
          select: { id: true },
        }),
      ]);

      const ownerCanCard = canOwnerAcceptCard(stadion.owner);
      const block = this.paymentSwitchBlock(
        stadion.payments_type,
        payment,
        ownerCanCard,
        bookingsCount,
        Boolean(cardBooking),
      );
      if (block) {
        await this.alertBox(ctx, t(`stadions.payments.${block}`));
        return;
      }

      const workingStatus = !(
        payment === 'CARD' &&
        !ownerCanCard &&
        bookingsCount === 0
      );

      await this.prisma.stadion.updateMany({
        where: { id: { in: relatedStadionIds } },
        data: { payments_type: payment, working_status: workingStatus },
      });

      sessionStadion.payments = null;
      sessionStadion.id = null;

      await this.ownerService.stadionPayments(ctx, stadion.id, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
  /////////////////////////////////////  ADMIN PANELi  /////////////////////////////////////

  @Action(/^admins_([a-zA-Z]+)$/)
  async stadiumMenu(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (lang, parts) => this.adminPaneli.admins_stadiums(ctx, parts[1], lang),
      { context: ErrorContext.STADION },
    );
  }
  @Action(/^stadium_([a-zA-Z]+)_(\d+)_(\d+)$/)
  async status(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.stadium_status(
          ctx,
          parts[1],
          Number(parts[2]),
          parts[3],
        ),
      { context: ErrorContext.STADION },
    );
  }
  @Action(/^stadiumChecking_(approved|rejected)_(\d+)_(\d+)$/)
  async stadiumChecking(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.status_Checking(
          ctx,
          parts[1],
          Number(parts[2]),
          Number(parts[3]),
        ),
      { context: ErrorContext.STADION },
    );
  }
  @Action(/^stadiumConfirm_(approved|rejected)_(\d+)$/)
  async stadiumConfirm(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.stadiumConfirm(ctx, parts[1], Number(parts[2])),
      { context: ErrorContext.STADION },
    );
  }
  @Action(/^AdminPanel_Owner_([a-zA-Z]+)(?:_(activate|block))?_(\d+)_(\d+)$/)
  async AdminPaner_Owner(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      async (lang, parts) => {
        const action =
          parts.length === 6 ? (parts[3] as 'activate' | 'block') : undefined;
          

        if (action && !this.isSuperAdmin(ctx)) {
          await this.alertBox(ctx, this.tr(lang)('admin.super_admin_only'));
          this.reportSecurity(ctx, `super admin huquqisiz ${action} urinishi`);
          return;
        }
        if (action) this.auditLog(ctx, 'super');

        return this.adminPaneli.AdminPanel_owner(
          ctx,
          parts[2],
          Number(parts[parts.length - 2]),
          Number(parts[parts.length - 1]),
          action,
        );
      },
      { context: ErrorContext.OWNER },
    );
  }

  @Action(/^AdminOwner_([a-zA-Z]+)_(\d+)_(\d+)_(\d+)$/)
  async AdminOwner(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.AdminOwner_select(
          ctx,
          parts[1],
          Number(parts[2]),
          Number(parts[3]),
          Number(parts[4]),
        ),
      { context: ErrorContext.OWNER },
    );
  }
  @Action(/^ownerPremiumReason_([a-zA-Z]+)_(\d+)_(\d+)$/)
  async ownerPremiumReason(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.ownerPremiumReason(
          ctx,
          parts[1],
          Number(parts[2]),
          Number(parts[3]),
        ),
      { level: 'super', context: ErrorContext.PREMIUM },
    );
  }

  @Action(/^ownerPremiumGift_(\d+)_(\d+)_(\d+)_([a-zA-Z]+)$/)
  async ownerPremiumGift(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.ownerPremiumGift(
          ctx,
          Number(parts[1]),
          Number(parts[2]),
          Number(parts[3]),
          this.parsePremiumReason(parts[4]),
        ),
      { level: 'super', context: ErrorContext.PREMIUM },
    );
  }

  @Action(/^AdminOwnerConfirmGift_(\d+)_(\d+)_(\d+)_([a-zA-Z]+)$/)
  async AdminOwnerConfirmGift(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.AdminOwnerConfirmGift(
          ctx,
          Number(parts[1]),
          Number(parts[2]),
          Number(parts[3]),
          this.parsePremiumReason(parts[4]),
        ),
      { level: 'super', context: ErrorContext.PREMIUM },
    );
  }
  @Action(/^AdminOwnerStadium_detail_(\d+)_(\d+)_(\d+)_(\d+)$/)
  async AdminOwner_stadium_detail(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(
      ctx,
      (_lang, parts) =>
        this.adminPaneli.admin_stadions_details(
          ctx,
          Number(parts[2]),
          Number(parts[3]),
          parts[4],
          parts[5],
        ),
      { context: ErrorContext.STADION },
    );
  }
  @Action(/^admin_back_(\d+)$/)
  async adminBack(@Ctx() ctx: MyContext): Promise<void> {
    await this.runAdmin(ctx, async (lang, parts) => {
      switch (parts[2]) {
        case '1':
          await this.adminPaneli.admin_paneli(ctx, lang);
          break;
        case '2': {
          if (ctx.session.admin_messageId) {
            await ctx
              .deleteMessage(ctx.session.admin_messageId)
              .catch(() => undefined);
          }
          ctx.session.admin_messageId = null;
          ctx.session.admin_step = null;
          ctx.session.ownerId = null;
          ctx.session.currentPage = null;
          ctx.session.historyPage = null;
          ctx.session.confirment_messageId = null;
          break;
        }
      }
    });
  }
  

  @Action(/.+/)
  async parseAction(@Ctx() ctx: MyContext) {
    let data: {
      type: string;
      id: number;
      day: number;
      page: number;
      provider: string;
      schedule_id: number;
      stadion_off: number;
      special_id: number;
      back: string;
      plan: string;
      setting: NotificationSettings_type;
    };
    const lang = await this.utils.langs(ctx);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      data = JSON.parse(ctx.callbackQuery.data);
    } catch (error) {
      this.utils.errorFunction(ctx);
      console.log(error);
      return;
    }
    try {
      switch (data.type) {
        case 'noob': {
          if (ctx.callbackQuery) {
            try {
              await ctx.answerCbQuery();
            } catch {}
          }
          return;
        }
        case 'Continue_back_stadion': {
          return this.userService.userbookingRegionItems(ctx, lang, data.id);
        }
        case 'user_back_regionItems': {
          await ctx
            .answerCbQuery()
            .then(() => {})
            .catch();
          return this.userService.userbookingRegion(ctx, lang, data.id);
        }
        case 'user_back_regionItems_Id': {
          await ctx
            .answerCbQuery()
            .then(() => {})
            .catch();
          if (ctx.session.stadionMessages?.length) {
            const messagesId = ctx.session.stadionMessages;
            try {
              await ctx.deleteMessages(messagesId);
            } catch (e) {}
            ctx.session.stadionMessages = [];
          }
          break;
        }
        case 'HELP_ABOUT':
          {
            try {
              await this.utils.safeEditHelpReplyOwner(
                ctx,
                this.i18n.translate('help.help.about', { lang }),
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_START':
          {
            try {
              await this.utils.safeEditHelpReplyOwner(
                ctx,
                this.i18n.translate('help.help.start', { lang }),
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_PAYMENT':
          {
            try {
              await this.utils.safeEditHelpReplyOwner(
                ctx,
                this.i18n.translate('help.help.payment', { lang }),
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_CANCEL':
          {
            try {
              await this.utils.safeEditHelpReplyOwner(
                ctx,
                this.i18n.translate('help.help.cancel', { lang }),
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'HELP_PREMIUM': {
          try {
            await this.utils.safeEditHelpReplyOwner(
              ctx,
              this.i18n.translate('help.help.premium', { lang }),
            );
          } catch {
            this.utils.errorFunction(ctx);
          }
          break;
        }

        case 'HELP_ADVERTISEMENT': {
          try {
            await this.utils.safeEditHelpReplyOwner(
              ctx,
              this.i18n.translate('help.help.advertisement', { lang }),
            );
          } catch {
            this.utils.errorFunction(ctx);
          }
          break;
        }

        case 'HELP_STATISTICS': {
          try {
            await this.utils.safeEditHelpReplyOwner(
              ctx,
              this.i18n.translate('help.help.statistics', { lang }),
            );
          } catch {
            this.utils.errorFunction(ctx);
          }
          break;
        }

        case 'HELP_FAQ': {
          try {
            await this.utils.safeEditHelpReplyOwner(
              ctx,
              this.i18n.translate('help.help.faq', { lang }),
            );
          } catch {
            this.utils.errorFunction(ctx);
          }
          break;
        }

        case 'HELP_CONTACT':
          {
            try {
              await this.utils.safeEditHelpReplyOwner(
                ctx,
                this.i18n.translate('help.help.contact', { lang }),
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_BOOKING':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.booking', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_MY_BOOKINGS':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.my_bookings', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_HOW_BOOKING':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.how_booking', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_PAYMENT_PENALTY':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.payment_penalty', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_CANCEL':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.cancel', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'HELP_USER_CONTACT':
          {
            try {
              await this.utils.safeEditHelpReplyUser(
                ctx,
                this.i18n.translate('user_help.contact', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'stadion': {
          return this.ownerService.stadionMenyu(ctx, data.id, lang);
        }
        case 'miniStadionlar': {
          return this.ownerService.miniStadionlar(ctx, data.id, lang);
        }
        case 'Stadion_nomi':
          {
            try {
              const stadion = await this.prisma.stadion.findUnique({
                where: { id: data.id },
              });
              if (!stadion) {
                await this.utils.errorFunction(ctx);
                return;
              }
              ctx.session.stadion.id = stadion.id;
              if (stadion.stadion_mini) {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.stadionSplit.name', {
                    lang,
                    args: { name: stadion.name },
                  }),
                  {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('success.edit', { lang }),
                          callback_data: JSON.stringify({
                            type: 'updateName',
                            id: stadion.id,
                          }),
                        },

                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: `owner_miniStadion_${stadion.id}`,
                        },
                      ],
                    ],
                  },
                );
                ctx.session.mini = true;
              } else {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.stadionSplit.name', {
                    lang,
                    args: { name: stadion.name },
                  }),
                  {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('success.edit', { lang }),
                          callback_data: JSON.stringify({
                            type: 'updateName',
                            id: stadion.id,
                          }),
                        },
                      ],
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: JSON.stringify({
                            type: 'stadion',
                            id: stadion.id,
                          }),
                        },
                      ],
                    ],
                  },
                );
                ctx.session.mini = false;
              }
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;

        case 'updateName':
          {
            try {
              ctx.reply(
                this.i18n.translate('stadions.stadionSplit.enterNewName', {
                  lang,
                }),
              );
              ctx.session.stadion.name = 'StadionEditName';
            } catch (error) {}
          }
          break;

        case 'players_count':
          {
            try {
              const stadion = await this.prisma.stadion.findFirstOrThrow({
                where: { id: data.id, stadion_mini: true },
              });
              await this.utils.safeEditOrReply(
                ctx,

                this.i18n.translate('stadions.max_players', {
                  lang,
                  args: { count: stadion.max_count },
                }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('success.edit', { lang }),
                        callback_data: JSON.stringify({
                          type: 'edit_miniStadion',
                          id: stadion.id,
                        }),
                      },
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `owner_miniStadion_${stadion.id}`,
                      },
                    ],
                  ],
                },
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            } finally {
              await ctx
                .answerCbQuery()
                .then(() => {})
                .catch();
            }
          }
          break;
        case 'payment_method': {
          return this.ownerService.stadionPayments(ctx, data.id, lang);
        }
        case 'Update_Payments':
          {
            try {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('stadions.paymenst_type', { lang }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('stadions.card', { lang }),
                        callback_data: `payments_${Payments.CARD}`,
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('stadions.cash', { lang }),
                        callback_data: `payments_${Payments.CASH}`,
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('stadions.both', { lang }),
                        callback_data: `payments_${Payments.GIBRID}`,
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: JSON.stringify({
                          type: 'payment_method',
                          id: data.id,
                        }),
                      },
                    ],
                  ],
                },
              );
              ctx.session.stadion.payments = 'PAYMENTS';
              ctx.session.stadion.id = data.id;
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'edit_miniStadion':
          {
            await ctx.reply(
              this.i18n.translate('stadions.stadium_capacity_prompt', { lang }),
            );
            ctx.session.maxCount = 'maxCount';
            ctx.session.stadion.id = data.id;
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'back_1':
          {
            const owner = await this.prisma.owners.findUnique({
              where: { chatID: String(ctx.from?.id) },
            });
            if (!owner) {
              throw new Error();
            }
            const stadion = await this.prisma.stadion.findMany({
              where: { owner_id: owner.id, stadion_mini: false },
              orderBy: { updatedAt: 'desc' },
            });
            if (!stadion.length) {
              try {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.stadion', { lang }),
                  {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('stadions.add', { lang }),
                          callback_data: 'add_stadion',
                        },
                      ],
                      [
                        {
                          text: this.i18n.translate('stadions.back', { lang }),
                          callback_data: 'back_owner_1',
                        },
                      ],
                    ],
                  },
                );
              } catch (error) {
                this.utils.errorFunction(ctx);
              }
              return;
            } else {
              const button: InlineKeyboardButton[][] = [];

              stadion.forEach((s) => {
                button.push([
                  {
                    text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
                    callback_data: JSON.stringify({
                      type: 'stadion',
                      id: s.id,
                    }),
                  },
                ]);
              });

              button.push(
                [
                  {
                    text: this.i18n.translate('stadions.add', { lang }),
                    callback_data: 'add_stadion',
                  },
                ],
                [
                  {
                    text: this.i18n.translate('stadions.back', { lang }),
                    callback_data: 'back_owner_1',
                  },
                ],
              );
              try {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.select', { lang }),
                  { inline_keyboard: button },
                );
              } catch (error) {
                this.utils.errorFunction(ctx);
              }
            }
          }
          break;
        case 'delete':
          {
            try {
              const stadion = await this.prisma.stadion.findUnique({
                where: { id: data.id },
              });
              if (!stadion) {
                await this.utils.errorFunction(ctx);
                return;
              }

              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('schedule.type.delet', { lang }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.type.yes', {
                          lang,
                        }),
                        callback_data: JSON.stringify({
                          type: 'delete_yes',
                          id: data.id,
                        }),
                      },
                      stadion.stadion_mini
                        ? {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: `owner_miniStadion_${stadion.id}`,
                          }
                        : {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: JSON.stringify({
                              type: 'stadion',
                              id: data.id,
                            }),
                          },
                    ],
                  ],
                },
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'delete_yes':
          {
            try {
              const owner = await this.prisma.owners.findUnique({
                where: { chatID: String(ctx.from?.id) },
              });
              if (!owner) {
                throw new Error();
              }

              const Stadion = await this.prisma.stadion.findFirst({
                where: { id: data.id, owner_id: owner.id },
                include: {
                  parent: true,
                  children: true,
                },
              });
              if (!Stadion) {
                await this.utils.errorFunction(ctx);
                return;
              }

              const stadionIds = getRelatedStadionIds(Stadion);

              const bookings = await this.prisma.booking.count({
                where: {
                  stadion_id: { in: stadionIds },
                  status: {
                    in: ['CONFIRMED', 'PENDING', 'PAID'],
                  },
                },
              });

              if (bookings > 0) {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.deleteAlert', { lang }),
                  {
                    inline_keyboard: [
                      [
                        Stadion.stadion_mini
                          ? {
                              text: this.i18n.translate('schedule.back', {
                                lang,
                              }),
                              callback_data: `owner_miniStadion_${Stadion.id}`,
                            }
                          : {
                              text: this.i18n.translate('schedule.back', {
                                lang,
                              }),
                              callback_data: JSON.stringify({
                                type: 'stadion',
                                id: Stadion.id,
                              }),
                            },
                      ],
                    ],
                  },
                );
                return;
              }
              await this.prisma.stadion.deleteMany({
                where: { id: { in: stadionIds } },
              });
              if (Stadion.stadion_mini) {
                return this.ownerService.miniStadionlar(
                  ctx,
                  Number(Stadion.parent_id),
                  lang,
                );
              }
              const stadion = await this.prisma.stadion.findMany({
                where: { owner_id: owner.id, stadion_mini: false },
                orderBy: { updatedAt: 'desc' },
              });

              if (!stadion.length) {
                try {
                  await this.utils.safeEditOrReply(
                    ctx,
                    this.i18n.translate('stadions.stadion', { lang }),
                    {
                      inline_keyboard: [
                        [
                          {
                            text: this.i18n.translate('stadions.add', { lang }),
                            callback_data: 'add_stadion',
                          },
                        ],
                        [
                          {
                            text: this.i18n.translate('stadions.back', {
                              lang,
                            }),
                            callback_data: 'back_owner_1',
                          },
                        ],
                      ],
                    },
                  );
                } catch (error) {
                  this.utils.errorFunction(ctx);
                }

                return;
              } else {
                const button: InlineKeyboardButton[][] = [];

                stadion.forEach((s) => {
                  button.push([
                    {
                      text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
                      callback_data: JSON.stringify({
                        type: 'stadion',
                        id: s.id,
                      }),
                    },
                  ]);
                });

                button.push(
                  [
                    {
                      text: this.i18n.translate('stadions.add', { lang }),
                      callback_data: 'add_stadion',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('stadions.back', { lang }),
                      callback_data: 'back_owner_1',
                    },
                  ],
                );
                try {
                  await this.utils.safeEditOrReply(
                    ctx,
                    this.i18n.translate('stadions.select', { lang }),
                    { inline_keyboard: button },
                  );
                } catch (error) {
                  ctx.reply(this.i18n.translate('error.error', { lang }));
                }
              }
            } catch (error) {
              console.log(error);

              this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'schedule':
          {
            if (data.back === 'back') {
              ctx.session.step = null;
            }
            try {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('schedule.schedule.name', { lang }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate(
                          'schedule.schedule.one_week',
                          {
                            lang,
                          },
                        ),
                        callback_data: JSON.stringify({
                          type: 'week_schedule',
                          id: data.id,
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate(
                          'schedule.schedule.dey_off_dey',
                          {
                            lang,
                          },
                        ),
                        callback_data: JSON.stringify({
                          type: 'day_off',
                          id: data.id,
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate(
                          'schedule.schedule.special_deys',
                          { lang },
                        ),
                        callback_data: JSON.stringify({
                          type: 'special_table',
                          id: data.id,
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: JSON.stringify({
                          type: 'stadion',
                          id: data.id,
                        }),
                      },
                    ],
                  ],
                },
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'week_schedule': {
          return this.botService.renderScheduleMenu(ctx, data.id);
        }
        case 'notification': {
          return this.ownerService.renderNotification(ctx, data.id, lang);
        }
        case 'ownerPremium': {
          return this.ownerService.premium(ctx, Number(data.id), lang);
        }
        case 'premium_buy':
          {
            const plan = data.plan as PremiumPlan;

            const amount = PREMIUM_PLANS[plan].price;
            const label = PLAN_LABELS[lang][plan];

            const message = this.i18n.translate(
              'premium.premium_payment.message',
              {
                lang,
                args: {
                  label,
                  amount: amount.toLocaleString(),
                  currency: CURRENCY_LABELS[lang],
                },
              },
            );
            await this.utils.safeEditOrReply(ctx, message, {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('premium.button', { lang }),
                    callback_data: JSON.stringify({
                      type: 'premium_provider',
                      plan: data.plan,
                      id: data.id,
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: JSON.stringify({
                      id: data.id,
                      type: 'ownerPremium',
                    }),
                  },
                ],
              ],
            });
          }
          break;
        case 'premium_provider': {
          const active = await this.paylov.getActiveMethods();

          const available = PAYMENT_PROVIDERS.filter((p) =>
            active.some((a) => a.name === p.key.toLowerCase()),
          );

          if (available.length === 0) {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('premium.payment.no_methods', { lang }),
            );
            break;
          }

          const keyboard = available.map((provider) => [
            {
              text: `${provider.icon} ${this.i18n.translate(provider.translationKey, { lang })}`,
              callback_data: `premiumProvider|${provider.key}|${data.plan}|${data.id}`,
            },
          ]);

          keyboard.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: JSON.stringify({
                type: 'premium_buy',
                id: data.id,
                plan: data.plan,
              }),
            },
          ]);

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('premium.payment.choose_provider', { lang }),
            { inline_keyboard: keyboard },
          );
          break;
        }
        case 'add_schedule_day':
          {
            ctx.session.stadion.schedule_day = data.day;
            ctx.reply(
              this.i18n.translate('schedule.working_hours', {
                lang,
                args: {
                  name: this.i18n.translate(`schedule.week_days.${data.day}`, {
                    lang,
                  }),
                },
              }),
            );

            ctx.session.step = 'enter_schedule_time';
            ctx.session.stadion.id = data.id;

            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'add_schedule': {
          return this.botService.renderSchedule_week(ctx, data.id);
        }
        case 'view_schedule': {
          return this.botService.viewSchedule(ctx, data.id);
        }
        case 'delete_schedule_day':
          {
            const schedule = await this.prisma.stadion_chedule.findUnique({
              where: { id: data.schedule_id },
              include: {
                stadion: {
                  include: { parent: true, children: true },
                },
              },
            });
            if (!schedule) {
              await this.utils.errorFunction(ctx);
              return;
            }
            const stadionIds = getStadionIds(schedule.stadion);

            const hasBooking = await this.prisma.booking.findMany({
              where: {
                stadion_id: { in: stadionIds },
                status: { in: ['CONFIRMED', 'PENDING', 'PAID'] },
              },
            });

            const conflict =
              hasBooking &&
              hasBooking.some(
                (b) => new Date(b.date).getDay() === schedule?.day_of_week,
              );

            if (conflict) {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('schedule.schedule_delete_warning', {
                  lang,
                }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.delete_yes', {
                          lang,
                        }),
                        callback_data: JSON.stringify({
                          type: 'confirm_Schedule_delete',
                          id: data.id,
                          schedule_id: data.schedule_id,
                        }),
                      },
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: JSON.stringify({
                          type: 'view_schedule',
                          id: data.id,
                        }),
                      },
                    ],
                  ],
                },
              );
            } else {
              await this.prisma.stadion_chedule.delete({
                where: { id: data.schedule_id },
              });
              this.botService.viewSchedule(ctx, data.id);
            }
          }
          break;

        case 'confirm_Schedule_delete':
          {
            await this.prisma.stadion_chedule.delete({
              where: { id: data.schedule_id },
            });
            ctx.answerCbQuery(
              this.i18n.translate('schedule.schedule_deleted', { lang }),
            );
            ctx.session.step = null;
            ctx.session.stadion.id = null;
            ctx.session.stadion.schedule_id = null;
            this.botService.viewSchedule(ctx, data.id);
          }
          break;
        case 'edit_schedule':
          {
            ctx.session.stadion.schedule_day = data.day;
            ctx.reply(
              this.i18n.translate(`schedule.update_hours`, {
                lang,
                args: {
                  day: this.i18n.translate(`schedule.week_days.${data.day}`, {
                    lang,
                  }),
                },
              }),
            );
            ctx.session.step = 'edit_schedule_time';
            ctx.session.stadion.id = data.id;
            ctx.session.stadion.schedule_id = data.schedule_id;
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'day_off': {
          return this.botService.stadion_off_days(ctx, data.id);
        }
        case 'off_stadion':
          {
            ctx.session.step = 'add_off_stadion_week';
            ctx.session.stadion.id = data.id;
            await ctx.reply(
              this.i18n.translate('schedule.off_day.add_day', { lang }),
            );
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'week_edit':
          {
            ctx.session.step = 'week_edit';
            ctx.session.stadion.off = data.stadion_off;
            ctx.session.stadion.id = data.id;
            await ctx.reply(
              this.i18n.translate('schedule.off_day.add_day', { lang }),
            );
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'delete_week':
          {
            try {
              await this.prisma.stadion_off_days.delete({
                where: { id: data.stadion_off },
              });
              return this.botService.stadion_off_days(ctx, data.id);
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'special_table': {
          return this.botService.stadion_special(ctx, data.id);
        }
        case 'add_special':
          {
            ctx.session.step = 'add_special';
            ctx.session.stadion.id = data.id;
            await ctx.reply(this.i18n.translate('schedule.specile', { lang }));
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'special_edit':
          {
            ctx.session.step = 'edit_specile';
            ctx.session.stadion.id = data.id;
            ctx.session.stadion.schedule_id = data.special_id;
            await ctx.reply(this.i18n.translate('schedule.update', { lang }));
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;

        case 'special_delet': {
          try {
            await this.prisma.stadion_special_schedule.delete({
              where: { id: data.special_id },
            });
            return this.botService.stadion_special(ctx, data.id);
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        case 'lokation': {
          return this.botService.location(ctx, data.id);
        }
        case 'update_location':
          {
            ctx.session.step = 'location';
            ctx.session.stadion.id = data.id;
            ctx.reply(this.i18n.translate('stadions.location', { lang }), {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: this.i18n.translate('stadions.send_location', {
                        lang,
                      }),
                      request_location: true,
                    },
                  ],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'price': {
          return this.botService.stadion_price(ctx, data.id);
        }
        case 'Update_price':
          {
            ctx.session.step = 'price';
            ctx.session.stadion.id = data.id;
            ctx.reply(this.i18n.translate('stadions.price', { lang }));
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'image': {
          return this.botService.stadion_image(ctx, data.id);
        }
        case 'update_image':
          {
            ((ctx.session.step = 'image'), (ctx.session.stadion.id = data.id));
            ctx.reply(this.i18n.translate('stadions.image', { lang }));
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'all_data': {
          return this.botService.all_data(ctx, data.id);
        }
        case 'language':
          {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('common.START', { lang }),
              {
                inline_keyboard: [
                  [{ text: "🇺🇿 O'zbekcha", callback_data: 'lang_uz' }],
                  [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
                  [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'phone_back',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
            ctx.session.step = 'language';
          }
          break;
        case 'phone': {
          return this.ownerService.ownerContakt(ctx, data.id);
        }
        case 'phone_back':
          {
            try {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('settings.title', { lang }),
                {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('settings.language', {
                          lang,
                        }),
                        callback_data: JSON.stringify({
                          id: data.id,
                          type: 'language',
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('settings.notification', {
                          lang,
                        }),
                        callback_data: JSON.stringify({
                          id: data.id,
                          type: 'notification',
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('settings.phone', { lang }),
                        callback_data: JSON.stringify({
                          id: data.id,
                          type: 'phone',
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate(
                          'premium.advertising.button',
                          { lang },
                        ),
                        callback_data: JSON.stringify({
                          id: data.id,
                          type: 'advertising',
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('premium.premium', { lang }),
                        callback_data: JSON.stringify({
                          id: data.id,
                          type: 'ownerPremium',
                        }),
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_owner_1',
                      },
                    ],
                  ],
                },
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'advertising':
          {
            const now = new Date();
            const ownerPremium = await this.prisma.subscription.findFirst({
              where: {
                ownerId: Number(data.id),
                isActive: true,
                endDate: { gt: now },
              },
            });
            if (!ownerPremium) {
              await ctx.answerCbQuery(
                this.i18n.translate('premium.advertising.required', { lang }),
                { show_alert: true },
              );
              return;
            }
            const ownerId = Number(data.id);
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('advertisement.advertisement.menu_title', {
                lang,
              }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate(
                        'advertisement.advertisement.create',
                        { lang },
                      ),
                      callback_data: `advertisement_create_${ownerId}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'advertisement.advertisement.my_ads',
                        { lang },
                      ),
                      callback_data: `advertisement_list_${ownerId}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'advertisement.advertisement.statistics',
                        { lang },
                      ),
                      callback_data: `advertisement_statistics_${ownerId}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'advertisement.advertisement.help',
                        { lang },
                      ),
                      callback_data: `advertisement_help_${ownerId}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'ownerSettings_back',
                      }),
                    },
                  ],
                ],
              },
            );
            if (ctx.session.advertisements?.length) {
              await ctx.deleteMessages(ctx.session.advertisements);
              ctx.session.advertisements = [];
            }
            ctx.session.advertisement = {
              title: null,
              description: null,
              image: null,
              stadionId: null,
              isAllStadiums: false,
            };
            if (ctx.callbackQuery) {
              await ctx
                .answerCbQuery()
                .then(() => {})
                .catch();
            }
          }
          break;

        case 'advertisement_skip_image': {
          ctx.session.advertisement.image = null;
          ctx.session.step = null;
          if (ctx.callbackQuery) {
            await ctx.answerCbQuery().catch(() => {});
          }
          return await this.ownerService.selectAdvertisementStadium(ctx, lang);
        }
        case 'advertisement_select_stadium': {
          ctx.session.advertisement.stadionId = data.id;
          return await this.ownerService.advertisementPreview(ctx, lang);
        }
        case 'advertisement_preview_booking': {
          if (ctx.callbackQuery) {
            await ctx.answerCbQuery(
              this.i18n.translate('advertisement.booking_only_users', {
                lang,
              }),
              {
                show_alert: true,
              },
            );
          }
          break;
        }
        case 'advertisement_confirm': {
          if (ctx.callbackQuery) {
            await ctx.answerCbQuery();
          }
          return await this.ownerService.advertisement_created(ctx, lang);
        }
        case 'ownerSettings_back': {
          const owner = await this.prisma.owners.findUnique({
            where: { chatID: String(ctx.from?.id) },
          });
          if (!owner) {
            ctx.reply(this.i18n.translate('error.error', { lang }));
            return;
          }
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('settings.title', { lang }),
            {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('settings.language', { lang }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'language',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('settings.notification', {
                      lang,
                    }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'notification',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('settings.phone', { lang }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'phone',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('premium.advertising.button', {
                      lang,
                    }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'advertising',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('premium.premium', { lang }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'ownerPremium',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: 'back_owner_1',
                  },
                ],
              ],
            },
          );
          break;
        }
        case 'phone_update':
          {
            if (!ctx.session.owner_registor) {
              ctx.session.owner_registor = {
                email: null,
                full_name: null,
                id: 0,
                phone: null,
                step: null,
              };
            }
            ctx.session.owner_registor.phone = 'update_phone';
            ctx.session.owner_registor.id = data.id;
            ctx.reply(this.i18n.translate('registor.phone', { lang }));
            await ctx
              .answerCbQuery()
              .then(() => {})
              .catch();
          }
          break;
        case 'notification_unread':
          {
            const limit = 5;

            const total = await this.prisma.notification.count({
              where: {
                ownerId: data.id,
                isRead: false,
              },
            });
            const currentPage = Math.max(1, Number(data.page) || 1);

            const totalPages = Math.max(1, Math.ceil(total / limit));

            const page = Math.min(currentPage, totalPages);

            const skip = (page - 1) * limit;

            const [notifications] = await Promise.all([
              this.prisma.notification.findMany({
                where: {
                  ownerId: data.id,
                  isRead: false,
                },
                orderBy: {
                  createdAt: 'desc',
                },
                skip,
                take: limit,
              }),
            ]);

            if (!notifications.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.no_new_messages', { lang }),
              );
              return;
            }

            const keyboard: InlineKeyboardButton[][] = [
              ...notifications.map((item) => [
                {
                  text:
                    NotificationNames[item.type]?.[lang] ??
                    NotificationNames[item.type]?.uz,
                  callback_data: JSON.stringify({
                    type: 'notification_view',
                    id: item.id,
                    page: page,
                  }),
                },
              ]),
            ];

            if (totalPages > 1) {
              const row: InlineKeyboardButton[] = [];

              if (page > 1) {
                row.push({
                  text: this.i18n.translate('stadions.Previous', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_unread',
                    id: data.id,
                    page: page - 1,
                  }),
                });
              }

              row.push({
                text: `${page} / ${totalPages}`,
                callback_data: 'ignore',
              });

              if (page < totalPages) {
                row.push({
                  text: this.i18n.translate('stadions.Next', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_unread',
                    id: data.id,
                    page: page + 1,
                  }),
                });
              }

              keyboard.push(row);
            }

            keyboard.push([
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: JSON.stringify({
                  type: 'notification_back',
                  id: data.id,
                }),
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              `🟢 ${this.i18n.translate('notification.unread', { lang })}`,
              {
                inline_keyboard: keyboard,
              },
            );

            await ctx.answerCbQuery().catch(() => {});
          }
          break;
        case 'notification_view':
          {
            const notification = await this.prisma.notification.findUnique({
              where: { id: data.id },
            });

            if (!notification) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.notification_not_found', {
                  lang,
                }),
              );
              return;
            }

            const tr = notification.translations as any;

            if (!notification.isRead) {
              await this.prisma.notification.update({
                where: { id: notification.id },
                data: { isRead: true },
              });
            }
            const count = await this.prisma.notification.count({
              where: { ownerId: notification.ownerId, isRead: false },
            });

            const title = tr[lang]?.title || tr.uz.title;
            const message = tr[lang]?.message || tr.uz.message;

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('notification.notification.detail', {
                lang,
                args: {
                  title,
                  message,
                  date: formatDate(
                    notification.sentAt
                      ? notification.sentAt
                      : notification.createdAt,
                    lang,
                  ),
                },
              }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type:
                          count > 0
                            ? 'notification_unread'
                            : 'notification_back',
                        id: notification.ownerId,
                        page: data.page,
                      }),
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'notification_back': {
          return this.ownerService.renderNotification(ctx, data.id, lang);
        }
        case 'notification_read':
          {
            const limit = 5;

            const total = await this.prisma.notification.count({
              where: {
                ownerId: data.id,
                isRead: true,
              },
            });
            const currentPage = Math.max(1, Number(data.page) || 1);

            const totalPages = Math.max(1, Math.ceil(total / limit));

            const page = Math.min(currentPage, totalPages);

            const skip = (page - 1) * limit;

            const notifications = await this.prisma.notification.findMany({
              where: {
                ownerId: data.id,
                isRead: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
              skip,
              take: limit,
            });

            if (!notifications.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.no_read_messages', { lang }),
              );
              return;
            }

            const keyboard: InlineKeyboardButton[][] = [
              ...notifications.map((item) => [
                {
                  text:
                    NotificationNames[item.type]?.[lang] ??
                    NotificationNames[item.type]?.uz,
                  callback_data: JSON.stringify({
                    type: 'notification_read_view',
                    id: item.id,
                    page: page,
                  }),
                },
              ]),
            ];

            if (totalPages > 1) {
              const row: InlineKeyboardButton[] = [];

              if (page > 1) {
                row.push({
                  text: this.i18n.translate('stadions.Previous', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_read',
                    id: data.id,
                    page: page - 1,
                  }),
                });
              }

              row.push({
                text: `${page} / ${totalPages}`,
                callback_data: 'ignore',
              });

              if (page < totalPages) {
                row.push({
                  text: this.i18n.translate('stadions.Next', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_read',
                    id: data.id,
                    page: page + 1,
                  }),
                });
              }

              keyboard.push(row);
            }

            keyboard.push([
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: JSON.stringify({
                  type: 'notification_back',
                  id: data.id,
                }),
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              `🟢 ${this.i18n.translate('notification.read', { lang })}`,
              {
                inline_keyboard: keyboard,
              },
            );
          }
          break;
        case 'notification_read_view':
          {
            const notification = await this.prisma.notification.findUnique({
              where: { id: data.id },
            });

            if (!notification) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.notification_not_found', {
                  lang,
                }),
              );
              return;
            }

            const tr = notification.translations as any;

            const title = tr[lang]?.title || tr.uz.title;
            const message = tr[lang]?.message || tr.uz.message;

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('notification.notification.detail', {
                lang,
                args: {
                  title,
                  message,
                  date: formatDate(
                    notification.sentAt
                      ? notification.sentAt
                      : notification.createdAt,
                    lang,
                  ),
                },
              }),
              {
                inline_keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('schedule.back', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'notification_read',
                        id: notification.ownerId,
                        page: data.page,
                      }),
                    },
                  ],
                ],
              },
            );
          }
          break;

        case 'notification_all':
          {
            const limit = 5;

            const total = await this.prisma.notification.count({
              where: {
                ownerId: data.id,
              },
            });
            const currentPage = Math.max(1, Number(data.page) || 1);

            const totalPages = Math.max(1, Math.ceil(total / limit));

            const page = Math.min(currentPage, totalPages);

            const skip = (page - 1) * limit;

            const notifications = await this.prisma.notification.findMany({
              where: {
                ownerId: data.id,
              },
              orderBy: {
                createdAt: 'desc',
              },
              skip,
              take: limit,
            });

            if (!notifications.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.no_notifications', { lang }),
              );
              return;
            }
            const keyboard: InlineKeyboardButton[][] = [
              ...notifications.map((item) => [
                {
                  text: `${item.isRead ? '✅' : '🟢'} ${
                    NotificationNames[item.type]?.[lang] ??
                    NotificationNames[item.type]?.uz
                  }`,
                  callback_data: JSON.stringify({
                    type: item.isRead
                      ? 'notification_read_view'
                      : 'notification_view',
                    id: item.id,
                    page: page,
                  }),
                },
              ]),
            ];

            if (totalPages > 1) {
              const row: InlineKeyboardButton[] = [];

              if (page > 1) {
                row.push({
                  text: this.i18n.translate('stadions.Previous', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_all',
                    id: data.id,
                    page: page - 1,
                  }),
                });
              }

              row.push({
                text: `${page} / ${totalPages}`,
                callback_data: 'ignore',
              });

              if (page < totalPages) {
                row.push({
                  text: this.i18n.translate('stadions.Next', { lang }),
                  callback_data: JSON.stringify({
                    type: 'notification_all',
                    id: data.id,
                    page: page + 1,
                  }),
                });
              }

              keyboard.push(row);
            }

            keyboard.push([
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: JSON.stringify({
                  type: 'notification_back',
                  id: data.id,
                }),
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              `📋 ${this.i18n.translate('notification.all', { lang })}`,
              {
                inline_keyboard: keyboard,
              },
            );
          }
          break;
        case 'notification_settings': {
          return this.ownerService.notificationSettings(
            ctx,
            Number(data.id),
            lang,
          );
        }
        case 'notification_clear':
          {
            const count = await this.prisma.notification.count({
              where: {
                ownerId: data.id,
                isRead: true,
              },
            });

            if (count === 0) {
              await ctx.answerCbQuery(
                this.i18n.translate('notification.no_messages_to_delete', {
                  lang,
                }),
              );
              return;
            }

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('notification.confirm_delete', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.schedules.delet', {
                        lang,
                      }),
                      callback_data: JSON.stringify({
                        type: 'notificationClear_yes',
                        id: data.id,
                      }),
                    },
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'notification_back',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'notificationClear_yes': {
          await this.prisma.notification.deleteMany({
            where: { ownerId: data.id, isRead: true },
          });
          await ctx.answerCbQuery(
            this.i18n.translate('notification.all_read_deleted', { lang }),
          );
          return this.ownerService.renderNotification(ctx, data.id, lang);
        }
        default: {
          await ctx.answerCbQuery();
          return;
        }
      }
    } catch (error) {
      await ctx.answerCbQuery();
      await this.utils.errorFunction(ctx);
      console.log(error);
    }
  }

  @On('contact')
  async onContact(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.session.step == 'owner_registor') {
      return this.ownerService.registor_step(ctx, lang);
    }
    if (ctx.session.step == 'user_registor') {
      return this.userService.registor_step(ctx, lang);
    }
  }
  @On('location')
  async onLocation(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.session.stadion_step === 'stadion') {
      if (ctx.session.stadion.lockation === 'L') {
        if (ctx.message && 'location' in ctx.message) {
          const { latitude, longitude } = ctx.message.location;
          ctx.session.stadion.latitude = latitude;
          ctx.session.stadion.longitude = longitude;
          ctx.session.stadion.lockation = null;
          ctx.session.stadion.step = 4;
          await ctx.reply(
            this.i18n.translate('stadions.location_text', { lang }),
            {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: this.i18n.translate('stadions.back', { lang }),
                    },
                  ],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            },
          );
          ctx.session.stadion.max_count = 0;
          return;
        }
        await ctx.reply(
          this.i18n.translate('stadions.location_else', { lang }),
        );
        return;
      }
    }
    if (ctx.session.step === 'location') {
      if (ctx.message && 'location' in ctx.message) {
        const { latitude, longitude } = ctx.message.location;
        try {
          await this.prisma.stadion.update({
            where: { id: Number(ctx.session.stadion.id) },
            data: { latitude, longitude },
          });
          await ctx.reply(
            this.i18n.translate('stadions.menyu.update', { lang }),
          );
          ctx.session.step = null;
          return this.botService.location(ctx, Number(ctx.session.stadion.id));
        } catch (error) {
          this.utils.errorFunction(ctx);
        }
      }
    }
    if (ctx.session.booking_step === 'user_location_send') {
      if (ctx.message && 'location' in ctx.message) {
        const { latitude, longitude } = ctx.message.location;
        return this.userService.handleLocation(ctx, lang, latitude, longitude);
      }
    } else {
      ctx.reply(this.i18n.translate('error.warning_locate', { lang }));
    }
  }
  @On('photo')
  async onPhoto(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    try {
      if (
        ctx.session.stadion_step === 'stadion' &&
        ctx.session.stadion.image === 'image'
      ) {
        if (
          ctx.message &&
          'photo' in ctx.message &&
          ctx.message.photo.length > 0
        ) {
          const image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          ctx.session.stadion.image = image;
          ctx.session.stadion_step = 'stadion_type';
          await ctx.reply(
            this.i18n.translate('stadions.stadion_type.title', { lang }),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('stadions.stadion_type.big', {
                        lang,
                      }),
                      callback_data: 'stadion_type_big',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('stadions.stadion_type.small', {
                        lang,
                      }),
                      callback_data: 'stadion_type_smol',
                    },
                  ],
                ],
              },
            },
          );
        }
        return;
      }
      if (ctx.session.step === 'image') {
        if (
          ctx.message &&
          'photo' in ctx.message &&
          ctx.message.photo.length > 0
        ) {
          const image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          const stadion = await this.prisma.stadion.update({
            where: { id: Number(ctx.session.stadion.id) },
            data: { image },
          });
          await ctx.reply(
            this.i18n.translate('stadions.menyu.image_update', { lang }),
          );
          ctx.session.step = null;
          return this.botService.stadion_image(ctx, stadion.id);
        }
      }
      if (ctx.session.step === 'ADVERTISEMENT_IMAGE') {
        if (
          ctx.message &&
          'photo' in ctx.message &&
          ctx.message.photo.length > 0
        ) {
          const image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          ctx.session.advertisement.image = image;
          ctx.session.advertisements?.push(ctx.message.message_id);
          ctx.session.step = null;
          return this.ownerService.selectAdvertisementStadium(ctx, lang);
        }
      } else {
        await ctx.reply(this.i18n.translate('error.warning_image', { lang }));
      }
    } catch (error) {
      ctx.session.step = null;
      this.utils.errorFunction(ctx);
    }
  }
  @On('message')
  async Message(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    try {
      if (!ctx.message || !('text' in ctx.message)) return;

      const text = ctx.message.text.trim();

      if (text.startsWith('checkin_ADMIN_')) {
        const token = text.replace('checkin_ADMIN_', '');
        try {
          const data = this.qrservice.verifyQr(token);

          if (!data) {
            ctx.reply(this.i18n.translate('error.qr_error', { lang }), {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'errorBack_1',
                    },
                  ],
                ],
              },
            });
            return;
          }

          const booking = await this.prisma.booking.findUnique({
            where: { id: data.bookingId },
            include: {
              stadion: {
                include: {
                  owner: {
                    select: {
                      chatID: true,
                    },
                  },
                },
              },
            },
          });

          if (!booking) {
            ctx.reply(
              this.i18n.translate('error.booking_not_found', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }
          if (String(ctx.from?.id) !== booking.stadion.owner.chatID) {
            ctx.reply(
              this.i18n.translate('error.not_admin_for_stadion', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }

          if (
            (booking.payment_method === 'CARD' && booking.status !== 'PAID') ||
            (booking.payment_method === 'CASH' &&
              booking.status !== 'CONFIRMED')
          ) {
            ctx.reply(
              this.i18n.translate('error.payment_unpaid_or_unconfirmed', {
                lang,
              }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }

          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { check_in: true },
          });

          await ctx.reply(
            this.i18n.translate('success.user_checked_in', { lang }),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'errorBack_1',
                    },
                  ],
                ],
              },
            },
          );
          return;
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }
      if (ctx.session.stadion.name === 'SeorchName') {
        try {
          const searchName = text.trim();
          const stadion = await this.prisma.stadion.findMany({
            where: {
              working_status: true,
              admin_status: AdminStatus.APPROVED,
              owner: {
                status: Admin_S.ACTIVE,
              },
              name: { contains: searchName, mode: 'insensitive' },
              stadionChedules: { some: {} },
            },
            take: 5,
            include: {
              region: true,
              region_items: true,
            },
          });
          if (!stadion.length) {
            ctx.session.stadion.name = null;
            await ctx.reply(
              this.i18n.translate('booking.stadions.notFount_name', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_user_6',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }
          ctx.session.stadion.name = null;
          for (const item of stadion) {
            return this.userService.stadionAll_data(ctx, lang, item, '', true);
          }
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }

      if (ctx.session.step === 'menyu') {
        await ctx.reply(
          this.i18n.translate('common.WELCOME', { lang }),
          Markup.keyboard([
            [
              this.i18n.translate('menyu_buttons.stadion', { lang }),
              this.i18n.translate('menyu_buttons.bron', { lang }),
            ],
            [
              this.i18n.translate('menyu_buttons.settings', { lang }),
              this.i18n.translate('menyu_buttons.help', { lang }),
            ],
            [this.i18n.translate('menyu_buttons.card', { lang })],
          ])
            .resize()
            .oneTime(),
        );
        ctx.session.step = null;
        ctx.session.stadion_step = null;
        if (ctx.session.ownerStadions?.length) {
          try {
            await ctx.deleteMessages(ctx.session.ownerStadions);
          } catch (error) {}
          ctx.session.ownerStadions = [];
        }
        return;
      }
      if (ctx.session.step === 'registor') {
        if (
          text === `💼 ${this.i18n.translate('registor.button.0', { lang })}`
        ) {
          return this.ownerService.registor(ctx, lang);
        } else if (
          text === `🏃🏼 ${this.i18n.translate('registor.button.1', { lang })}`
        ) {
          return this.userService.registor(ctx, lang);
        } else {
          ctx.reply(this.i18n.translate('error.worning', { lang }));
          return;
        }
      }

      if (ctx.session.step === 'owner_registor') {
        return this.ownerService.registor_step(ctx, lang);
      }
      if (ctx.session.step === 'user_registor') {
        return this.userService.registor_step(ctx, lang);
      }

      switch (text) {
        case this.i18n.translate('menyu_buttons.stadion', { lang }):
          return this.ownerService.handleStadionMenu(ctx, lang);

        case this.i18n.translate('menyu_buttons.bron', { lang }):
          return this.ownerService.owner_Bron(ctx, lang);

        case this.i18n.translate('menyu_buttons.card', { lang }):
          return this.ownerService.owner_payout(ctx, lang);

        case this.i18n.translate('menyu_buttons.settings', { lang }): {
          const role = await this.utils.isChecket(String(ctx.from?.id), ctx);

          if (role === 'error') return;
          if (role === 'none') return this.botService.checket(ctx);

          return role === 'owner'
            ? this.ownerService.ownerSettings(ctx, lang)
            : this.userService.settings(ctx, lang);
        }
        case this.i18n.translate('menyu_buttons.help', { lang }): {
          const role = await this.utils.isChecket(String(ctx.from?.id), ctx);

          if (role === 'error') return;
          if (role === 'none') return this.botService.checket(ctx);

          return role === 'owner'
            ? ctx.reply(
                this.i18n.translate('help.help.title', { lang }),
                helpMenuKeyboard_Owner(this.i18n, lang),
              )
            : ctx.reply(
                this.i18n.translate('user_help.menu.title', { lang }),
                helpMenuKeyboard_Users(this.i18n, lang),
              );
        }
        case this.i18n.translate('menyu_buttons.user_stadion_booking', {
          lang,
        }):
          return this.userService.userBooking(ctx, lang);

        case this.i18n.translate('stadions.back', { lang }):
          if (ctx.session.stadion.step) {
            return this.ownerService.handleStadionBack(ctx, lang);
          } else {
            return this.botService.checket(ctx);
          }
      }
      if (ctx.session.stadion.name === 'StadionEditName') {
        ctx.session.stadion.name = null;
        try {
          const isValidName = /^[a-zA-Zа-яА-ЯёЁ0-9\s'’-]+$/.test(text);

          if (!isValidName) {
            ctx.reply(this.i18n.translate('booking.stadions.format', { lang }));
            return;
          }
          const UpdateName = text.trim();
          const id = Number(ctx.session.stadion.id);
          const stadion = await this.prisma.stadion.update({
            where: { id },
            data: { name: UpdateName },
          });
          await ctx.reply(
            this.i18n.translate('success.stadium_name_updated', { lang }),
          );
          ctx.session.stadion.id = null;
          if (ctx.session.mini === true) {
            ctx.session.mini = null;
            return this.ownerService.miniStadion(ctx, stadion.id, lang);
          } else if (ctx.session.mini === false) {
            ctx.session.mini = null;
            return this.ownerService.stadionMenyu(ctx, stadion.id, lang);
          }
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }
      if (ctx.session.maxCount === 'maxCount') {
        try {
          if (typeof text !== 'string' || !text.trim()) {
            await ctx.reply(
              this.i18n.translate('error.enter_number_error', { lang }),
            );
            return;
          }

          const isNumber = /^[0-9]+$/.test(text);

          if (!isNumber) {
            await ctx.reply(
              this.i18n.translate('error.only_number_error', { lang }),
            );
            return;
          }

          const maxCount = Number(text);

          if (maxCount < 6 || maxCount > 20) {
            await ctx.reply(
              this.i18n.translate('error.invalid_range_error', { lang }),
            );
            return;
          }

          const id = Number(ctx.session.stadion.id);

          const stadion = await this.prisma.stadion.update({
            where: { id },
            data: { max_count: maxCount },
          });

          await ctx.reply(
            this.i18n.translate('success.max_players_updated', { lang }),
          );

          ctx.session.stadion.id = null;
          ctx.session.maxCount = null;

          return this.ownerService.miniStadion(ctx, stadion.id, lang);
        } catch (error) {
          console.log(error);
          await this.utils.errorFunction(ctx);
        }
      }

      if (ctx.session.owner_registor.phone === 'update_phone') {
        return this.ownerService.updatePhone(ctx, lang, text);
      }

      if (ctx.session.stadion_step === 'stadion') {
        return this.ownerService.handleStadionSteps(ctx, lang, text);
      }

      if (ctx.session.user_registor.phone === 'phone') {
        return this.userService.userUpdate_phone(ctx, lang, text);
      }
      if (ctx.session.ownerBrons === 'dataFilter') {
        return this.ownerService.handleDataFilter(ctx, text, lang);
      }
      if (ctx.session.ownerBrons === 'search') {
        const input = this.utils.detectSearchType(text);
        if (input.type === 'invalid') {
          const send = await ctx.reply(
            this.i18n.translate('owner_booking.search_empty_input', { lang }),
          );
          ctx.session.ownerActiveBooking ??= [];
          ctx.session.ownerActiveBooking.push(send.message_id);
          return;
        }
        ctx.session.ownerBrons = null;
        return this.ownerService.searchBooking(ctx, input, lang);
      }
      if (
        ctx.session.step &&
        ['ADVERTISEMENT_TITLE', 'ADVERTISEMENT_DESCRIPTION'].includes(
          ctx.session.step,
        )
      ) {
        const type = ctx.session.step;
        return this.ownerService.ownerAdvertisement(ctx, type, text, lang);
      }

      if (
        ctx.session.step &&
        [
          'enter_schedule_time',
          'edit_schedule_time',
          'special_time',
          'special_time_edit',
        ].includes(ctx.session.step)
      ) {
        return this.ownerService.handleSchedule(ctx, lang, text);
      }

      if (
        ctx.session.step &&
        [
          'add_off_stadion_week',
          'add_special',
          'week_edit',
          'edit_specile',
        ].includes(ctx.session.step)
      ) {
        return this.ownerService.handleOffDays(ctx, lang, text);
      }

      if (ctx.session.step === 'price') {
        return this.ownerService.handlePrice(ctx, lang, text);
      }
      if (ctx.session.adminOwnerSearch) {
        const searchState = ctx.session.adminOwnerSearch;

        if (searchState.active) {
          const promptMessageId = searchState.promptMessageId;
          const searchText = ctx.message.text;

          ctx.session.adminOwnerSearch = undefined;

          try {
            await ctx.deleteMessages([promptMessageId, ctx.message.message_id]);
          } catch {}

          await this.adminPaneli.handleAdminOwnerSearchText(ctx, searchText);
          return;
        }
        return;
      }
      if (ctx.session.admin_step === 'admin_bron_name') {
        const name = text.trim();

        if (!name || name.length < 2 || name.length > 50) {
          const sent = await ctx.reply(
            this.i18n.translate('admin.booking.invalid_name', { lang }),
          );
          ctx.session.admin_booking_messages ??= [];
          ctx.session.admin_booking_messages.push(sent.message_id);
          return;
        }
        ctx.session.admin_bron_name = text;
        try {
          await ctx.editMessageText(
            this.i18n.translate('admin.booking.enter_phone', { lang }),
          );
        } catch (error) {
          const sent = await ctx.reply(
            this.i18n.translate('admin.booking.enter_phone', { lang }),
          );
          ctx.session.admin_booking_messages ??= [];
          ctx.session.admin_booking_messages.push(sent.message_id);
        }
        ctx.session.admin_step = 'admin_bron_phone';
        return;
      }
      if (ctx.session.admin_step === 'admin_bron_phone') {
        try {
          const phone = text;

          const phoneRegex = /^(?:\+998|998)?[0-9]{9}$/;

          if (!phone || !phoneRegex.test(phone)) {
            const sent = await ctx.reply(
              this.i18n.translate('error.phone_invalid', { lang }),
            );
            ctx.session.admin_booking_messages ??= [];
            ctx.session.admin_booking_messages.push(sent.message_id);
            return;
          }

          let normalizedPhone = phone;

          if (phone.length === 9) {
            normalizedPhone = `+998${phone}`;
          } else if (phone.startsWith('998')) {
            normalizedPhone = `+${phone}`;
          }
          ctx.session.admin_bron_phone = phone;
          const owner = await this.prisma.owners.findUnique({
            where: { chatID: String(ctx.from?.id) },
          });
          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }
          const stadions = await this.prisma.stadion.findMany({
            where: { owner_id: owner.id },
          });
          if (!stadions.length) {
            await ctx.answerCbQuery(
              this.i18n.translate('stadions.not_fount', { lang }),
            );
            return;
          }
          const buttons: InlineKeyboardButton[][] = stadions.map((item) => [
            {
              text:
                item.name.length > 20
                  ? `🏟  ${item.name.slice(0, 20)}...`
                  : `🏟  ` + item.name,
              callback_data: `Newbooking_stadions_${item.id}_${lang}`,
            },
          ]);
          buttons.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: 'back_owner_11',
            },
          ]);
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('admin.select_stadium', { lang }),
            { inline_keyboard: buttons },
          );

          return;
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }

      ctx.reply(this.i18n.translate('error.else', { lang, args: { text } }));
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }
}
