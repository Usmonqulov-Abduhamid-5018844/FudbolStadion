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
  escapeHtml,
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

interface ActionPayload {
  type: string;
  id?: number;
  day?: number;
  page?: number;
  provider?: string;
  schedule_id?: number;
  stadion_off?: number;
  special_id?: number;
  back?: string;
  plan?: string;
  setting?: NotificationSettings_type;
}

type NotificationTexts = Record<
  string,
  { title?: string; message?: string } | undefined
>;

const ACTIVE_BOOKING_STATUSES: Booking_status[] = [
  'CONFIRMED',
  'PENDING',
  'PAID',
];

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);
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

  private parseIdList(raw?: string): number[] {
    return (raw ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  private readonly AdminChatid = this.parseIdList(process.env.ADMIN_CHAT_ID);
  private readonly SuperAdminChatid = this.parseIdList(
    process.env.SUPER_ADMIN ?? process.env.SUPPER_ADMIN,
  );
  private static readonly SUPER_OWNER_STEPS = new Set([
    'status',
    'confirm',
    'delete',
    'deletConfirm',
  ]);
  private parseGiftReason(raw: string): PremiumReason {
    const allowed: string[] = [
      PremiumReason.GIFT,
      PremiumReason.COMPENSATION,
      PremiumReason.TRIAL,
    ];
    if (!allowed.includes(raw)) {
      throw new InvalidCallbackError(`Noto'g'ri sovg'a sababi: ${raw}`);
    }
    return raw as PremiumReason;
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
      await ctx.answerCbQuery().catch(() => undefined);
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
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
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

  @Action(/^Newbooking_(owners|firstName|stadions)_(\d+)_(uz|ru|en)$/)
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
  @Action(/^add_stadion/)
  async add_stadion(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        select: { status: true },
      });
      if (!owner) {
        await this.deny(ctx, lang);
        return;
      }
      if (owner.status === 'BLOCKED') {
        await this.alertBox(ctx, t('stadions.blocked.cannot_add_stadium'));
        return;
      }
      if (owner.status === 'PENDING') {
        await this.alertBox(ctx, t('stadions.pending.cannot_add_stadium'));
        return;
      }

      const regions = await this.prisma.region.findMany();
      if (!regions.length) {
        await this.utils.errorFunction(
          ctx,
          new Error(
            'Regionlar hali yaratilmagan (npm run prisma qilish kerak)',
          ),
          ErrorContext.STADION,
        );
        return;
      }

      const buttons: InlineKeyboardButton[][] = regions.map((r) => [
        { text: r.name, callback_data: `region_${r.id}` },
      ]);
      buttons.push([
        { text: t('stadions.back'), callback_data: 'back_owner_2' },
      ]);

      await this.utils.safeEditOrReply(ctx, t('stadions.stadion_region'), {
        inline_keyboard: buttons,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^region_(\d+)$/)
  async region_items(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const regionId = Number((ctx.match as RegExpMatchArray)[1]);

      const items = await this.prisma.region_item.findMany({
        where: { region_id: regionId },
      });
      if (!items.length) {
        await this.utils.errorFunction(
          ctx,
          new Error(`Region ${regionId} uchun tumanlar yo'q`),
          ErrorContext.STADION,
        );
        return;
      }

      const stadion = this.ensureStadionSession(ctx);
      stadion.region_id = regionId;
      stadion.step = 1;

      const buttons: InlineKeyboardButton[][] = items.map((item) => [
        { text: item.name, callback_data: `regions_item_${item.id}` },
      ]);
      buttons.push([
        { text: t('stadions.back'), callback_data: 'back_owner_3' },
      ]);

      await this.utils.safeEditOrReply(ctx, t('stadions.region_items'), {
        inline_keyboard: buttons,
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }

  @Action(/^regions_item_(\d+)$/)
  async onStadions(@Ctx() ctx: MyContext) {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      const lang = await this.utils.langs(ctx);
      const regionItemId = Number((ctx.match as RegExpMatchArray)[1]);

      const stadion = this.ensureStadionSession(ctx);
      ctx.session.stadion_step = ctx.session.stadion_step || null;

      stadion.region_item_id = regionItemId;
      stadion.step = 2;
      await ctx.reply(this.tr(lang)('stadions.name'));
      ctx.session.stadion_step = 'stadion';
      stadion.name = 'N';
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
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
      if (!(await this.ownerService.hasActivePremium(owner.id))) {
        await this.alertBox(
          ctx,
          this.tr(lang)('premium.premium_notification.only'),
        );
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
      { context: ErrorContext.ADMIN },
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
      async (lang) => {
        const m = ctx.match as RegExpMatchArray;
        const step = m[1];
        const action = m[2] as 'activate' | 'block' | undefined;

        if (BotUpdate.SUPER_OWNER_STEPS.has(step)) {
          if (!this.isSuperAdmin(ctx)) {
            await this.alertBox(ctx, this.tr(lang)('admin.super_admin_only'));
            this.reportSecurity(
              ctx,
              `super admin huquqisiz '${step}' urinishi`,
            );
            return;
          }
          if ((step === 'status' || step === 'confirm') && !action) {
            throw new InvalidCallbackError(
              `AdminPanel_Owner_${step}: action yo'q`,
            );
          }
          this.auditLog(ctx, 'super');
        }

        await this.adminPaneli.AdminPanel_owner(
          ctx,
          step,
          Number(m[3]),
          Number(m[4]),
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
          this.parseGiftReason(parts[1]),
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
          this.parseGiftReason(parts[4]),
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
          this.parseGiftReason(parts[4]),
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
        case '2':
          await this.adminPaneli.closeOwnerStadiumDetails(ctx);
          break;
      }
    });
  }
  /////////////////////////////////////  ADMIN PANELi  /////////////////////////////////////

  private static readonly HELP_OWNER = new Map<string, string>([
    ['HELP_ABOUT', 'help.help.about'],
    ['HELP_START', 'help.help.start'],
    ['HELP_PAYMENT', 'help.help.payment'],
    ['HELP_CANCEL', 'help.help.cancel'],
    ['HELP_PREMIUM', 'help.help.premium'],
    ['HELP_ADVERTISEMENT', 'help.help.advertisement'],
    ['HELP_STATISTICS', 'help.help.statistics'],
    ['HELP_FAQ', 'help.help.faq'],
    ['HELP_CONTACT', 'help.help.contact'],
  ]);
  private static readonly HELP_USER = new Map<string, string>([
    ['HELP_USER_BOOKING', 'user_help.booking'],
    ['HELP_USER_MY_BOOKINGS', 'user_help.my_bookings'],
    ['HELP_USER_HOW_BOOKING', 'user_help.how_booking'],
    ['HELP_USER_PAYMENT_PENALTY', 'user_help.payment_penalty'],
    ['HELP_USER_CANCEL', 'user_help.cancel'],
    ['HELP_USER_CONTACT', 'user_help.contact'],
  ]);

  private static readonly NOTIFICATION_LISTS = {
    unread: {
      isRead: false,
      icon: '🟢',
      title: 'notification.unread',
      empty: 'notification.no_new_messages',
      itemType: 'notification_view',
      listType: 'notification_unread',
    },
    read: {
      isRead: true,
      icon: '🟢',
      title: 'notification.read',
      empty: 'notification.no_read_messages',
      itemType: 'notification_read_view',
      listType: 'notification_read',
    },
    all: {
      isRead: undefined,
      icon: '📋',
      title: 'notification.all',
      empty: 'notification.no_notifications',
      itemType: null,
      listType: 'notification_all',
    },
  } as const;

  private jsonCb(
    type: string,
    extra: Record<string, string | number> = {},
  ): string {
    const data = JSON.stringify({ type, ...extra });
    if (Buffer.byteLength(data, 'utf8') > 64) {
      throw new Error(`callback_data 64 baytdan oshdi: ${data}`);
    }
    return data;
  }

  private parsePayload(raw: string): ActionPayload | null {
    if (!raw.startsWith('{')) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        typeof value.type === 'string'
      ) {
        return value as ActionPayload;
      }
    } catch {}
    return null;
  }

  private num(value: number | undefined, name: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new InvalidCallbackError(`Callback maydoni noto'g'ri: ${name}`);
    }
    return value;
  }

  private idOf(data: ActionPayload): number {
    const id = this.num(data.id, `${data.type}.id`);
    if (id === 0) throw new InvalidCallbackError(`${data.type}: id = 0`);
    return id;
  }

  private parsePlan(raw: string | undefined): PremiumPlan {
    const plan = Object.values(PremiumPlan).find((p) => p === raw);
    if (!plan)
      throw new InvalidCallbackError(`Noto'g'ri premium plan: ${String(raw)}`);
    return plan;
  }

  private shortName(name: string, max = 20): string {
    return name.length > max ? `${name.slice(0, max)}...` : name;
  }

  private ownedBy(ctx: MyContext) {
    return { owner: { chatID: String(ctx.from?.id) } };
  }

  private async loadOwnedStadion(ctx: MyContext, lang: string, id: number) {
    const stadion = await this.prisma.stadion.findFirst({
      where: { id, ...this.ownedBy(ctx) },
    });
    if (!stadion) await this.deny(ctx, lang);
    return stadion;
  }

  private async allowStadion(
    ctx: MyContext,
    lang: string,
    id: number,
  ): Promise<boolean> {
    if (await this.ownsStadion(ctx, id)) return true;
    await this.deny(ctx, lang);
    return false;
  }

  private async allowOwner(
    ctx: MyContext,
    lang: string,
    ownerId: number,
  ): Promise<boolean> {
    if (await this.isOwnerOf(ctx, ownerId)) return true;
    await this.deny(ctx, lang);
    return false;
  }

  private async showOwnerSettings(
    ctx: MyContext,
    lang: string,
    ownerId: number,
  ): Promise<void> {
    const t = this.tr(lang);
    const item = (key: string, type: string): InlineKeyboardButton[] => [
      { text: t(key), callback_data: this.jsonCb(type, { id: ownerId }) },
    ];
    await this.utils.safeEditOrReply(ctx, t('settings.title'), {
      inline_keyboard: [
        item('settings.language', 'language'),
        item('settings.notification', 'notification'),
        item('settings.phone', 'phone'),
        item('premium.advertising.button', 'advertising'),
        item('premium.premium', 'ownerPremium'),
        [{ text: t('schedule.back'), callback_data: 'back_owner_1' }],
      ],
    });
  }

  private async showOwnerStadions(ctx: MyContext, lang: string): Promise<void> {
    const t = this.tr(lang);
    const owner = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
      select: { id: true },
    });
    if (!owner) throw new Error(`Owner topilmadi: chatID=${ctx.from?.id}`);

    const stadions = await this.prisma.stadion.findMany({
      where: { owner_id: owner.id, stadion_mini: false },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true },
    });

    const add: InlineKeyboardButton[] = [
      { text: t('stadions.add'), callback_data: 'add_stadion' },
    ];
    const back: InlineKeyboardButton[] = [
      { text: t('stadions.back'), callback_data: 'back_owner_1' },
    ];

    if (!stadions.length) {
      await this.utils.safeEditOrReply(ctx, t('stadions.stadion'), {
        inline_keyboard: [add, back],
      });
      return;
    }
    const rows: InlineKeyboardButton[][] = stadions.map((s) => [
      {
        text: `🏟 ${this.shortName(s.name)}`,
        callback_data: this.jsonCb('stadion', { id: s.id }),
      },
    ]);
    await this.utils.safeEditOrReply(ctx, t('stadions.select'), {
      inline_keyboard: [...rows, add, back],
    });
  }

  private async showNotificationList(
    ctx: MyContext,
    lang: string,
    ownerId: number,
    rawPage: number | undefined,
    mode: keyof typeof BotUpdate.NOTIFICATION_LISTS,
  ): Promise<void> {
    const t = this.tr(lang);
    const cfg = BotUpdate.NOTIFICATION_LISTS[mode];
    const limit = 5;
    const where = { ownerId, isRead: cfg.isRead };

    const total = await this.prisma.notification.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, Number(rawPage) || 1), totalPages);

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    if (!notifications.length) {
      await this.alertBox(ctx, t(cfg.empty));
      return;
    }

    const rows: InlineKeyboardButton[][] = notifications.map((item) => {
      const name =
        NotificationNames[item.type]?.[lang] ??
        NotificationNames[item.type]?.uz;
      const itemType =
        cfg.itemType ??
        (item.isRead ? 'notification_read_view' : 'notification_view');
      return [
        {
          text:
            mode === 'all' ? `${item.isRead ? '✅' : '🟢'} ${name}` : `${name}`,
          callback_data: this.jsonCb(itemType, { id: item.id, page }),
        },
      ];
    });

    if (totalPages > 1) {
      const nav: InlineKeyboardButton[] = [];
      if (page > 1) {
        nav.push({
          text: t('stadions.Previous'),
          callback_data: this.jsonCb(cfg.listType, {
            id: ownerId,
            page: page - 1,
          }),
        });
      }
      nav.push({ text: `${page} / ${totalPages}`, callback_data: 'ignore' });
      if (page < totalPages) {
        nav.push({
          text: t('stadions.Next'),
          callback_data: this.jsonCb(cfg.listType, {
            id: ownerId,
            page: page + 1,
          }),
        });
      }
      rows.push(nav);
    }
    rows.push([
      {
        text: t('schedule.back'),
        callback_data: this.jsonCb('notification_back', { id: ownerId }),
      },
    ]);

    await this.utils.safeEditOrReply(ctx, `${cfg.icon} ${t(cfg.title)}`, {
      inline_keyboard: rows,
    });
  }

  private async showNotificationDetail(
    ctx: MyContext,
    lang: string,
    notification: {
      translations: unknown;
      sentAt: Date | null;
      createdAt: Date;
    },
    backCallback: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const tr = notification.translations as NotificationTexts;
    const title = tr[lang]?.title || tr.uz?.title || '';
    const message = tr[lang]?.message || tr.uz?.message || '';

    await this.utils.safeEditOrReply(
      ctx,
      t('notification.notification.detail', {
        title,
        message,
        date: formatDate(notification.sentAt ?? notification.createdAt, lang),
      }),
      {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: backCallback }],
        ],
      },
    );
  }
  private ensureStadionSession(ctx: MyContext) {
    ctx.session.stadion ||= {
      step: 0,
      name: null,
      lockation: null,
      latitude: null,
      longitude: null,
      price: null,
      max_count: null,
      image: null,
      region_id: null,
      region_item_id: null,
      owner_id: null,
      length: null,
      width: null,
      payments_type: Payments.CASH,
      payments: null,
      schedule_day: null,
      id: null,
      schedule_id: null,
      special: new Date(),
      off: null,
    };
    return ctx.session.stadion;
  }

  @Action(/.+/)
  async parseAction(@Ctx() ctx: MyContext): Promise<void> {
    const raw = this.callbackData(ctx);
    if (!raw) return;

    const data = this.parsePayload(raw);
    if (!data) {
      this.logger.debug(`Handlersiz callback: ${raw}`);
      await ctx.answerCbQuery().catch(() => undefined);
      return;
    }

    try {
      const lang = await this.utils.langs(ctx);
      await this.dispatchAction(ctx, data, lang);
    } catch (error) {
      if (error instanceof InvalidCallbackError) {
        this.logger.warn(`${error.message} | userId: ${ctx.from?.id}`);
        this.reportSecurity(ctx, error.message);
      } else {
        await this.utils.errorFunction(ctx, error, ErrorContext.USER);
      }
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  private async dispatchAction(
    ctx: MyContext,
    data: ActionPayload,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);

    const ownerHelp = BotUpdate.HELP_OWNER.get(data.type);
    if (ownerHelp) {
      await this.utils.safeEditHelpReplyOwner(ctx, t(ownerHelp));
      return;
    }
    const userHelp = BotUpdate.HELP_USER.get(data.type);
    if (userHelp) {
      await this.utils.safeEditHelpReplyUser(ctx, t(userHelp));
      return;
    }

    switch (data.type) {
      case 'noob':
        return;

      case 'Continue_back_stadion':
        await this.userService.userbookingRegionItems(
          ctx,
          lang,
          this.idOf(data),
        );
        return;
      case 'user_back_regionItems':
        await this.userService.userbookingRegion(ctx, lang, this.idOf(data));
        return;
      case 'user_back_regionItems_Id':
        await this.clearMessages(ctx, 'stadionMessages');
        return;

      case 'stadion': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        await this.ownerService.stadionMenyu(ctx, id, lang);
        return;
      }
      case 'miniStadionlar': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        await this.ownerService.miniStadionlar(ctx, id, lang);
        return;
      }
      case 'Stadion_nomi': {
        const stadion = await this.loadOwnedStadion(ctx, lang, this.idOf(data));
        if (!stadion) return;

        this.ensureStadionSession(ctx).id = stadion.id;
        ctx.session.mini = stadion.stadion_mini;

        const edit: InlineKeyboardButton = {
          text: t('success.edit'),
          callback_data: this.jsonCb('updateName', { id: stadion.id }),
        };
        const back: InlineKeyboardButton = {
          text: t('schedule.back'),
          callback_data: stadion.stadion_mini
            ? `owner_miniStadion_${stadion.id}`
            : this.jsonCb('stadion', { id: stadion.id }),
        };
        await this.utils.safeEditOrReply(
          ctx,
          t('stadions.stadionSplit.name', { name: stadion.name }),
          {
            inline_keyboard: stadion.stadion_mini
              ? [[edit, back]]
              : [[edit], [back]],
          },
        );
        return;
      }
      case 'updateName': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        const session = this.ensureStadionSession(ctx);
        session.id = id;
        session.name = 'StadionEditName';
        await ctx.reply(t('stadions.stadionSplit.enterNewName'));
        return;
      }
      case 'players_count': {
        const id = this.idOf(data);
        const stadion = await this.prisma.stadion.findFirst({
          where: { id, stadion_mini: true, ...this.ownedBy(ctx) },
          select: { id: true, max_count: true },
        });
        if (!stadion) return this.deny(ctx, lang);

        await this.utils.safeEditOrReply(
          ctx,
          t('stadions.max_players', { count: stadion.max_count }),
          {
            inline_keyboard: [
              [
                {
                  text: t('success.edit'),
                  callback_data: this.jsonCb('edit_miniStadion', { id }),
                },
                {
                  text: t('schedule.back'),
                  callback_data: `owner_miniStadion_${id}`,
                },
              ],
            ],
          },
        );
        return;
      }
      case 'edit_miniStadion': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.maxCount = 'maxCount';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('stadions.stadium_capacity_prompt'));
        return;
      }
      case 'payment_method': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        await this.ownerService.stadionPayments(ctx, id, lang);
        return;
      }
      case 'Update_Payments': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        const option = (
          key: string,
          value: Payments,
        ): InlineKeyboardButton[] => [
          { text: t(key), callback_data: `payments_${value}` },
        ];
        await this.utils.safeEditOrReply(ctx, t('stadions.paymenst_type'), {
          inline_keyboard: [
            option('stadions.card', Payments.CARD),
            option('stadions.cash', Payments.CASH),
            option('stadions.both', Payments.GIBRID),
            [
              {
                text: t('schedule.back'),
                callback_data: this.jsonCb('payment_method', { id }),
              },
            ],
          ],
        });
        const session = this.ensureStadionSession(ctx);
        session.payments = 'PAYMENTS';
        session.id = id;
        return;
      }
      case 'back_1':
        await this.showOwnerStadions(ctx, lang);
        return;
      case 'delete': {
        const stadion = await this.loadOwnedStadion(ctx, lang, this.idOf(data));
        if (!stadion) return;
        await this.utils.safeEditOrReply(ctx, t('schedule.type.delet'), {
          inline_keyboard: [
            [
              {
                text: t('schedule.type.yes'),
                callback_data: this.jsonCb('delete_yes', { id: stadion.id }),
              },
              {
                text: t('schedule.back'),
                callback_data: stadion.stadion_mini
                  ? `owner_miniStadion_${stadion.id}`
                  : this.jsonCb('stadion', { id: stadion.id }),
              },
            ],
          ],
        });
        return;
      }
      case 'delete_yes': {
        const id = this.idOf(data);
        const stadion = await this.prisma.stadion.findFirst({
          where: { id, ...this.ownedBy(ctx) },
          include: { parent: true, children: true },
        });
        if (!stadion) return this.deny(ctx, lang);

        const stadionIds = getRelatedStadionIds(stadion);
        const activeBookings = await this.prisma.booking.count({
          where: {
            stadion_id: { in: stadionIds },
            status: { in: ACTIVE_BOOKING_STATUSES },
          },
        });
        if (activeBookings > 0) {
          await this.utils.safeEditOrReply(ctx, t('stadions.deleteAlert'), {
            inline_keyboard: [
              [
                {
                  text: t('schedule.back'),
                  callback_data: stadion.stadion_mini
                    ? `owner_miniStadion_${stadion.id}`
                    : this.jsonCb('stadion', { id: stadion.id }),
                },
              ],
            ],
          });
          return;
        }

        await this.prisma.stadion.deleteMany({
          where: { id: { in: stadionIds } },
        });
        this.logger.log(
          `AUDIT stadion delete | owner chat: ${ctx.from?.id} | stadion: ${id}`,
        );

        if (stadion.stadion_mini) {
          await this.ownerService.miniStadionlar(
            ctx,
            Number(stadion.parent_id),
            lang,
          );
          return;
        }
        await this.showOwnerStadions(ctx, lang);
        return;
      }

      case 'schedule': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        if (data.back === 'back') ctx.session.step = null;

        const row = (key: string, type: string): InlineKeyboardButton[] => [
          { text: t(key), callback_data: this.jsonCb(type, { id }) },
        ];
        await this.utils.safeEditOrReply(ctx, t('schedule.schedule.name'), {
          inline_keyboard: [
            row('schedule.schedule.one_week', 'week_schedule'),
            row('schedule.schedule.dey_off_dey', 'day_off'),
            row('schedule.schedule.special_deys', 'special_table'),
            row('schedule.back', 'stadion'),
          ],
        });
        return;
      }
      case 'week_schedule':
      case 'add_schedule':
      case 'view_schedule':
      case 'day_off':
      case 'special_table':
      case 'lokation':
      case 'price':
      case 'image':
      case 'all_data': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        await this.openStadionView(ctx, data.type, id);
        return;
      }
      case 'add_schedule_day': {
        const id = this.idOf(data);
        const day = this.num(data.day, 'day');
        if (!(await this.allowStadion(ctx, lang, id))) return;
        const session = this.ensureStadionSession(ctx);
        session.schedule_day = day;
        session.id = id;
        ctx.session.step = 'enter_schedule_time';
        await ctx.reply(
          t('schedule.working_hours', { name: t(`schedule.week_days.${day}`) }),
        );
        return;
      }
      case 'edit_schedule': {
        const id = this.idOf(data);
        const day = this.num(data.day, 'day');
        const scheduleId = this.num(data.schedule_id, 'schedule_id');
        const owned = await this.prisma.stadion_chedule.count({
          where: { id: scheduleId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        const session = this.ensureStadionSession(ctx);
        session.schedule_day = day;
        session.id = id;
        session.schedule_id = scheduleId;
        ctx.session.step = 'edit_schedule_time';
        await ctx.reply(
          t('schedule.update_hours', { day: t(`schedule.week_days.${day}`) }),
        );
        return;
      }
      case 'delete_schedule_day': {
        const id = this.idOf(data);
        const scheduleId = this.num(data.schedule_id, 'schedule_id');
        const schedule = await this.prisma.stadion_chedule.findFirst({
          where: { id: scheduleId, stadion: this.ownedBy(ctx) },
          include: { stadion: { include: { parent: true, children: true } } },
        });
        if (!schedule) return this.deny(ctx, lang);

        const bookings = await this.prisma.booking.findMany({
          where: {
            stadion_id: { in: getStadionIds(schedule.stadion) },
            status: { in: ACTIVE_BOOKING_STATUSES },
          },
          select: { date: true },
        });
        const conflict = bookings.some(
          (b) => new Date(b.date).getDay() === schedule.day_of_week,
        );

        if (!conflict) {
          await this.prisma.stadion_chedule.delete({
            where: { id: scheduleId },
          });
          await this.botService.viewSchedule(ctx, id);
          return;
        }
        await this.utils.safeEditOrReply(
          ctx,
          t('schedule.schedule_delete_warning'),
          {
            inline_keyboard: [
              [
                {
                  text: t('schedule.delete_yes'),
                  callback_data: this.jsonCb('confirm_Schedule_delete', {
                    id,
                    schedule_id: scheduleId,
                  }),
                },
                {
                  text: t('schedule.back'),
                  callback_data: this.jsonCb('view_schedule', { id }),
                },
              ],
            ],
          },
        );
        return;
      }
      case 'confirm_Schedule_delete': {
        const id = this.idOf(data);
        const scheduleId = this.num(data.schedule_id, 'schedule_id');
        const owned = await this.prisma.stadion_chedule.count({
          where: { id: scheduleId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        await this.prisma.stadion_chedule.delete({ where: { id: scheduleId } });
        await this.alertBox(ctx, t('schedule.schedule_deleted'));
        ctx.session.step = null;
        const session = this.ensureStadionSession(ctx);
        session.id = null;
        session.schedule_id = null;
        await this.botService.viewSchedule(ctx, id);
        return;
      }

      case 'off_stadion': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.step = 'add_off_stadion_week';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('schedule.off_day.add_day'));
        return;
      }
      case 'week_edit': {
        const id = this.idOf(data);
        const offId = this.num(data.stadion_off, 'stadion_off');
        const owned = await this.prisma.stadion_off_days.count({
          where: { id: offId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        ctx.session.step = 'week_edit';
        const session = this.ensureStadionSession(ctx);
        session.off = offId;
        session.id = id;
        await ctx.reply(t('schedule.off_day.add_day'));
        return;
      }
      case 'delete_week': {
        const id = this.idOf(data);
        const offId = this.num(data.stadion_off, 'stadion_off');
        const owned = await this.prisma.stadion_off_days.count({
          where: { id: offId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        await this.prisma.stadion_off_days.delete({ where: { id: offId } });
        await this.botService.stadion_off_days(ctx, id);
        return;
      }
      case 'add_special': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.step = 'add_special';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('schedule.specile'));
        return;
      }
      case 'special_edit': {
        const id = this.idOf(data);
        const specialId = this.num(data.special_id, 'special_id');
        const owned = await this.prisma.stadion_special_schedule.count({
          where: { id: specialId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        ctx.session.step = 'edit_specile';
        const session = this.ensureStadionSession(ctx);
        session.id = id;
        session.schedule_id = specialId;
        await ctx.reply(t('schedule.update'));
        return;
      }
      case 'special_delet': {
        const id = this.idOf(data);
        const specialId = this.num(data.special_id, 'special_id');
        const owned = await this.prisma.stadion_special_schedule.count({
          where: { id: specialId, stadion: this.ownedBy(ctx) },
        });
        if (!owned) return this.deny(ctx, lang);

        await this.prisma.stadion_special_schedule.delete({
          where: { id: specialId },
        });
        await this.botService.stadion_special(ctx, id);
        return;
      }

      case 'update_location': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.step = 'location';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('stadions.location'), {
          reply_markup: {
            keyboard: [
              [{ text: t('stadions.send_location'), request_location: true }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        return;
      }
      case 'Update_price': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.step = 'price';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('stadions.price'));
        return;
      }
      case 'update_image': {
        const id = this.idOf(data);
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.step = 'image';
        this.ensureStadionSession(ctx).id = id;
        await ctx.reply(t('stadions.image'));
        return;
      }

      case 'language': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.utils.safeEditOrReply(ctx, t('common.START'), {
          inline_keyboard: [
            [{ text: "🇺🇿 O'zbekcha", callback_data: 'lang_uz' }],
            [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
            [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
            [
              {
                text: t('schedule.back'),
                callback_data: this.jsonCb('phone_back', { id }),
              },
            ],
          ],
        });
        ctx.session.step = 'language';
        return;
      }
      case 'phone': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.ownerService.ownerContakt(ctx, id);
        return;
      }
      case 'phone_back': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.showOwnerSettings(ctx, lang, id);
        return;
      }
      case 'ownerSettings_back': {
        const owner = await this.prisma.owners.findUnique({
          where: { chatID: String(ctx.from?.id) },
          select: { id: true },
        });
        if (!owner) throw new Error(`Owner topilmadi: chatID=${ctx.from?.id}`);
        await this.showOwnerSettings(ctx, lang, owner.id);
        return;
      }
      case 'phone_update': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        ctx.session.owner_registor ??= {
          email: null,
          full_name: null,
          id: 0,
          phone: null,
          step: null,
        };
        ctx.session.owner_registor.phone = 'update_phone';
        ctx.session.owner_registor.id = id;
        await ctx.reply(t('registor.phone'));
        return;
      }

      case 'ownerPremium': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.ownerService.premium(ctx, id, lang);
        return;
      }
      case 'premium_buy': {
        const id = this.idOf(data);
        const plan = this.parsePlan(data.plan);
        if (!(await this.allowOwner(ctx, lang, id))) return;

        await this.utils.safeEditOrReply(
          ctx,
          t('premium.premium_payment.message', {
            label: PLAN_LABELS[lang][plan],
            amount: PREMIUM_PLANS[plan].price.toLocaleString(),
            currency: CURRENCY_LABELS[lang],
          }),
          {
            inline_keyboard: [
              [
                {
                  text: t('premium.button'),
                  callback_data: this.jsonCb('premium_provider', { plan, id }),
                },
              ],
              [
                {
                  text: t('schedule.back'),
                  callback_data: this.jsonCb('ownerPremium', { id }),
                },
              ],
            ],
          },
        );
        return;
      }
      case 'premium_provider': {
        const id = this.idOf(data);
        const plan = this.parsePlan(data.plan);
        if (!(await this.allowOwner(ctx, lang, id))) return;

        const back: InlineKeyboardButton[] = [
          {
            text: t('schedule.back'),
            callback_data: this.jsonCb('premium_buy', { id, plan }),
          },
        ];
        const providers = await this.availableProviders();
        if (!providers.length) {
          await this.utils.safeEditOrReply(
            ctx,
            t('premium.payment.no_methods'),
            {
              inline_keyboard: [back],
            },
          );
          return;
        }
        const rows: InlineKeyboardButton[][] = providers.map((p) => [
          {
            text: `${p.icon} ${t(p.translationKey)}`,
            callback_data: `premiumProvider|${p.key}|${plan}|${id}`,
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          t('premium.payment.choose_provider'),
          {
            inline_keyboard: [...rows, back],
          },
        );
        return;
      }

      case 'advertising': {
        const ownerId = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, ownerId))) return;

        const premium = await this.prisma.subscription.findFirst({
          where: { ownerId, isActive: true, endDate: { gt: new Date() } },
          select: { id: true },
        });
        if (!premium) {
          await this.alertBox(ctx, t('premium.advertising.required'));
          return;
        }

        const item = (key: string, action: string): InlineKeyboardButton[] => [
          {
            text: t(`advertisement.advertisement.${key}`),
            callback_data: `advertisement_${action}_${ownerId}`,
          },
        ];
        await this.utils.safeEditOrReply(
          ctx,
          t('advertisement.advertisement.menu_title'),
          {
            inline_keyboard: [
              item('create', 'create'),
              item('my_ads', 'list'),
              item('statistics', 'statistics'),
              item('help', 'help'),
              [
                {
                  text: t('schedule.back'),
                  callback_data: this.jsonCb('ownerSettings_back'),
                },
              ],
            ],
          },
        );

        const oldMessages = ctx.session.advertisements;
        if (oldMessages?.length) {
          await ctx.deleteMessages(oldMessages).catch(() => undefined);
          ctx.session.advertisements = [];
        }
        ctx.session.advertisement = {
          title: null,
          description: null,
          image: null,
          stadionId: null,
          isAllStadiums: false,
        };
        return;
      }
      case 'advertisement_skip_image': {
        if (!ctx.session.advertisement)
          return this.alertBox(ctx, t('error.error'));
        ctx.session.advertisement.image = null;
        ctx.session.step = null;
        await ctx.answerCbQuery().catch(() => undefined);
        await this.ownerService.selectAdvertisementStadium(ctx, lang);
        return;
      }
      case 'advertisement_select_stadium': {
        const id = this.idOf(data);
        if (!ctx.session.advertisement)
          return this.alertBox(ctx, t('error.error'));
        if (!(await this.allowStadion(ctx, lang, id))) return;
        ctx.session.advertisement.stadionId = id;
        await this.ownerService.advertisementPreview(ctx, lang);
        return;
      }
      case 'advertisement_preview_booking':
        await this.alertBox(ctx, t('advertisement.booking_only_users'));
        return;
      case 'advertisement_confirm':
        await ctx.answerCbQuery().catch(() => undefined);
        await this.ownerService.advertisement_created(ctx, lang);
        return;

      case 'notification':
      case 'notification_back': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.ownerService.renderNotification(ctx, id, lang);
        return;
      }
      case 'notification_settings': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.ownerService.notificationSettings(ctx, id, lang);
        return;
      }
      case 'notification_unread':
      case 'notification_read':
      case 'notification_all': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        const mode = data.type.replace('notification_', '');
        if (mode !== 'unread' && mode !== 'read' && mode !== 'all') return;
        await this.showNotificationList(ctx, lang, id, data.page, mode);
        return;
      }
      case 'notification_view':
      case 'notification_read_view': {
        const notification = await this.prisma.notification.findUnique({
          where: { id: this.idOf(data) },
        });
        if (!notification) {
          await this.alertBox(ctx, t('notification.notification_not_found'));
          return;
        }
        if (!(await this.allowOwner(ctx, lang, notification.ownerId))) return;

        let backType = 'notification_read';
        if (data.type === 'notification_view') {
          if (!notification.isRead) {
            await this.prisma.notification.update({
              where: { id: notification.id },
              data: { isRead: true },
            });
          }
          const unread = await this.prisma.notification.count({
            where: { ownerId: notification.ownerId, isRead: false },
          });
          backType = unread > 0 ? 'notification_unread' : 'notification_back';
        }
        await this.showNotificationDetail(
          ctx,
          lang,
          notification,
          this.jsonCb(backType, {
            id: notification.ownerId,
            page: data.page ?? 1,
          }),
        );
        return;
      }
      case 'notification_clear': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        const count = await this.prisma.notification.count({
          where: { ownerId: id, isRead: true },
        });
        if (count === 0) {
          await this.alertBox(ctx, t('notification.no_messages_to_delete'));
          return;
        }
        await this.utils.safeEditOrReply(
          ctx,
          t('notification.confirm_delete'),
          {
            inline_keyboard: [
              [
                {
                  text: t('schedule.schedules.delet'),
                  callback_data: this.jsonCb('notificationClear_yes', { id }),
                },
                {
                  text: t('schedule.back'),
                  callback_data: this.jsonCb('notification_back', { id }),
                },
              ],
            ],
          },
        );
        return;
      }
      case 'notificationClear_yes': {
        const id = this.idOf(data);
        if (!(await this.allowOwner(ctx, lang, id))) return;
        await this.prisma.notification.deleteMany({
          where: { ownerId: id, isRead: true },
        });
        await this.alertBox(ctx, t('notification.all_read_deleted'));
        await this.ownerService.renderNotification(ctx, id, lang);
        return;
      }

      default:
        this.logger.debug(`Noma'lum action turi: ${data.type}`);
        return;
    }
  }

  private async openStadionView(
    ctx: MyContext,
    type: string,
    id: number,
  ): Promise<void> {
    switch (type) {
      case 'week_schedule':
        await this.botService.renderScheduleMenu(ctx, id);
        return;
      case 'add_schedule':
        await this.botService.renderSchedule_week(ctx, id);
        return;
      case 'view_schedule':
        await this.botService.viewSchedule(ctx, id);
        return;
      case 'day_off':
        await this.botService.stadion_off_days(ctx, id);
        return;
      case 'special_table':
        await this.botService.stadion_special(ctx, id);
        return;
      case 'lokation':
        await this.botService.location(ctx, id);
        return;
      case 'price':
        await this.botService.stadion_price(ctx, id);
        return;
      case 'image':
        await this.botService.stadion_image(ctx, id);
        return;
      case 'all_data':
        await this.botService.all_data(ctx, id);
        return;
    }
  }

  @On('contact')
  async onContact(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const message = ctx.message;
      if (!message || !('contact' in message)) return;
      const lang = await this.utils.langs(ctx);

      if (message.contact.user_id !== ctx.from?.id) {
        await ctx.reply(this.tr(lang)('error.contact_not_own'));
        return;
      }

      switch (ctx.session.step) {
        case 'owner_registor':
          await this.ownerService.registor_step(ctx, lang);
          return;
        case 'user_registor':
          await this.userService.registor_step(ctx, lang);
          return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }
  @On('location')
  async onLocation(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const message = ctx.message;
      if (!message || !('location' in message)) return;

      const { latitude, longitude } = message.location;
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const session = ctx.session;

      if (
        session.stadion_step === 'stadion' &&
        session.stadion?.lockation === 'L'
      ) {
        session.stadion.latitude = latitude;
        session.stadion.longitude = longitude;
        session.stadion.lockation = null;
        session.stadion.step = 4;
        session.stadion.max_count = 0;

        await ctx.reply(t('stadions.location_text'), {
          reply_markup: {
            keyboard: [[{ text: t('stadions.back') }]],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        return;
      }

      if (session.step === 'location') {
        const stadionId = Number(session.stadion?.id);
        if (
          !Number.isInteger(stadionId) ||
          !(await this.ownsStadion(ctx, stadionId))
        ) {
          await ctx.reply(t('admin.access_denied'));
          session.step = null;
          return;
        }
        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { latitude, longitude },
        });
        session.step = null;
        await ctx.reply(t('stadions.menyu.update'));
        await this.botService.location(ctx, stadionId);
        return;
      }

      if (session.booking_step === 'user_location_send') {
        await this.userService.handleLocation(ctx, lang, latitude, longitude);
        return;
      }
      await ctx.reply(t('error.warning_locate'));
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }
  private photoFileId(ctx: MyContext): string | null {
    const message = ctx.message;
    if (!message || !('photo' in message) || !message.photo.length) return null;
    return message.photo[message.photo.length - 1].file_id; // eng katta o'lcham
  }
  @On('photo')
  async onPhoto(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const message = ctx.message;
      const image = this.photoFileId(ctx);
      if (!message || !image) return;

      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const session = ctx.session;

      if (
        session.stadion_step === 'stadion' &&
        session.stadion?.image === 'image'
      ) {
        session.stadion.image = image;
        session.stadion_step = 'stadion_type';

        await ctx.reply(t('stadions.stadion_type.title'), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('stadions.stadion_type.big'),
                  callback_data: 'stadion_type_big',
                },
              ],
              [
                {
                  text: t('stadions.stadion_type.small'),
                  callback_data: 'stadion_type_smol',
                },
              ],
            ],
          },
        });
        return;
      }

      if (session.step === 'image') {
        const stadionId = Number(session.stadion?.id);
        if (
          !Number.isInteger(stadionId) ||
          !(await this.ownsStadion(ctx, stadionId))
        ) {
          await ctx.reply(t('admin.access_denied'));
          session.step = null;
          return;
        }

        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { image },
        });
        session.step = null;
        await ctx.reply(t('stadions.menyu.image_update'));
        await this.botService.stadion_image(ctx, stadionId);
        return;
      }

      if (session.step === 'ADVERTISEMENT_IMAGE') {
        session.advertisement.image = image;
        session.advertisements?.push(message.message_id);
        session.step = null;
        await this.ownerService.selectAdvertisementStadium(ctx, lang);
        return;
      }

      if ('media_group_id' in message && message.media_group_id) return;

      await ctx.reply(t('error.warning_image'));
    } catch (error) {
      ctx.session.step = null;
      await this.utils.errorFunction(ctx, error, ErrorContext.STADION);
    }
  }
  @On('message')
  async Message(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const message = ctx.message;
      if (!message || !('text' in message)) return;

      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);
      const text = message.text.trim();
      const s = ctx.session;

      if (text.startsWith('checkin_ADMIN_'))
        return await this.handleCheckin(ctx, text, lang);

      if (s.stadion?.name === 'SeorchName')
        return await this.handleStadionSearch(ctx, text, lang);

      if (s.step === 'menyu') {
        await ctx.reply(
          t('common.WELCOME'),
          Markup.keyboard([
            [t('menyu_buttons.stadion'), t('menyu_buttons.bron')],
            [t('menyu_buttons.settings'), t('menyu_buttons.help')],
            [t('menyu_buttons.card')],
          ])
            .resize()
            .oneTime(),
        );
        s.step = null;
        s.stadion_step = null;
        if (s.ownerStadions?.length) {
          await ctx.deleteMessages(s.ownerStadions).catch(() => undefined);
          s.ownerStadions = [];
        }
        return;
      }

      if (s.step === 'registor') {
        if (text === `💼 ${t('registor.button.0')}`)
          return await this.ownerService.registor(ctx, lang);
        if (text === `🏃🏼 ${t('registor.button.1')}`)
          return await this.userService.registor(ctx, lang);
        await ctx.reply(t('error.worning'));
        return;
      }
      if (s.step === 'owner_registor')
        return await this.ownerService.registor_step(ctx, lang);
      if (s.step === 'user_registor')
        return await this.userService.registor_step(ctx, lang);

      switch (text) {
        case t('menyu_buttons.stadion'):
          return await this.ownerService.handleStadionMenu(ctx, lang);
        case t('menyu_buttons.bron'):
          return await this.ownerService.owner_Bron(ctx, lang);
        case t('menyu_buttons.card'):
          return await this.ownerService.owner_payout(ctx, lang);
        case t('menyu_buttons.user_stadion_booking'):
          return await this.userService.userBooking(ctx, lang);
        case t('menyu_buttons.settings'):
        case t('menyu_buttons.help'): {
          const role = await this.utils.isChecket(String(ctx.from?.id), ctx);
          if (role === 'error') return;
          if (role === 'none') return await this.botService.checket(ctx);

          if (text === t('menyu_buttons.settings')) {
            return role === 'owner'
              ? await this.ownerService.ownerSettings(ctx, lang)
              : await this.userService.settings(ctx, lang);
          }
          await (role === 'owner'
            ? ctx.reply(
                t('help.help.title'),
                helpMenuKeyboard_Owner(this.i18n, lang),
              )
            : ctx.reply(
                t('user_help.menu.title'),
                helpMenuKeyboard_Users(this.i18n, lang),
              ));
          return;
        }
        case t('stadions.back'):
          return s.stadion?.step
            ? await this.ownerService.handleStadionBack(ctx, lang)
            : await this.botService.checket(ctx);
      }

      if (s.stadion?.name === 'StadionEditName')
        return await this.handleStadionEditName(ctx, text, lang);
      if (s.maxCount === 'maxCount')
        return await this.handleMaxCount(ctx, text, lang);
      if (s.owner_registor?.phone === 'update_phone')
        return await this.ownerService.updatePhone(ctx, lang, text);
      if (s.stadion_step === 'stadion')
        return await this.ownerService.handleStadionSteps(ctx, lang, text);
      if (s.user_registor?.phone === 'phone')
        return await this.userService.userUpdate_phone(ctx, lang, text);
      if (s.ownerBrons === 'dataFilter')
        return await this.ownerService.handleDataFilter(ctx, text, lang);

      if (s.ownerBrons === 'search') {
        const input = this.utils.detectSearchType(text);
        if (input.type === 'invalid') {
          await this.trackOwnerBooking(
            ctx,
            t('owner_booking.search_empty_input'),
          );
          return;
        }
        s.ownerBrons = null;
        return await this.ownerService.searchBooking(ctx, input, lang);
      }

      const step = s.step;
      if (
        step === 'ADVERTISEMENT_TITLE' ||
        step === 'ADVERTISEMENT_DESCRIPTION'
      ) {
        return await this.ownerService.ownerAdvertisement(
          ctx,
          step,
          text,
          lang,
        );
      }
      if (
        step &&
        [
          'enter_schedule_time',
          'edit_schedule_time',
          'special_time',
          'special_time_edit',
        ].includes(step)
      ) {
        return await this.ownerService.handleSchedule(ctx, lang, text);
      }
      if (
        step &&
        [
          'add_off_stadion_week',
          'add_special',
          'week_edit',
          'edit_specile',
        ].includes(step)
      ) {
        return await this.ownerService.handleOffDays(ctx, lang, text);
      }
      if (step === 'price')
        return await this.ownerService.handlePrice(ctx, lang, text);

      if (s.adminOwnerSearch?.active) {
        const { promptMessageId } = s.adminOwnerSearch;
        s.adminOwnerSearch = undefined;
        if (!this.isAdmin(ctx)) return;
        await ctx
          .deleteMessages([promptMessageId, message.message_id])
          .catch(() => undefined);
        return await this.adminPaneli.handleAdminOwnerSearchText(ctx, text);
      }

      if (s.admin_step === 'admin_bron_name')
        return await this.handleAdminBronName(ctx, text, lang);
      if (s.admin_step === 'admin_bron_phone')
        return await this.handleAdminBronPhone(ctx, text, lang);

      await ctx.reply(
        t('error.else', { text: escapeHtml(text.slice(0, 100)) }),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.USER);
    }
  }

  private async trackOwnerBooking(ctx: MyContext, text: string): Promise<void> {
    const sent = await ctx.reply(text);
    ctx.session.ownerActiveBooking ??= [];
    ctx.session.ownerActiveBooking.push(sent.message_id);
  }

  private static readonly NAME_REGEX = /^[\p{L}\p{M}0-9\s'’ʻʼ.-]+$/u;

  private normalizeUzPhone(raw: string): string | null {
    const compact = raw.replace(/[\s()-]/g, '');
    const match = /^(?:\+?998)?(\d{9})$/.exec(compact);
    return match ? `+998${match[1]}` : null;
  }

  private async replyWithBack(
    ctx: MyContext,
    lang: string,
    key: string,
    backCallback = 'errorBack_1',
  ): Promise<void> {
    const t = this.tr(lang);
    await ctx.reply(t(key), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('schedule.back'), callback_data: backCallback }],
        ],
      },
    });
  }

  private async trackMessage(
    ctx: MyContext,
    key: 'admin_booking_messages',
    text: string,
  ): Promise<void> {
    const sent = await ctx.reply(text);
    ctx.session[key] ??= [];
    ctx.session[key].push(sent.message_id);
  }

  private async handleCheckin(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    const token = text.slice('checkin_ADMIN_'.length);
    const data = this.qrservice.verifyQr(token);
    if (!data) return this.replyWithBack(ctx, lang, 'error.qr_error');

    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { stadion: { select: { owner: { select: { chatID: true } } } } },
    });
    if (!booking)
      return this.replyWithBack(ctx, lang, 'error.booking_not_found');

    if (String(ctx.from?.id) !== booking.stadion.owner.chatID) {
      return this.replyWithBack(ctx, lang, 'error.not_admin_for_stadion');
    }

    const payable =
      (booking.payment_method === 'CARD' && booking.status === 'PAID') ||
      (booking.payment_method === 'CASH' && booking.status === 'CONFIRMED');
    if (!payable)
      return this.replyWithBack(
        ctx,
        lang,
        'error.payment_unpaid_or_unconfirmed',
      );

    const result = await this.prisma.booking.updateMany({
      where: { id: booking.id, check_in: false },
      data: { check_in: true },
    });
    if (result.count === 0) {
      return this.replyWithBack(ctx, lang, 'error.already_checked_in');
    }
    await this.replyWithBack(ctx, lang, 'success.user_checked_in');
  }

  private async handleStadionSearch(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    ctx.session.stadion.name = null;
    const searchName = text.slice(0, 50);

    const stadions = await this.prisma.stadion.findMany({
      where: {
        working_status: true,
        admin_status: AdminStatus.APPROVED,
        owner: { status: Admin_S.ACTIVE },
        name: { contains: searchName, mode: 'insensitive' },
        stadionChedules: { some: {} },
      },
      orderBy: { id: 'asc' },
      take: 5,
      include: { region: true, region_items: true },
    });

    if (!stadions.length) {
      return this.replyWithBack(
        ctx,
        lang,
        'booking.stadions.notFount_name',
        'back_user_6',
      );
    }
    for (const item of stadions) {
      await this.userService.stadionAll_data(ctx, lang, item, '', true);
    }
  }

  private async handleStadionEditName(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const name = text.trim();

    if (
      name.length < 2 ||
      name.length > 50 ||
      !BotUpdate.NAME_REGEX.test(name)
    ) {
      await ctx.reply(t('booking.stadions.format'));
      return;
    }

    const id = Number(ctx.session.stadion?.id);
    if (!Number.isInteger(id) || !(await this.ownsStadion(ctx, id))) {
      ctx.session.stadion.name = null;
      await ctx.reply(t('admin.access_denied'));
      return;
    }

    await this.prisma.stadion.update({ where: { id }, data: { name } });
    await ctx.reply(t('success.stadium_name_updated'));

    const mini = ctx.session.mini;
    ctx.session.stadion.name = null;
    ctx.session.stadion.id = null;
    ctx.session.mini = null;

    if (mini === true) return this.ownerService.miniStadion(ctx, id, lang);
    if (mini === false) return this.ownerService.stadionMenyu(ctx, id, lang);
  }

  private async handleMaxCount(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);

    if (!/^\d+$/.test(text)) {
      await ctx.reply(t('error.only_number_error'));
      return;
    }
    const maxCount = Number(text);
    if (maxCount < 6 || maxCount > 20) {
      await ctx.reply(t('error.invalid_range_error'));
      return;
    }

    const id = Number(ctx.session.stadion?.id);
    if (!Number.isInteger(id) || !(await this.ownsStadion(ctx, id))) {
      ctx.session.maxCount = null;
      await ctx.reply(t('admin.access_denied'));
      return;
    }

    await this.prisma.stadion.update({
      where: { id },
      data: { max_count: maxCount },
    });
    await ctx.reply(t('success.max_players_updated'));

    ctx.session.stadion.id = null;
    ctx.session.maxCount = null;
    await this.ownerService.miniStadion(ctx, id, lang);
  }

  private async handleAdminBronName(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const name = text.trim();

    if (
      name.length < 2 ||
      name.length > 50 ||
      !BotUpdate.NAME_REGEX.test(name)
    ) {
      await this.trackMessage(
        ctx,
        'admin_booking_messages',
        t('admin.booking.invalid_name'),
      );
      return;
    }
    ctx.session.admin_bron_name = name;
    ctx.session.admin_step = 'admin_bron_phone';
    await this.trackMessage(
      ctx,
      'admin_booking_messages',
      t('admin.booking.enter_phone'),
    );
  }

  private async handleAdminBronPhone(
    ctx: MyContext,
    text: string,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const phone = this.normalizeUzPhone(text);
    if (!phone) {
      await this.trackMessage(
        ctx,
        'admin_booking_messages',
        t('error.phone_invalid'),
      );
      return;
    }

    const owner = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
      select: { id: true },
    });
    if (!owner) {
      ctx.session.admin_step = null;
      await ctx.reply(t('admin.access_denied'));
      return;
    }

    const stadions = await this.prisma.stadion.findMany({
      where: { owner_id: owner.id },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (!stadions.length) {
      await ctx.reply(t('stadions.not_found'));
      return;
    }

    ctx.session.admin_bron_phone = phone;

    const buttons: InlineKeyboardButton[][] = stadions.map((s) => [
      {
        text: `🏟 ${s.name.length > 20 ? `${s.name.slice(0, 20)}...` : s.name}`,
        callback_data: `Newbooking_stadions_${s.id}_${lang}`,
      },
    ]);
    buttons.push([
      { text: t('schedule.back'), callback_data: 'back_owner_11' },
    ]);

    await this.utils.safeEditOrReply(ctx, t('admin.select_stadium'), {
      inline_keyboard: buttons,
    });
  }
}
