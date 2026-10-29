import { Injectable, Logger } from '@nestjs/common';
import {
  Admin_S,
  AdminStatus,
  NotificationType,
  PremiumPlan,
  PremiumReason,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { formatDate, formatDateTime } from 'src/helpers/dateFormat';
import { escapeHtml } from 'src/helpers/stadions';
import { formatSum } from 'src/utils/utile.service';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { PLAN_LABELS } from 'src/helpers/interface';
import { ErrorContext } from 'src/helpers/interface/enum';
import { getLocation } from 'src/helpers/lokationSeorch';
import { getPremiumReasonText } from 'src/helpers/reason';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { InlineKeyboardButton } from 'telegraf/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFY_LANGS = ['uz', 'ru', 'en'] as const;

const PLAN_DAYS: Record<PremiumPlan, number> = {
  WEEK_1: 7,
  MONTH_1: 30,
  MONTH_3: 90,
  MONTH_6: 180,
  YEAR_1: 365,
};

const OWNER_LISTS = {
  pending: {
    status: 'PENDING',
    empty: 'admin.pending_empty_owner',
    title: 'admin.pending_list_owner',
  },
  active: {
    status: 'ACTIVE',
    empty: 'admin.active_empty',
    title: 'admin.active_list',
  },
  blocked: {
    status: 'BLOCKED',
    empty: 'admin.blocked_empty',
    title: 'admin.blocked_list',
  },
} as const;

const STADIUM_LISTS = {
  pending: {
    status: 'PENDING',
    empty: 'admin.pending_empty',
    title: 'admin.pending_list',
  },
  approved: {
    status: 'APPROVED',
    empty: 'admin.approved_empty',
    title: 'admin.approved_list',
  },
  rejected: {
    status: 'REJECTED',
    empty: 'admin.rejected_empty',
    title: 'admin.rejected_list',
  },
} as const;

const STADIUM_DETAILS_INCLUDE = {
  owner: true,
  region: true,
  region_items: true,
  stadionChedules: true,
  stadionOffDays: true,
  stadionSpecialSchedules: true,
  parent: {
    include: {
      stadionChedules: true,
      stadionOffDays: true,
      stadionSpecialSchedules: true,
    },
  },
} satisfies Prisma.StadionInclude;

type StadiumDetails = Prisma.StadionGetPayload<{
  include: typeof STADIUM_DETAILS_INCLUDE;
}>;

@Injectable()
export class AdminService {
  private readonly AdminChatid = (process.env.ADMIN_CHAT_ID ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  private readonly SupperAdmin = (process.env.SUPPER_ADMIN ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);

  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilisService,
    private readonly notificationService: NotifikationService,
  ) {}

  // ===================== YORDAMCHI METODLAR =====================

  private tr(lang: string) {
    return (key: string, args?: Record<string, unknown>): string =>
      this.i18n.translate(key, { lang, args });
  }

  private planForDays(days: number): PremiumPlan {
    const plan = (Object.keys(PLAN_DAYS) as PremiumPlan[]).find(
      (p) => PLAN_DAYS[p] === days,
    );
    if (!plan) throw new Error(`Noto'g'ri premium muddati: ${days}`);
    return plan;
  }

  private resetOwnerDetailsSession(ctx: MyContext): void {
    ctx.session.admin_step = null;
    ctx.session.ownerId = null;
    ctx.session.currentPage = null;
    ctx.session.historyPage = null;
    ctx.session.confirment_messageId = null;
  }

  /** Stadion tafsilotlari xabarlarini (rasm + matn) o'chiradi. */
  private async clearAdminDetailMessages(ctx: MyContext): Promise<void> {
    const ids = [
      ctx.session.admin_photoMessageId,
      ctx.session.admin_messageId,
    ].filter((id): id is number => typeof id === 'number');
    if (ids.length) await ctx.deleteMessages(ids).catch(() => undefined);
    ctx.session.admin_photoMessageId = null;
    ctx.session.admin_messageId = null;
  }

  async closeOwnerStadiumDetails(ctx: MyContext): Promise<void> {
    await this.clearAdminDetailMessages(ctx);
    if (ctx.session.confirment_messageId) {
      await ctx
        .deleteMessage(ctx.session.confirment_messageId)
        .catch(() => undefined);
    }
    this.resetOwnerDetailsSession(ctx);
  }

  private buildStadiumDetails(stadion: StadiumDetails, lang: string): string {
    const t = this.tr(lang);
    const noData = t('admin.stadium_list.no_data');
    const parent = stadion.parent;

    const schedules = stadion.stadionChedules.length
      ? stadion.stadionChedules
      : (parent?.stadionChedules ?? []);
    const offDaySchedules = stadion.stadionOffDays.length
      ? stadion.stadionOffDays
      : (parent?.stadionOffDays ?? []);
    const specialSchedules = stadion.stadionSpecialSchedules.length
      ? stadion.stadionSpecialSchedules
      : (parent?.stadionSpecialSchedules ?? []);

    const weekDays = schedules.length
      ? schedules
          .map(
            (s) =>
              `${t(`admin.week_days.${s.day_of_week}`)}: ${s.start_time} - ${s.end_time}`,
          )
          .join('\n')
      : noData;

    // dam olish va maxsus kunlar kalendar sanalar: formatDate to'g'ri
    const offDays = offDaySchedules.length
      ? offDaySchedules.map((d) => formatDate(d.date, lang)).join('\n')
      : noData;
    const specialDays = specialSchedules.length
      ? specialSchedules
          .map(
            (s) =>
              `${formatDate(s.date, lang)}, ${s.start_time} - ${s.end_time}`,
          )
          .join('\n')
      : noData;

    const stadionType = stadion.parent_id
      ? t('admin.stadium_list.types.child')
      : stadion.mini
        ? t('admin.stadium_list.types.mini')
        : t('admin.stadium_list.types.main');

    const yesNo = (value: boolean) =>
      t(value ? 'admin.stadium_list.yes' : 'admin.stadium_list.no');

    return t('admin.stadium_list.details', {
      id: stadion.id,
      name: escapeHtml(stadion.name),
      type: stadionType,
      location: getLocation(
        stadion.latitude,
        stadion.longitude,
        stadion.region.name,
        stadion.region_items.name,
      ),
      owner: escapeHtml(stadion.owner.full_name),
      phone: escapeHtml(stadion.owner.phone),
      price: formatSum(stadion.price ?? 0),
      maxCount: stadion.max_count,
      length: stadion.length,
      width: stadion.width,
      area: stadion.length * stadion.width,
      paymentType: stadion.payments_type,
      mini: yesNo(Boolean(stadion.mini)),
      stadionMini: yesNo(Boolean(stadion.stadion_mini)),
      workingStatus: t(
        stadion.working_status
          ? 'admin.stadium_list.working_status.active'
          : 'admin.stadium_list.working_status.inactive',
      ),
      status: t(
        `admin.stadium_list.statuses.${stadion.admin_status.toLowerCase()}`,
      ),
      latitude: stadion.latitude,
      longitude: stadion.longitude,
      weekDays,
      offDays,
      specialDays,
      createdAt: formatDateTime(stadion.createdAt, lang),
      updatedAt: formatDateTime(stadion.updatedAt, lang),
    });
  }

  private stadiumActionButtons(
    stadion: { id: number; admin_status: string },
    page: number,
    lang: string,
  ): InlineKeyboardButton[][] {
    const t = this.tr(lang);
    const approve: InlineKeyboardButton = {
      text: t('admin.stadium_list.buttons.approve'),
      callback_data: `stadiumChecking_approved_${stadion.id}_${page}`,
    };
    const reject: InlineKeyboardButton = {
      text: t('admin.stadium_list.buttons.reject'),
      callback_data: `stadiumChecking_rejected_${stadion.id}_${page}`,
    };

    switch (stadion.admin_status) {
      case 'PENDING':
        return [[approve, reject]];
      case 'APPROVED':
        return [[reject]];
      case 'REJECTED':
        return [[approve]];
      default:
        return [];
    }
  }

  private async showStadiumList(
    ctx: MyContext,
    key: keyof typeof STADIUM_LISTS,
    currentPage: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const cfg = STADIUM_LISTS[key];
    const limit = 5;
    const where = { admin_status: cfg.status as AdminStatus };

    const [list, total] = await Promise.all([
      this.prisma.stadion.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (currentPage - 1) * limit,
        take: limit,
      }),
      this.prisma.stadion.count({ where }),
    ]);

    if (!list.length) {
      await ctx.answerCbQuery(t(cfg.empty), { show_alert: true });
      return;
    }

    const totalPages = Math.ceil(total / limit);
    const rows: InlineKeyboardButton[][] = list.map((s) => [
      {
        text: `🏟 ${s.name.length > 30 ? `${s.name.slice(0, 30)}...` : s.name}`,
        callback_data: `stadium_view_${s.id}_${currentPage}`,
      },
    ]);

    if (totalPages > 1) {
      const pagination: InlineKeyboardButton[] = [];
      if (currentPage > 1) {
        pagination.push({
          text: t('stadions.Previous'),
          callback_data: `stadium_${key}_0_${currentPage - 1}`,
        });
      }
      pagination.push({
        text: `📄 ${currentPage}/${totalPages}`,
        callback_data: 'ignore',
      });
      if (currentPage < totalPages) {
        pagination.push({
          text: t('stadions.Next'),
          callback_data: `stadium_${key}_0_${currentPage + 1}`,
        });
      }
      rows.push(pagination);
    }
    rows.push([{ text: t('schedule.back'), callback_data: 'admins_stadiums' }]);

    await this.utils.safeEditOrReply(ctx, t(cfg.title), {
      inline_keyboard: rows,
    });
  }

  private async showOwnerList(
    ctx: MyContext,
    key: keyof typeof OWNER_LISTS,
    currentPage: number,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const cfg = OWNER_LISTS[key];
    const limit = 10;
    const where = { status: cfg.status as Admin_S };

    const [owners, total] = await Promise.all([
      this.prisma.owners.findMany({
        where,
        select: { id: true, full_name: true },
        orderBy: { id: 'asc' },
        skip: (currentPage - 1) * limit,
        take: limit,
      }),
      this.prisma.owners.count({ where }),
    ]);

    if (!owners.length) {
      await ctx.answerCbQuery(t(cfg.empty), { show_alert: true });
      return;
    }

    const totalPages = Math.ceil(total / limit);
    const rows: InlineKeyboardButton[][] = owners.map((o) => [
      {
        text: `👤 ${o.full_name}`,
        callback_data: `AdminPanel_Owner_detels_${o.id}_${currentPage}`,
      },
    ]);

    if (totalPages > 1) {
      const pagination: InlineKeyboardButton[] = [];
      if (currentPage > 1) {
        pagination.push({
          text: t('admin.Previous'),
          callback_data: `AdminPanel_Owner_${key}_0_${currentPage - 1}`,
        });
      }
      pagination.push({
        text: `📄 ${currentPage}/${totalPages}`,
        callback_data: 'ignore',
      });
      if (currentPage < totalPages) {
        pagination.push({
          text: t('admin.Next'),
          callback_data: `AdminPanel_Owner_${key}_0_${currentPage + 1}`,
        });
      }
      rows.push(pagination);
    }
    rows.push([{ text: t('schedule.back'), callback_data: 'admins_owners' }]);

    await this.utils.safeEditOrReply(ctx, t(cfg.title), {
      inline_keyboard: rows,
    });
  }

  // ===================== ADMIN PANELI =====================

  /** Boshqa joydan ham chaqiriladi, shuning uchun o'z try/catch i bor. */
  async admin_paneli(ctx: MyContext, lang: string): Promise<void> {
    try {
      const t = this.tr(lang);
      const owners = await this.prisma.owners.count();
      const btn = (
        key: string,
        callback_data: string,
        args?: Record<string, unknown>,
      ): InlineKeyboardButton => ({ text: t(key, args), callback_data });

      await this.utils.safeEditOrReply(ctx, t('admin.title'), {
        inline_keyboard: [
          [btn('admin.language', 'admins_lang')],
          [
            btn('admin.statistics', 'admins_stats'),
            btn('admin.stadiums', 'admins_stadiums'),
          ],
          [
            btn('admin.bookings', 'admins_bookings'),
            btn('admin.premium', 'admins_premium'),
          ],
          [
            btn('admin.owners', 'admins_owners', { count: owners }),
            btn('admin.broadcast', 'admins_broadcast'),
          ],
        ],
      });
      await this.closeOwnerStadiumDetails(ctx);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.ADMIN);
    }
  }

  async admins_stadiums(
    ctx: MyContext,
    type: string,
    lang: string,
  ): Promise<void> {
    const t = this.tr(lang);
    const back = (callback_data = 'admin_back_1'): InlineKeyboardButton[] => [
      { text: t('schedule.back'), callback_data },
    ];

    switch (type) {
      case 'lang':
        await this.utils.safeEditOrReply(ctx, t('common.START'), {
          inline_keyboard: [
            [{ text: `🇺🇿 O'zbekcha`, callback_data: 'lang_uz' }],
            [{ text: `🇷🇺 Русский`, callback_data: 'lang_ru' }],
            [{ text: `🇬🇧 English`, callback_data: 'lang_en' }],
          ],
        });
        return;

      // hozircha tayyor emas: vaqtinchalik matnlar
      case 'stats':
        await ctx.reply('Statistika');
        return;
      case 'bookings':
        await ctx.reply('Bookings');
        return;
      case 'premium':
        await ctx.reply('Premium');
        return;
      case 'broadcast':
        await ctx.reply('Habar yuborish');
        return;

      case 'stadiums': {
        const [pending, approved, rejected] = await Promise.all(
          (['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) =>
            this.prisma.stadion.count({ where: { admin_status: s } }),
          ),
        );
        await this.utils.safeEditOrReply(ctx, t('admin.stadium.title'), {
          inline_keyboard: [
            [
              {
                text: t('admin.stadium.pending', { count: pending }),
                callback_data: 'stadium_pending_0_1',
              },
            ],
            [
              {
                text: t('admin.stadium.approved', { count: approved }),
                callback_data: 'stadium_approved_0_1',
              },
            ],
            [
              {
                text: t('admin.stadium.rejected', { count: rejected }),
                callback_data: 'stadium_rejected_0_1',
              },
            ],
            back(),
          ],
        });
        return;
      }

      case 'owners': {
        const [active, blocked, pending] = await Promise.all(
          (['ACTIVE', 'BLOCKED', 'PENDING'] as const).map((s) =>
            this.prisma.owners.count({ where: { status: s } }),
          ),
        );
        await this.utils.safeEditOrReply(ctx, t('admin.owner.title'), {
          inline_keyboard: [
            [
              {
                text: t('admin.owner.pending', { count: pending }),
                callback_data: 'AdminPanel_Owner_pending_0_1',
              },
            ],
            [
              {
                text: t('admin.owner.active', { count: active }),
                callback_data: 'AdminPanel_Owner_active_0_1',
              },
            ],
            [
              {
                text: t('admin.owner.blocked', { count: blocked }),
                callback_data: 'AdminPanel_Owner_blocked_0_1',
              },
            ],
            [
              {
                text: t('admin.owner.search'),
                callback_data: 'AdminPanel_Owner_search_0_1',
              },
            ],
            back(),
          ],
        });
        return;
      }

      default:
        throw new Error(`admins_stadiums: noma'lum type: ${type}`);
    }
  }

  // ===================== STADIONLAR =====================

  async stadium_status(
    ctx: MyContext,
    status: string,
    Id: number,
    page: string,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const currentPage = Math.max(1, Number(page) || 1);

    // ro'yxatlarga qaytilganda egasi tafsilotlari holati eskirib qolmasin
    this.resetOwnerDetailsSession(ctx);

    if (
      status === 'pending' ||
      status === 'approved' ||
      status === 'rejected'
    ) {
      await this.showStadiumList(ctx, status, currentPage, lang);
      return;
    }

    if (status === 'view') {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: Id },
        include: STADIUM_DETAILS_INCLUDE,
      });
      if (!stadion) {
        await ctx.answerCbQuery(t('admin.not_found'), { show_alert: true });
        return;
      }

      await this.utils.safeEditOrReply(
        ctx,
        this.buildStadiumDetails(stadion, lang),
        {
          inline_keyboard: [
            ...this.stadiumActionButtons(stadion, currentPage, lang),
            [
              {
                text: t('schedule.back'),
                callback_data: `stadium_${stadion.admin_status.toLowerCase()}_0_${currentPage}`,
              },
            ],
          ],
        },
      );
      return;
    }

    throw new Error(`stadium_status: noma'lum status: ${status}`);
  }

  async status_Checking(
    ctx: MyContext,
    status: string,
    stadionId: number,
    page: number,
  ): Promise<void> {
    if (status !== 'approved' && status !== 'rejected') {
      throw new Error(`status_Checking: noma'lum status: ${status}`);
    }

    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);

    const stadion = await this.prisma.stadion.findUnique({
      where: { id: stadionId },
      select: { id: true },
    });
    if (!stadion) throw new Error(`Stadion topilmadi: id=${stadionId}`);

    const isApprove = status === 'approved';
    const text = t(
      isApprove
        ? 'admin.stadium_list.approve_confirm'
        : 'admin.stadium_list.reject_confirm',
    );
    const confirmBtn: InlineKeyboardButton = {
      text: t(
        isApprove
          ? 'admin.stadium_list.buttons.approve'
          : 'admin.stadium_list.buttons.reject',
      ),
      callback_data: `stadiumConfirm_${status}_${stadion.id}`,
    };

    const { admin_step, ownerId, currentPage } = ctx.session;
    const fromOwnerDetails =
      admin_step === 'owner_stadion_details' &&
      Boolean(ownerId) &&
      Boolean(currentPage);

    if (fromOwnerDetails) {
      if (ctx.session.confirment_messageId) {
        await ctx
          .deleteMessage(ctx.session.confirment_messageId)
          .catch(() => undefined);
      }
      await this.clearAdminDetailMessages(ctx);

      const sent = await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              confirmBtn,
              {
                text: t('schedule.back'),
                callback_data: `AdminOwnerStadium_detail_${stadionId}_${ownerId}_${currentPage}_${page}`,
              },
            ],
          ],
        },
      });
      ctx.session.confirment_messageId = sent.message_id;
      return;
    }

    await this.utils.safeEditOrReply(ctx, text, {
      inline_keyboard: [
        [
          confirmBtn,
          {
            text: t('schedule.back'),
            callback_data: `stadium_view_${stadion.id}_${page}`,
          },
        ],
      ],
    });
  }

  async stadiumConfirm(
    ctx: MyContext,
    status: string,
    stadionId: number,
  ): Promise<void> {
    if (status !== 'approved' && status !== 'rejected') {
      throw new Error(`stadiumConfirm: noma'lum status: ${status}`);
    }
    const t = this.tr(await this.utils.langs(ctx));
    const isApproved = status === 'approved';

    await this.prisma.stadion.update({
      where: { id: stadionId },
      data: { admin_status: isApproved ? 'APPROVED' : 'REJECTED' },
    });
    await ctx
      .answerCbQuery(
        t(
          isApproved
            ? 'admin.stadium_list.approved_success'
            : 'admin.stadium_list.rejected_success',
        ),
        { show_alert: true },
      )
      .catch(() => undefined);

    const { admin_step, ownerId, currentPage, historyPage } = ctx.session;
    if (
      admin_step === 'owner_stadion_details' &&
      ownerId &&
      currentPage &&
      historyPage
    ) {
      if (ctx.session.confirment_messageId) {
        await ctx
          .deleteMessage(ctx.session.confirment_messageId)
          .catch(() => undefined);
        ctx.session.confirment_messageId = null;
      }
      await this.admin_stadions_details(
        ctx,
        stadionId,
        ownerId,
        currentPage,
        historyPage,
      );
      return;
    }

    await this.stadium_status(ctx, status, stadionId, '1');
  }

  async admin_stadions_details(
    ctx: MyContext,
    stadionId: number,
    ownerId: number,
    currentPage: string,
    historyPage: string,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);

    const stadion = await this.prisma.stadion.findFirst({
      where: { id: stadionId, owner_id: ownerId },
      include: STADIUM_DETAILS_INCLUDE,
    });
    if (!stadion) {
      await ctx.answerCbQuery(t('admin.not_found'), { show_alert: true });
      return;
    }

    const text = this.buildStadiumDetails(stadion, lang);
    const reply_markup = {
      inline_keyboard: [
        ...this.stadiumActionButtons(stadion, Number(historyPage) || 1, lang),
        [{ text: t('schedule.back'), callback_data: 'admin_back_2' }],
      ],
    };
    if (ctx.session.confirment_messageId) {
      await ctx
        .deleteMessage(ctx.session.confirment_messageId)
        .catch(() => undefined);
      ctx.session.confirment_messageId = null;
    }
    await this.clearAdminDetailMessages(ctx);

    let sent: { message_id: number } | null = null;
    if (stadion.image && text.length <= 1024) {
      sent = await ctx
        .replyWithPhoto(stadion.image, {
          caption: text,
          parse_mode: 'HTML',
          reply_markup,
        })
        .catch(() => null);
    }
    if (!sent) {
      if (stadion.image) {
        const photo = await ctx.replyWithPhoto(stadion.image).catch(() => null);
        ctx.session.admin_photoMessageId = photo?.message_id ?? null;
      }
      sent = await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }

    ctx.session.admin_messageId = sent.message_id;
    ctx.session.admin_step = 'owner_stadion_details';
    ctx.session.ownerId = ownerId;
    ctx.session.currentPage = currentPage;
    ctx.session.historyPage = historyPage;
  }


  async AdminPanel_owner(
    ctx: MyContext,
    status: string,
    ownerId: number,
    page: number,
    action?: 'activate' | 'block',
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const currentPage = Math.max(1, Number(page) || 1);

    const loadOwner = async () => {
      const owner = await this.prisma.owners.findUnique({
        where: { id: ownerId },
        select: { id: true, status: true, full_name: true },
      });
      if (!owner) throw new Error(`Owner topilmadi: id=${ownerId}`);
      return owner;
    };

    switch (status) {
      case 'pending':
      case 'active':
      case 'blocked':
        await this.showOwnerList(ctx, status, currentPage, lang);
        return;

      case 'search': {
        const sent = await ctx.reply(t('admin.search_prompt'));
        ctx.session.adminOwnerSearch = {
          active: true,
          promptMessageId: sent.message_id,
        };
        return;
      }

      case 'detels': {
        const [owner, bookingCount] = await Promise.all([
          this.prisma.owners.findUnique({
            where: { id: ownerId },
            include: {
              subscriptions: {
                where: { isActive: true },
                select: { id: true },
              },
              _count: { select: { stadions: true } },
            },
          }),
          this.prisma.booking.count({
            where: { stadion: { owner_id: ownerId } },
          }),
        ]);
        if (!owner) throw new Error(`Owner topilmadi: id=${ownerId}`);

        const hasActivePremium = owner.subscriptions.length > 0;
        const text = t('admin.details', {
          id: owner.id,
          fullName: escapeHtml(owner.full_name),
          phone: escapeHtml(owner.phone),
          email: escapeHtml(owner.email ?? t('admin.email_empty')),
          stadiumCount: owner._count.stadions,
          bookingCount,
          premium: t(
            hasActivePremium
              ? 'admin.Premium.active'
              : 'admin.Premium.inactive',
          ),
          status: t(`admin.status.${owner.status.toLowerCase()}`),
        });

        const statusBtn = (
          act: 'activate' | 'block',
        ): InlineKeyboardButton => ({
          text: t(
            act === 'block' ? 'admin.buttons.block' : 'admin.buttons.activate',
          ),
          callback_data: `AdminPanel_Owner_status_${act}_${owner.id}_${currentPage}`,
        });
        const statusButtons: InlineKeyboardButton[][] =
          owner.status === 'PENDING'
            ? [[statusBtn('activate'), statusBtn('block')]]
            : owner.status === 'ACTIVE'
              ? [[statusBtn('block')]]
              : [[statusBtn('activate')]];

        const canDelete =
          owner.status === 'BLOCKED' || owner.status === 'PENDING';

        await this.utils.safeEditOrReply(ctx, text, {
          inline_keyboard: [
            [
              {
                text: t('admin.buttons.stadiums'),
                callback_data: `AdminOwner_stadiums_${owner.id}_${currentPage}_1`,
              },
            ],
            [
              {
                text: t('admin.buttons.premium'),
                callback_data: `AdminOwner_premium_${owner.id}_${currentPage}_1`,
              },
            ],
            ...statusButtons,
            ...(canDelete
              ? [
                  [
                    {
                      text: t('admin.buttons.delete'),
                      callback_data: `AdminPanel_Owner_delete_${owner.id}_${currentPage}`,
                    },
                  ],
                ]
              : []),
            [
              {
                text: t('schedule.back'),
                callback_data: `AdminPanel_Owner_${owner.status.toLowerCase()}_${owner.id}_${currentPage}`,
              },
            ],
          ],
        });
        return;
      }

      case 'status': {
        if (!action)
          throw new Error(`AdminPanel_owner: status uchun action yo'q`);
        const owner = await loadOwner();
        const isBlock = action === 'block';

        await this.utils.safeEditOrReply(
          ctx,
          t(isBlock ? 'admin.confirm.block' : 'admin.confirm.activate', {
            fullName: escapeHtml(owner.full_name),
          }),
          {
            inline_keyboard: [
              [
                {
                  text: t(
                    isBlock
                      ? 'admin.confirm.buttons.confirm_block'
                      : 'admin.confirm.buttons.confirm_activate',
                  ),
                  callback_data: `AdminPanel_Owner_confirm_${action}_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: t('schedule.back'),
                  callback_data: `AdminPanel_Owner_detels_${owner.id}_${currentPage}`,
                },
              ],
            ],
          },
        );
        return;
      }

      case 'confirm': {
        if (!action)
          throw new Error(`AdminPanel_owner: confirm uchun action yo'q`);
        const owner = await loadOwner();

        const updated = await this.prisma.owners.update({
          where: { id: owner.id },
          data: { status: action === 'block' ? 'BLOCKED' : 'ACTIVE' },
        });

        await ctx
          .answerCbQuery(
            t(
              updated.status === 'ACTIVE'
                ? 'admin.status_updated.active'
                : 'admin.status_updated.blocked',
              { fullName: owner.full_name },
            ),
          )
          .catch(() => undefined);
        await this.AdminPanel_owner(ctx, 'detels', updated.id, currentPage);
        return;
      }

      case 'delete': {
        const owner = await loadOwner();
        if (owner.status === 'ACTIVE') {
          throw new Error(`Faol egani o'chirishga urinish: owner=${owner.id}`);
        }

        await this.utils.safeEditOrReply(
          ctx,
          t('admin.delete_confirm.message', {
            fullName: escapeHtml(owner.full_name),
          }),
          {
            inline_keyboard: [
              [
                {
                  text: t('admin.delete_confirm.confirm'),
                  callback_data: `AdminPanel_Owner_deletConfirm_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: t('schedule.back'),
                  callback_data: `AdminPanel_Owner_detels_${owner.id}_${currentPage}`,
                },
              ],
            ],
          },
        );
        return;
      }

      case 'deletConfirm': {
        const owner = await loadOwner();
        if (owner.status === 'ACTIVE') {
          throw new Error(`Faol egani o'chirishga urinish: owner=${owner.id}`);
        }

        await this.prisma.owners.delete({ where: { id: owner.id } });

        await ctx
          .answerCbQuery(
            t('admin.status_updated.deleted', { fullName: owner.full_name }),
          )
          .catch(() => undefined);

        const blockedCount = await this.prisma.owners.count({
          where: { status: 'BLOCKED' },
        });
        if (blockedCount > 0) {
          await this.showOwnerList(ctx, 'blocked', 1, lang);
        } else {
          await this.admins_stadiums(ctx, 'owners', lang);
        }
        return;
      }

      default:
        throw new Error(`AdminPanel_owner: noma'lum status: ${status}`);
    }
  }

  async handleAdminOwnerSearchText(
    ctx: MyContext,
    rawQuery: string,
  ): Promise<void> {
    try {
      const lang = await this.utils.langs(ctx);
      const t = this.tr(lang);

      const query = rawQuery.trim().slice(0, 100);
      if (!query) {
        await ctx.reply(t('admin.owner.search_empty_query'));
        return;
      }

      const idAsNumber = Number(query);
      const isNumericQuery =
        Number.isInteger(idAsNumber) &&
        idAsNumber > 0 &&
        idAsNumber <= 2_147_483_647;

      // juda qisqa raqam (1-3 xona) har bir telefonga mos kelmasin
      const digitsOnly = query.replace(/\D/g, '');
      const phoneCandidates = new Set<string>();
      if (digitsOnly.length >= 4) {
        phoneCandidates.add(digitsOnly);
        if (digitsOnly.length === 9) {
          phoneCandidates.add(`998${digitsOnly}`);
        } else if (digitsOnly.length === 12 && digitsOnly.startsWith('998')) {
          phoneCandidates.add(digitsOnly.slice(3));
        }
      }

      const owners = await this.prisma.owners.findMany({
        where: {
          OR: [
            { full_name: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            ...Array.from(phoneCandidates).map((phone) => ({
              phone: { contains: phone },
            })),
            ...(isNumericQuery ? [{ id: idAsNumber }] : []),
          ],
        },
        select: { id: true, full_name: true, status: true },
        take: 10,
        orderBy: { id: 'asc' },
      });

      if (!owners.length) {
        await ctx.reply(t('admin.search_not_found', { query }));
        return;
      }

      const statusEmoji: Record<string, string> = {
        ACTIVE: '🟢',
        PENDING: '🟡',
        BLOCKED: '🔴',
      };
      const buttons: InlineKeyboardButton[][] = owners.map((item) => [
        {
          text: `${statusEmoji[item.status] ?? '👤'} ${item.full_name}`,
          callback_data: `AdminPanel_Owner_detels_${item.id}_1`,
        },
      ]);
      buttons.push([
        { text: t('schedule.back'), callback_data: 'admins_owners' },
      ]);

      await ctx.reply(t('admin.search_results', { count: owners.length }), {
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.ADMIN);
    }
  }

  async AdminOwner_select(
    ctx: MyContext,
    status: string,
    ownerId: number,
    currentPage: number,
    historyPage: number,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const limit = 5;
    const histPage = Math.max(1, historyPage || 1);
    const back = (callback_data: string): InlineKeyboardButton[] => [
      { text: t('schedule.back'), callback_data },
    ];

    switch (status) {
      case 'premium': {
        const owner = await this.prisma.owners.findUnique({
          where: { id: ownerId },
          include: { subscriptions: { where: { isActive: true }, take: 1 } },
        });
        if (!owner) throw new Error(`Owner topilmadi: id=${ownerId}`);

        const premium = owner.subscriptions[0];
        const statistics = premium
          ? await this.prisma.premiumTransaction.groupBy({
              by: ['reason'],
              where: {
                owner_id: owner.id,
                subscription_id: premium.id,
                status: 'SUCCESS',
              },
              _sum: { duration: true },
            })
          : [];

        const statKeys: Array<[string, PremiumReason]> = [
          ['purchase', PremiumReason.PURCHASE],
          ['gift', PremiumReason.GIFT],
          ['compensation', PremiumReason.COMPENSATION],
          ['trial', PremiumReason.TRIAL],
        ];
        const statisticsText = statKeys.flatMap(([key, reason]) => {
          const days =
            statistics.find((i) => i.reason === reason)?._sum.duration ?? 0;
          return days > 0
            ? [t(`admin.premiums.statistics.${key}`, { days })]
            : [];
        });

        const text = premium
          ? t('admin.premiums.details_active', {
              owner: escapeHtml(owner.full_name),
              plan: PLAN_LABELS[lang][premium.plan],
              startDate: formatDateTime(premium.startDate, lang),
              endDate: formatDateTime(premium.endDate, lang),
              statistics: statisticsText.join('\n\n'),
            })
          : t('admin.premiums.details_inactive', {
              owner: escapeHtml(owner.full_name),
            });

        await this.utils.safeEditOrReply(ctx, text, {
          inline_keyboard: [
            [
              {
                text: t('admin.premiums.buttons.gift'),
                callback_data: `AdminOwner_gift_${owner.id}_${currentPage}_1`,
              },
            ],
            [
              {
                text: t('admin.premiums.buttons.history'),
                callback_data: `AdminOwner_history_${owner.id}_${currentPage}_1`,
              },
            ],
            back(`AdminPanel_Owner_detels_${owner.id}_${currentPage}`),
          ],
        });
        return;
      }

      case 'history': {
        const where = { ownerId, isActive: false };
        const [history, total] = await Promise.all([
          this.prisma.subscription.findMany({
            where,
            include: {
              premiumTransactions: {
                where: { status: TransactionStatus.SUCCESS },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { endDate: 'desc' },
            skip: (histPage - 1) * limit,
            take: limit,
          }),
          this.prisma.subscription.count({ where }),
        ]);

        if (!history.length) {
          await ctx.answerCbQuery(t('admin.premium_history.history.empty'), {
            show_alert: true,
          });
          return;
        }

        const totalPages = Math.ceil(total / limit);
        const historyText = history
          .map((item, index) => {
            const transaction = item.premiumTransactions[0];
            const isAdminGift = item.reason !== PremiumReason.PURCHASE;

            const providerLabel = isAdminGift
              ? t('admin.premium_history.provider.admin')
              : transaction?.provider
                ? `${transaction.provider}`
                : t('admin.premium_history.provider.unknown');

            return t('admin.premium_history.history.item', {
              index: (histPage - 1) * limit + index + 1,
              plan: PLAN_LABELS[lang][item.plan],
              reason: getPremiumReasonText(item.reason, this.i18n, lang),
              startDate: formatDateTime(item.startDate, lang),
              endDate: formatDateTime(item.endDate, lang),
              amount: transaction
                ? `${formatSum(transaction.amount)} ${t('admin.premium_history.currency')}`
                : t('admin.premium_history.free'),
              provider: providerLabel,
            });
          })
          .join('\n\n━━━━━━━━━━━━━━━\n\n');

        const pagination: InlineKeyboardButton[] = [];
        if (histPage > 1) {
          pagination.push({
            text: t('admin.Previous'),
            callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${histPage - 1}`,
          });
        }
        pagination.push({
          text: `${histPage}/${totalPages}`,
          callback_data: 'ignore',
        });
        if (histPage < totalPages) {
          pagination.push({
            text: t('admin.Next'),
            callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${histPage + 1}`,
          });
        }

        await this.utils.safeEditOrReply(
          ctx,
          t('admin.premium_history.history.title', { history: historyText }),
          {
            inline_keyboard: [
              ...(totalPages > 1 ? [pagination] : []),
              back(`AdminOwner_premium_${ownerId}_${currentPage}_1`),
            ],
          },
        );
        return;
      }

      case 'gift': {
        const reasons: PremiumReason[] = [
          PremiumReason.GIFT,
          PremiumReason.COMPENSATION,
          PremiumReason.TRIAL,
        ];
        const rows: InlineKeyboardButton[][] = reasons.map((reason) => [
          {
            text: getPremiumReasonText(reason, this.i18n, lang),
            callback_data: `ownerPremiumReason_${reason}_${ownerId}_${currentPage}`,
          },
        ]);
        rows.push(
          back(`AdminOwner_premium_${ownerId}_${currentPage}_${histPage}`),
        );

        await this.utils.safeEditOrReply(ctx, t('admin.gift.title'), {
          inline_keyboard: rows,
        });
        return;
      }

      case 'stadiums': {
        const where = { owner_id: ownerId };
        const [stadions, total] = await Promise.all([
          this.prisma.stadion.findMany({
            where,
            select: { id: true, name: true },
            orderBy: { id: 'asc' },
            skip: (histPage - 1) * limit,
            take: limit,
          }),
          this.prisma.stadion.count({ where }),
        ]);

        if (!stadions.length) {
          await ctx.answerCbQuery(t('admin.owner_stadiums.empty'), {
            show_alert: true,
          });
          return;
        }

        const totalPages = Math.ceil(total / limit);
        const rows: InlineKeyboardButton[][] = stadions.map((s) => [
          {
            text: `🏟 ${s.name.length > 25 ? `${s.name.slice(0, 25)}...` : s.name}`,
            callback_data: `AdminOwnerStadium_detail_${s.id}_${ownerId}_${currentPage}_${histPage}`,
          },
        ]);

        if (totalPages > 1) {
          const pagination: InlineKeyboardButton[] = [];
          if (histPage > 1) {
            pagination.push({
              text: t('admin.Previous'),
              callback_data: `AdminOwner_stadiums_${ownerId}_${currentPage}_${histPage - 1}`,
            });
          }
          pagination.push({
            text: `${histPage}/${totalPages}`,
            callback_data: 'ignore',
          });
          if (histPage < totalPages) {
            pagination.push({
              text: t('admin.Next'),
              callback_data: `AdminOwner_stadiums_${ownerId}_${currentPage}_${histPage + 1}`,
            });
          }
          rows.push(pagination);
        }
        rows.push(back(`AdminPanel_Owner_detels_${ownerId}_${currentPage}`));

        await this.utils.safeEditOrReply(ctx, t('admin.owner_stadiums.title'), {
          inline_keyboard: rows,
        });
        return;
      }

      default:
        throw new Error(`AdminOwner_select: noma'lum status: ${status}`);
    }
  }


  async ownerPremiumReason(
    ctx: MyContext,
    reason: string,
    ownerId: number,
    currentPage: number,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const option = (key: string, days: number): InlineKeyboardButton => ({
      text: t(`admin.gift.duration.${key}`),
      callback_data: `ownerPremiumGift_${days}_${ownerId}_${currentPage}_${reason}`,
    });

    await this.utils.safeEditOrReply(ctx, t('admin.gift.duration.title'), {
      inline_keyboard: [
        [option('week_1', 7), option('month_1', 30)],
        [option('month_3', 90), option('month_6', 180)],
        [option('year_1', 365)],
        [
          {
            text: t('schedule.back'),
            callback_data: `AdminOwner_gift_${ownerId}_${currentPage}_1`,
          },
        ],
      ],
    });
  }

  async ownerPremiumGift(
    ctx: MyContext,
    days: number,
    ownerId: number,
    currentPage: number,
    reason: PremiumReason,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const plan = this.planForDays(days);

    const owner = await this.prisma.owners.findUnique({
      where: { id: ownerId },
      select: { id: true, full_name: true },
    });
    if (!owner) throw new Error(`Owner topilmadi: id=${ownerId}`);

    const premium = await this.prisma.subscription.findFirst({
      where: { ownerId, isActive: true },
      select: { id: true },
    });

    await this.utils.safeEditOrReply(
      ctx,
      t('admin.confirm_gift.text', {
        owner: escapeHtml(owner.full_name),
        plan: PLAN_LABELS[lang][plan],
        premiumInfo: t(
          premium
            ? 'admin.confirm_gift.has_premium'
            : 'admin.confirm_gift.no_premium',
        ),
      }),
      {
        inline_keyboard: [
          [
            {
              text: t('admin.confirm_gift.confirm'),
              callback_data: `AdminOwnerConfirmGift_${days}_${owner.id}_${currentPage}_${reason}`,
            },
          ],
          [
            {
              text: t('admin.confirm_gift.cancel'),
              callback_data: `AdminOwner_premium_${owner.id}_${currentPage}_1`,
            },
          ],
        ],
      },
    );
  }

  async AdminOwnerConfirmGift(
    ctx: MyContext,
    days: number,
    ownerId: number,
    currentPage: number,
    reason: PremiumReason,
  ): Promise<void> {
    const lang = await this.utils.langs(ctx);
    const t = this.tr(lang);
    const plan = this.planForDays(days);

    const owner = await this.prisma.owners.findUnique({
      where: { id: ownerId },
      select: { id: true, full_name: true, chatID: true },
    });
    if (!owner) throw new Error(`Owner topilmadi: id=${ownerId}`);

    await this.prisma.$transaction(async (tx) => {
      const active = await tx.subscription.findFirst({
        where: { ownerId, isActive: true },
      });

      let subscriptionId: number;
      if (active) {
        // muddati o'tib ketgan (lekin hali o'chirilmagan) obunaga ham sovg'a ta'sir qilsin
        const now = new Date();
        const base = active.endDate > now ? active.endDate : now;
        await tx.subscription.update({
          where: { id: active.id },
          data: { endDate: new Date(base.getTime() + days * DAY_MS) },
        });
        subscriptionId = active.id;
      } else {
        const startDate = new Date();
        const created = await tx.subscription.create({
          data: {
            ownerId,
            plan,
            startDate,
            endDate: new Date(startDate.getTime() + days * DAY_MS),
            isActive: true,
            reason,
          },
        });
        subscriptionId = created.id;
      }

      await tx.premiumTransaction.create({
        data: {
          owner_id: ownerId,
          subscription_id: subscriptionId,
          plan,
          duration: days,
          amount: 0,
          reason,
          status: TransactionStatus.SUCCESS,
        },
      });
    });

    await ctx
      .answerCbQuery(
        t('admin.gift_success', {
          owner: owner.full_name,
          plan: PLAN_LABELS[lang][plan],
        }),
        { show_alert: true },
      )
      .catch(() => undefined);

    await this.notifyOwnerAboutGift(owner, plan);
    await this.AdminOwner_select(ctx, 'premium', owner.id, currentPage, 1);
  }

  private async notifyOwnerAboutGift(
    owner: { id: number; chatID: string },
    plan: PremiumPlan,
  ): Promise<void> {
    try {
      const translations = Object.fromEntries(
        NOTIFY_LANGS.map((l) => [
          l,
          {
            title: this.i18n.translate(
              'admin.notification.premium_gift.title',
              {
                lang: l,
              },
            ),
            message: this.i18n.translate(
              'admin.notification.premium_gift.message',
              {
                lang: l,
                args: { plan: PLAN_LABELS[l][plan] },
              },
            ),
          },
        ]),
      );

      const notification = await this.prisma.notification.create({
        data: {
          ownerId: owner.id,
          type: NotificationType.PREMIUM_EXPIRY,
          translations,
        },
      });
      await this.notificationService.sendNotification(
        owner.chatID,
        notification.id,
      );
    } catch (error) {
      this.logger.error(
        `Premium bildirishnomasi yuborilmadi: owner=${owner.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
