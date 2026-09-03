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
  Payments,
  PremiumReason,
  Prisma,
} from '@prisma/client';
import {
  helpMenuKeyboard_Owner,
  helpMenuKeyboard_Users,
} from 'src/helpers/Inline_keybort';
import { UtilisService } from 'src/utils/utile.service';
import { format, subDays } from 'date-fns';
import { QrService } from 'src/qr/qr.service';
import {
  CURRENCY_LABELS,
  EStadion_type,
  getPremiumPaymentDescription,
  IBooking,
  INITIAL_SESSION,
  PLAN_LABELS,
  PREMIUM_PLANS,
  Premium_price,
  PremiumPlan,
} from 'src/helpers/interface';
import { getRelatedStadionIds, getStadionIds } from 'src/helpers/stadions';
import { statusMap } from 'src/helpers/bookingStatus';
import {
  DefaultNotificationSettings,
  NotificationNames,
  NotificationSettings_type,
} from 'src/types/notifikation';
import { PAYMENT_PROVIDERS } from 'src/helpers/provider';
import {
  PAYMENT_URL_GENERATORS,
  PaymentProvider,
} from 'src/helpers/url_wrapper';
import { AdminService } from 'src/admin/admin.service';
import { formatDate } from 'src/helpers/dateFormat';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import { addPaymentCommission } from 'src/helpers/kommisiya';

@Update()
export class BotUpdate {
  private readonly AdminChatid = (process.env.ADMIN_CHAT_ID ?? '')
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
  ) {}

  @Start()
  async onStart(@Ctx() ctx: any) {
    ctx.session = structuredClone(INITIAL_SESSION);

    const payload = ctx.payload;
    if (payload?.startsWith('stadionBooking_')) {
      return this.botService.handlePayload(ctx, payload);
    }
    if (payload?.startsWith('payment_success_')) {
    return this.botService.handlePayloadSucces(ctx,payload)
  }

    const data = await this.prisma.sesion.findUnique({
      where: { chat_id: String(ctx.from?.id) },
    });
    if (data) {
      ctx.session.lang = data.lang;
      return this.botService.checket(ctx);
    }
    return this.botService.start(ctx);
  }
  @Action(/lang_(.+)/)
  async language(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      ctx.session = ctx.session || {};
      const lang = (ctx.callbackQuery?.data).split('_')[1];
      const data = await this.prisma.sesion.findUnique({
        where: { chat_id: String(ctx.from?.id) },
      });
      if (!data) {
        await this.prisma.sesion.create({
          data: { chat_id: String(ctx.from?.id), lang },
        });
        ctx.session.lang = lang;
      } else {
        const updateLang = await this.prisma.sesion.update({
          where: { id: data.id },
          data: { lang },
        });
        ctx.session.lang = updateLang.lang;
      }
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.session.step === 'language') {
      try {
        const owner = await this.prisma.owners.findUnique({
          where: { chatID: String(ctx.from?.id) },
        });
        if (!owner) {
          ctx.reply(this.i18n.translate('error.error', { lang }));
          return;
        }

        ctx.reply(this.i18n.translate('settings.title', { lang }), {
          reply_markup: {
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
                  text: this.i18n.translate('settings.notification', { lang }),
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
        });
        return;
      } catch (error) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
      }
    } else if (ctx.session.step === 'user_langs') {
      return this.userService.settings(ctx, lang);
    } else if (ctx.session.advertisement_step === 'advertisement') {
      ctx.session.advertisement_step = 'advertisement_register';
      return this.userService.registor(ctx, lang);
    } else {
      return this.botService.checket(ctx);
    }
  }

  @Action(/check_required_channels/)
  async check_required_channels(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery().catch(() => {});
    return this.botService.checket(ctx);
  }

  @Action(/errorBack_(.+)$/)
  async errorBack(@Ctx() ctx: MyContext) {
    ctx.session = structuredClone(INITIAL_SESSION);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, errorId] = ctx.callbackQuery?.data.split('_');
      switch (errorId) {
        case '1': {
          return this.botService.checket(ctx);
        }
      }
    }
  }
  @Action(/delete_stadion_fovorite_(\d+)$/)
  async deletStadion(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, type, id] = ctx.callbackQuery.data.split('_');
        if (type === 'fovorite') {
          await this.prisma.myFavoriteStadium.delete({
            where: {
              chat_id_stadion_id: {
                chat_id: String(ctx.from?.id),
                stadion_id: Number(id),
              },
            },
          });
          await ctx.deleteMessage();
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      ctx.answerCbQuery().catch(() => {});
    }
  }
  @Action(/^bookingStadium_(\d+)_(\d+)_(\d+)$/)
  async bookingStadium(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const [, stadionId] = ctx.callbackQuery.data.split('_');

    const lang = await this.utils.langs(ctx);

    const stadion = await this.prisma.stadion.findUnique({
      where: {
        id: Number(stadionId),
      },
      include: {
        region: true,
        region_items: true,
      },
    });

    if (!stadion) {
      await this.utils.errorFunction(ctx);
      return;
    }

    await this.userService.stadionAll_data(ctx, lang, stadion);
  }

  ////////////////////////⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️⬇️///////////////////////////////

  @Action(/Newbooking_(\w+)_(\d+)_(\w+)$/)
  async Newbooking(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const [_, type, Id, lang] = ctx.callbackQuery.data.split('_');
      switch (type) {
        case 'owners': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: Number(Id) },
          });
          if (!owner || String(ctx.from?.id) !== owner.chatID) {
            await ctx.answerCbQuery(
              this.i18n.translate('admin.access_denied', { lang }),
              { show_alert: true },
            );
            return;
          }
          try {
            await ctx.editMessageText(
                this.i18n.translate("admin.booking.enter_name",{lang}),
              );
            } catch (error) {
           const sent = await ctx.reply(this.i18n.translate("admin.booking.enter_name",{lang}))
           ctx.session.admin_booking_messages ??= []
           ctx.session.admin_booking_messages.push(sent.message_id)
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

          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }
          const stadions = await this.prisma.stadion.findMany({
            where: { owner_id: Number(Id) },
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

          break;
        }
        case 'stadions': {
          ctx.session.admin_step = 'NewBooking_owners';
          return this.userService.userbookingStadion(ctx, lang, Number(Id));
        }
        default: {
          await this.utils.errorFunction(ctx);
          break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
      console.log(error);
    }
  }
  @Action(/ownerBooking_(.+)_(\d+)_(\d+)$/)
  async ownerBooking(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);

      const data = (ctx.callbackQuery as any).data.split('_');
      const type = data[1];
      const ownerId = data[2];
      const pageStr = data[3];

      const page = Number(pageStr);
      const limit = 1;

      const where: Prisma.BookingWhereInput = {
        stadion: {
          owner_id: Number(ownerId),
        },
      };
      let orderBy: Prisma.BookingOrderByWithRelationInput = {
        createdAt: 'desc',
      };

      if (type === 'active') {
        where.status = { in: ['PAID', 'CONFIRMED'] };
        orderBy = {
          startAt: 'asc',
        };
      }
      if (type === 'pending') {
        where.status = 'PENDING';
        orderBy = {
          startAt: 'asc',
        };
      }
      if (['today', 'tomorrow'].includes(type)) {
        const now = new Date();

        const base = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
        );
        console.log('base', base);

        if (type === 'tomorrow') {
          base.setDate(base.getDate() + 1);
        }
        where.status = { in: ['PAID', 'CONFIRMED', 'PENDING', 'COMPLETED'] };
        where.date = base;
        orderBy = {
          startAt: 'asc',
        };
      }
      if (type === 'cancelled') {
        where.status = 'CANCELED';
        orderBy = {
          startAt: 'asc',
        };
      }
      if (type === 'upcoming') {
        const now = new Date();
        const in5Hours = new Date(now.getTime() + 5 * 60 * 60 * 1000);

        where.status = { in: ['PAID', 'CONFIRMED'] };
        where.startAt = {
          gte: now,
          lte: in5Hours,
        };
        orderBy = {
          startAt: 'asc',
        };
      }
      if (type === 'now') {
        const now = new Date();
        where.startAt = {
          lte: now,
        };
        where.endAt = {
          gte: now,
        };
        where.status = { in: ['PAID', 'CONFIRMED'] };
        orderBy = {
          startAt: 'asc',
        };
      }

      const [bookings, total] = await Promise.all([
        this.prisma.booking.findMany({
          where,
          include: {
            stadion: {
              include: {
                region: true,
                region_items: true,
              },
            },
            user: true,
          },
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.booking.count({ where }),
      ]);

      if (!bookings.length) {
        await ctx.answerCbQuery(
          this.i18n.translate(`owner_booking.no_${type}`, { lang }),
          { show_alert: true },
        );
        return;
      }

      await ctx.answerCbQuery(this.i18n.translate('loading.loading', { lang }));

      await this.utils.clearSessionMessages(ctx);

      const callback_data: string = 'ownerBooking';

      await Promise.all(
        bookings.map((item: IBooking) =>
          this.ownerService.sendBookingMessage(
            ctx,
            item,
            page,
            lang,
            type,
            callback_data,
          ),
        ),
      );
      const callback = `ownerBooking_${type}_${ownerId}`;
      await this.utils.sendPagination(ctx, page, total, limit, lang, callback);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/bookingChild_(.+)/)
  async bookingChild(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const data = (ctx.callbackQuery as any).data.split('_');

      const action = data[1];
      const bookingId = Number(data[2]);
      const page = Number(data[3]);
      const type = data[4];
      const callback_data = data[5];

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: true,
          stadion: {
            include: {
              region: true,
              region_items: true,
              owner: { select: { id: true } },
            },
          },
        },
      });

      if (!booking) return this.utils.errorFunction(ctx);

      const isFilterType = ['7days', '30days', 'allFilter'].includes(type);
      const backId = isFilterType
        ? booking.stadion.id
        : booking.stadion.owner.id;
      const backCb = `${callback_data}_${type}_${backId}_${page}`;

      if (action === 'detail') {
        return this.ownerService.bookingDetails(
          ctx,
          booking.id,
          page,
          lang,
          type,
          callback_data,
        );
      }
      if (action === 'checkin') {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.booking.confirm_check_in', {
            lang,
          }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate(
                    'owner_booking.booking.confirm_yes',
                    { lang },
                  ),
                  callback_data: `bookingChild_yesCheckin_${booking.id}_${page}_${type}_${callback_data}`,
                },
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: backCb,
                },
              ],
            ],
          },
        );

        return;
      }
      if (action === 'yesCheckin') {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { check_in: true },
        });

        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.booking.confirm_success', {
            lang,
          }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: backCb,
                },
              ],
            ],
          },
        );

        return;
      }
      if (action === 'cancel') {
        console.log(backCb);

        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.booking.confirm_cancel', { lang }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate(
                    'owner_booking.buttons.confirm_cancel',
                    { lang },
                  ),
                  callback_data: `bookingChild_yesCancel_${booking.id}_${page}_${type}_${callback_data}`,
                },
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: backCb,
                },
              ],
            ],
          },
        );

        return;
      }
      if (action === 'yesCancel') {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELED' },
        });

        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.booking.cancel_success', { lang }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: backCb,
                },
              ],
            ],
          },
        );

        return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      await ctx.answerCbQuery().catch(() => {});
    }
  }
  @Action(/bookingAllData_(.+)_(\d+)_(\d+)$/)
  async bookingAllData(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);

      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);
      const page = Number(match[3]);

      if (action === 'all') {
        await this.utils.clearSessionMessages(ctx);
        if (ctx.session.ownerDataFilter) {
          return this.ownerService.handleDataFilter(
            ctx,
            ctx.session.ownerDataFilter,
            lang,
            ownerId,
            page,
          );
        }
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.by_stadion.title', { lang }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('owner_booking.by_stadion.date'),
                  callback_data:
                    'bookingAllData_dateFilter_' + ownerId + '_' + page,
                },
                {
                  text: this.i18n.translate('owner_booking.by_stadion.status'),
                  callback_data:
                    'bookingAllData_status_' + ownerId + '_' + page,
                },
              ],
              [
                {
                  text: this.i18n.translate('owner_booking.by_stadion.stadium'),
                  callback_data:
                    'bookingAllData_stadiumFilter_' + ownerId + '_' + page,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: 'back_owner_8',
                },
              ],
            ],
          },
        );
        return;
      }
      if (action === 'status') {
        const statuses: Booking_status[] = [
          'PENDING',
          'CONFIRMED',
          'PAID',
          'COMPLETED',
          'CANCELED',
          'NOSHOW',
          'REFUNDED',
        ];
        const button: InlineKeyboardButton[][] = statuses.map((status) => [
          {
            text: statusMap(status, this.i18n, lang),
            callback_data: `bookingAllData_STATUS.${status}_${ownerId}_${page}`,
          },
        ]);

        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: 'bookingAllData_all_' + ownerId + '_' + page,
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.filter_by_status', { lang }),
          {
            inline_keyboard: button,
          },
        );
        return;
      }
      if (action.startsWith('STATUS')) {
        const status = action.replace('STATUS.', '') as Booking_status;

        await this.utils.clearSessionMessages(ctx);
        const limit = 5;
        const where: Prisma.BookingWhereInput = {
          stadion: {
            owner_id: ownerId,
          },
          status: status,
        };
        const orderBy: Prisma.BookingOrderByWithRelationInput = {
          startAt: 'asc',
        };
        const [bookings, total] = await Promise.all([
          this.prisma.booking.findMany({
            where,
            orderBy,
            include: {
              stadion: {
                include: {
                  region: true,
                  region_items: true,
                },
              },
              user: true,
            },
            skip: (page - 1) * limit,
            take: limit,
          }),
          this.prisma.booking.count({ where }),
        ]);
        if (!bookings.length) {
          await ctx.answerCbQuery(
            this.i18n.translate(`owner_booking.no_${status}`, { lang }),
            { show_alert: true },
          );
          return;
        }
        await ctx.answerCbQuery(
          this.i18n.translate('loading.loading', { lang }),
        );

        const callback_data: string = 'bookingAllData';

        await Promise.all(
          bookings.map((item: IBooking) =>
            this.ownerService.sendBookingMessage(
              ctx,
              item,
              page,
              lang,
              action,
              callback_data,
            ),
          ),
        );

        const callback: string = `bookingAllData_${action}_${ownerId}`;
        await this.utils.sendPagination(
          ctx,
          page,
          total,
          limit,
          lang,
          callback,
        );
        return;
      }
      if (action === 'dateFilter') {
        let sent = await ctx.reply(
          this.i18n.translate('owner_booking.filterData', { lang }),
        );
        ctx.session.ownerActiveBooking ??= [];
        ctx.session.ownerActiveBooking.push(sent.message_id);
        ctx.session.ownerBrons = 'dataFilter';
        ctx.session.owner_registor.id = ownerId;
        return;
      }
      if (action === 'stadiumFilter') {
        const stadions = await this.prisma.stadion.findMany({
          where: { owner_id: ownerId },
          select: {
            id: true,
            name: true,
          },
        });
        if (!stadions.length) return this.utils.errorFunction(ctx);

        const buttons = stadions.map((s) => [
          {
            text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
            callback_data: `bookingAllData_STADION.${s.id}_${ownerId}_${page}`,
          },
        ]);
        buttons.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `bookingAllData_all_${ownerId}_${page}`,
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.stadion.select', { lang }),
          {
            inline_keyboard: buttons,
          },
        );
        return;
      }
      if (action.startsWith('STADION')) {
        const stadionId = Number(action.replace('STADION.', ''));
        const booking = await this.prisma.booking.count({
          where: { stadion_id: stadionId },
        });
        if (booking === 0) {
          await ctx.answerCbQuery(
            this.i18n.translate('owner_booking.not_found_stadium_bookings', {
              lang,
            }),
            { show_alert: true },
          );
          return;
        }
        await this.utils.clearSessionMessages(ctx);
        const buttons: InlineKeyboardButton[][] = [
          [
            {
              text: this.i18n.translate(
                'owner_booking.booking_filter.seven_days',
                { lang },
              ),
              callback_data: `bookingFilter_7days_${stadionId}_${page}`,
            },
            {
              text: this.i18n.translate(
                'owner_booking.booking_filter.thirty_days',
                { lang },
              ),
              callback_data: `bookingFilter_30days_${stadionId}_${page}`,
            },
          ],
          [
            {
              text: this.i18n.translate('owner_booking.booking_filter.active', {
                lang,
              }),
              callback_data: `bookingFilter_active_${stadionId}_${page}`,
            },
            {
              text: this.i18n.translate('owner_booking.booking_filter.all', {
                lang,
              }),
              callback_data: `bookingFilter_allFilter_${stadionId}_${page}`,
            },
          ],
          [
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `bookingAllData_stadiumFilter_${ownerId}_${page}`,
            },
          ],
        ];
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('owner_booking.booking_filter.title', { lang }),
          {
            inline_keyboard: buttons,
          },
        );
        return;
      }
      if (action === 'search') {
        ctx.session.ownerBrons = 'search';
        ctx.session.owner_registor.id = ownerId;
        let sent = await ctx.reply(
          this.i18n.translate('owner_booking.search_by_user', { lang }),
        );
        ctx.session.ownerActiveBooking ??= [];
        ctx.session.ownerActiveBooking.push(sent.message_id);
        return;
      }
      if (action === 'searchBack') {
        await this.utils.clearSessionMessages(ctx);
        ctx.session.ownerDataFilter = null;
        ctx.session.owner_registor.id = null;
        return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      ctx.answerCbQuery().catch(() => {});
    }
  }
  @Action(/^bookingFilter_(.+)_(\d+)_(\d+)$/)
  async filter(@Ctx() ctx: MyContext) {
    const match = ctx.match as RegExpMatchArray;
    const action = match[1];
    const stadionId = Number(match[2]);
    const page = Number(match[3]);
    try {
      const limit = 5;
      const lang = await this.utils.langs(ctx);
      const now = new Date();
      const base = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      const callback_data: string = 'bookingFilter';
      const callback: string = 'bookingFilter_' + action + '_' + stadionId;

      await this.utils.clearSessionMessages(ctx);
      if (['7days', '30days', 'active', 'allFilter'].includes(action)) {
        const where: Prisma.BookingWhereInput = {
          stadion_id: stadionId,
        };
        const orderBy: Prisma.BookingOrderByWithRelationInput = {
          date: 'asc',
        };
        if (action === '7days') {
          const sevenDaysAgo = new Date(base);
          sevenDaysAgo.setUTCDate(base.getUTCDate() - 7);
          where.date = {
            gte: sevenDaysAgo,
            lt: base,
          };
        }
        if (action === '30days') {
          const sritinDayAgo = new Date(base);
          sritinDayAgo.setUTCDate(base.getUTCDate() - 30);
          where.date = {
            gte: sritinDayAgo,
            lt: base,
          };
        }
        if (action === 'active') {
          where.date = {
            gte: base,
          };
        }

        const [bookings, total] = await Promise.all([
          this.prisma.booking.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              stadion: {
                include: {
                  region: true,
                  region_items: true,
                  owner: true,
                },
              },
              user: true,
            },
          }),
          this.prisma.booking.count({ where }),
        ]);
        if (!bookings.length) {
          await ctx.answerCbQuery(
            this.i18n.translate(`owner_booking.not_found_${action}`, { lang }),
            { show_alert: true },
          );
          return;
        }
        await ctx.answerCbQuery(
          this.i18n.translate('loading.loading', { lang }),
        );
        await Promise.all(
          bookings.map((booking) =>
            this.ownerService.sendBookingMessage(
              ctx,
              booking,
              page,
              lang,
              action,
              callback_data,
            ),
          ),
        );
        await this.utils.sendPagination(
          ctx,
          page,
          total,
          limit,
          lang,
          callback,
        );
        return;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      await ctx.answerCbQuery().catch(() => {});
    }
  }
  ////////////////////⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️⬆️////////////////////////////////

  @Action(/BookingOwner_statistica_(.+)_(\d+)$/)
  async statistica(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);
      const now = new Date();
      const base = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      if (action === 'stats') {
        const total = await this.prisma.booking.count({
          where: { stadion: { owner_id: ownerId }, status: 'COMPLETED' },
        });

        if (total < 10) {
          await ctx.answerCbQuery(
            this.i18n.translate('owner_booking.stats_not_enough_data', {
              lang,
            }),
            {
              show_alert: true,
            },
          );
          return;
        }
        await ctx.answerCbQuery(
          this.i18n.translate('loading.loading', { lang }),
        );

        const [
          stadionCount,
          activeBookings,
          endedBookings,
          cancelBookings,
          revenue,
          bookingsLast7Days,
          totalCount,
        ] = await Promise.all([
          this.prisma.stadion.count({
            where: { owner_id: ownerId },
          }),
          this.prisma.booking.count({
            where: {
              stadion: { owner_id: ownerId },
              status: { in: ['CONFIRMED', 'PAID', 'PENDING'] },
            },
          }),
          this.prisma.booking.count({
            where: {
              stadion: { owner_id: ownerId },
              status: 'COMPLETED',
            },
          }),
          this.prisma.booking.count({
            where: {
              stadion: { owner_id: ownerId },
              status: { in: ['CANCELED', 'NOSHOW', 'REFUNDED'] },
            },
          }),
          this.prisma.booking.aggregate({
            where: { stadion: { owner_id: ownerId }, status: 'COMPLETED' },
            _sum: { total_price: true },
          }),
          this.prisma.booking.findMany({
            where: {
              stadion: { owner_id: ownerId },
              date: {
                gte: subDays(base, 7),
                lt: base,
              },
            },
            select: {
              date: true,
            },
          }),
          this.prisma.booking.count({
            where: { stadion: { owner_id: ownerId } },
          }),
        ]);

        const Growth = await this.utils.growthBooking(ctx, ownerId, lang);

        const chartData = this.utils.groupByDay(bookingsLast7Days, lang);
        const charts = this.utils.fillLast7Days(chartData, lang);
        const chart = this.utils.progressChart(charts, lang);

        const message = this.i18n.translate(
          'owner_booking.owner_stats.message',
          {
            lang,
            args: {
              stadionCount,
              totalCount,
              activeBookings,
              endedBookings,
              cancelBookings,
              revenue: new Intl.NumberFormat('uz-UZ').format(
                Number(revenue._sum.total_price) || 0,
              ),
              growth: Growth,
              chart,
            },
          },
        );
        await this.utils.safeEditOrReply(ctx, message, {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: 'back_owner_8',
              },
            ],
          ],
        });
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
      console.log(error);
    } finally {
      await ctx.answerCbQuery().catch(() => {});
    }
  }

  @Action(/advertisement_(\w+)_(\d+)/)
  async advertisement(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const action = match[1];
      const ownerId = Number(match[2]);

      return this.ownerService.advertisement(ctx, action, ownerId, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/advertisements_status_(\w+)_(\d+)_(\d+)_(\d+)/)
  async advertisementStatus(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      const match = ctx.match as RegExpMatchArray;
      const status = match[1] as AdvertisementStatus;
      const ownerId = Number(match[2]);
      const statusCount = Number(match[3]);
      const page = Number(match[4]);
      return await this.ownerService.advertisementStatus(
        ctx,
        status,
        ownerId,
        statusCount,
        page,
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/^advertisementList_(\d+)_(\w+)/)
  async advertisementList(@Ctx() ctx: MyContext) {
    try {
      const match = ctx.match as RegExpMatchArray;
      const ownerId = Number(match[1]);
      const lang = match[2];
      return await this.ownerService.advertisement(ctx, 'list', ownerId, lang);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/advertisementPending_(\w+)_(\d+)_(\w+)/)
  async advertisementPending(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const [_, type, advertisementId, lang] =
        ctx.callbackQuery.data.split('_');

      return await this.ownerService.advertisement_checking(
        ctx,
        type,
        Number(advertisementId),
        lang,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  /////////////////////////////////////// OWNER BOOKING /////////////////////////////////////////////////////

  @Action(/^booking_confirm_(.+)_(\d+)$/)
  async confirment(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, type, bookingId] = ctx.callbackQuery.data.split('_');
        switch (type) {
          case 'yes': {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            const booking = await this.prisma.booking.findUnique({
              where: { id: Number(bookingId) },
              include: { stadion: { include: { owner: true } } },
            });
            if (!booking) {
              await this.utils.errorFunction(ctx);
              return;
            }
            if (booking.status === 'CONFIRMED') {
              await ctx.answerCbQuery(
                this.i18n.translate('booking.already_confirmed', { lang }),
                { show_alert: true },
              );
              return;
            }
            await this.prisma.booking.update({
              where: { id: Number(booking.id) },
              data: { status: 'CONFIRMED' },
            });
            const days = format(booking.date, 'dd.MM.yyyy');

            const paymentTextMap = {
              CARD: this.i18n.translate('peyments.card', { lang }),
              CASH: this.i18n.translate('peyments.cash', { lang }),
            };

            const paymentMethodText =
              paymentTextMap[booking.payment_method] || booking.payment_method;

            const message = this.i18n.translate('booking.booking_confirmed', {
              lang,
              args: {
                stadion_name: booking.stadion.name,
                date: days,
                start_time: booking.start_time,
                end_time: booking.end_time,
                payment_method: paymentMethodText,
                total: booking.total_price.toLocaleString(),
              },
            });
            try {
              await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
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
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
            const settings: NotificationSettings_type = {
              ...DefaultNotificationSettings,
              ...(booking.stadion.owner
                .notificationSettings as Partial<NotificationSettings_type>),
            };
            if (settings.BOOKING_CONFIRMED) {
              void this.notifikationService.bookingConfirmentNotifikation(
                booking.id,
                booking.stadion.owner_id,
              );
            }
            break;
          }
          case 'no':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              const days = format(booking.date, 'dd.MM.yyyy');
              try {
                await ctx.editMessageText(
                  this.i18n.translate('booking.booking_cancelled_notice', {
                    lang,
                    args: {
                      date: days,
                      start_time: booking.start_time,
                      end_time: booking.end_time,
                    },
                  }),
                  {
                    parse_mode: 'Markdown',
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: 'errorBack_1',
                          },
                        ],
                      ],
                    },
                  },
                );
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'pending':
            {
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
                include: { stadion: true },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              const { timeLeftText, totalMinutes } =
                this.utils.bookingTimeCalculate(booking.startAt, lang);

              if (totalMinutes < 60) {
                await ctx.answerCbQuery(
                  this.i18n.translate('booking.payment_time_alert', {
                    lang,
                    args: { time_left: timeLeftText },
                  }),
                  { show_alert: true },
                );
                return;
              }
              const days = format(booking.date, 'dd.MM.yyyy');

              if (
                ctx.session.booking_step &&
                ctx.session.booking_step === 'pay_later'
              ) {
                await this.prisma.booking.update({
                  where: { id: Number(bookingId) },
                  data: { status_pay_later: true },
                });
              }

              const paymentTextMap = {
                CARD: this.i18n.translate('peyments.card', { lang }),
                CASH: this.i18n.translate('peyments.cash', { lang }),
              };

              const paymentMethodText =
                paymentTextMap[booking.payment_method] ||
                booking.payment_method;

              const message = this.i18n.translate(
                'booking.confirm_with_payment',
                {
                  lang,
                  args: {
                    stadion_name: booking.stadion.name,
                    date: days,
                    start_time: booking.start_time,
                    end_time: booking.end_time,
                    payment_method: paymentMethodText,
                    total: booking.total_price.toLocaleString(),
                    time_left: timeLeftText,
                  },
                },
              );
              try {
                await ctx.editMessageText(message, {
                  parse_mode: 'Markdown',
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
                ctx.session.booking_step = '';
              } catch (error) {}
            }
            break;
          case 'confirm':
            {
              try {
                if (ctx.callbackQuery) {
                  try {
                    await ctx.answerCbQuery();
                  } catch (error) {}
                }
                const booking = await this.prisma.booking.findUnique({
                  where: { id: Number(bookingId) },
                  include: { stadion: { include: { owner: true } } },
                });
                if (!booking) {
                  await this.utils.errorFunction(ctx);
                  return;
                }
                await this.prisma.booking.update({
                  where: { id: booking.id },
                  data: { status: 'CONFIRMED' },
                });
                const days = format(booking.date, 'dd.MM.yyyy');

                const paymentTextMap = {
                  CARD: this.i18n.translate('peyments.card', { lang }),
                  CASH: this.i18n.translate('peyments.cash', { lang }),
                };

                const paymentMethodText =
                  paymentTextMap[booking.payment_method] ||
                  booking.payment_method;

                const message = this.i18n.translate(
                  'booking.booking_confirmed',
                  {
                    lang,
                    args: {
                      stadion_name: booking.stadion.name,
                      date: days,
                      start_time: booking.start_time,
                      end_time: booking.end_time,
                      payment_method: paymentMethodText,
                      total: booking.total_price.toLocaleString(),
                    },
                  },
                );
                const send = await ctx.reply(message, {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_5',
                        },
                      ],
                    ],
                  },
                });
                if (!ctx.session.bookingBrones) {
                  ctx.session.bookingBrones = [];
                }
                ctx.session.bookingBrones.push(send.message_id);

                const settings: NotificationSettings_type = {
                  ...DefaultNotificationSettings,
                  ...(booking.stadion.owner
                    .notificationSettings as Partial<NotificationSettings_type>),
                };
                if (settings.BOOKING_CONFIRMED) {
                  void this.notifikationService.bookingConfirmentNotifikation(
                    booking.id,
                    booking.stadion.owner_id,
                  );
                }
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'cancel': {
            const booking = await this.prisma.booking.findUnique({
              where: { id: Number(bookingId) },
              include: { stadion: { include: { owner: true } } },
            });
            if (!booking) {
              await this.utils.errorFunction(ctx);
              return;
            }
            if (booking.status === 'CANCELED') {
              await ctx.answerCbQuery(
                this.i18n.translate('booking.already_cancelled', { lang }),
                { show_alert: true },
              );
              return;
            }
            await this.prisma.booking.update({
              where: { id: booking.id },
              data: { status: 'CANCELED' },
            });
            if (booking.status === 'CONFIRMED' || booking.status === 'PAID') {
              const settings: NotificationSettings_type = {
                ...DefaultNotificationSettings,
                ...(booking.stadion.owner
                  .notificationSettings as Partial<NotificationSettings_type>),
              };
              if (settings.CANCELLED_BOOKINGS) {
                void this.notifikationService.bookingCanceledNotifikation(
                  booking.id,
                  booking.stadion.owner.id,
                );
              }
            }

            const days = format(booking.date, 'dd.MM.yyyy');

            const send = await ctx.reply(
              this.i18n.translate('booking.booking_cancelled', {
                lang,
                args: {
                  date: days,
                  start_time: booking.start_time,
                  end_time: booking.end_time,
                },
              }),
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_user_5',
                      },
                    ],
                  ],
                },
              },
            );
            if (!ctx.session.bookingBrones) {
              ctx.session.bookingBrones = [];
            }
            ctx.session.bookingBrones.push(send.message_id);
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            break;
          }
          case 'selectPeyments':
            {
              try {
                const booking = await this.prisma.booking.findUnique({
                  where: { id: Number(bookingId) },
                  include: {
                    stadion: {
                      include: {
                        owner: {
                          include: {
                            ownerCard: {
                              select: {
                                id: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                });
                if (!booking) {
                  await this.utils.errorFunction(ctx);
                  return;
                }
                const cardId = booking?.stadion?.owner?.ownerCard?.id;
                const hasCard = !!cardId;
                if (!hasCard) {
                  try {
                    await ctx.answerCbQuery(
                      this.i18n.translate('peyments.change_card_block', {
                        lang,
                      }),
                      {
                        show_alert: true,
                      },
                    );
                  } catch (error) {
                    console.log(error);
                  }
                  return;
                }
                const { totalMinutes } = this.utils.bookingTimeCalculate(
                  booking.startAt,
                  lang,
                );
                if (totalMinutes < 0) {
                  await ctx.answerCbQuery(
                    this.i18n.translate('booking.play_game', { lang }),
                    { show_alert: true },
                  );
                  return;
                }
                if (ctx.callbackQuery) {
                  try {
                    ctx.answerCbQuery();
                  } catch (error) {}
                }
                await Promise.all([
                  this.prisma.booking.update({
                    where: { id: booking.id },
                    data: {
                      payment_method: 'CARD',
                      status: 'PENDING',
                      status_pay_later: true,
                    },
                  }),

                  this.prisma.tranzaktion.create({
                    data: {
                      user_id: booking.user_id!,
                      booking_id: booking.id,
                      systeam_fee: 0,
                      owner_amount: Number(booking.total_price),
                      provider: PaymentProvider.CLICK,
                      provider_transactionId: '',
                      owner_card_id: cardId,
                      amount_received: 0,
                    },
                  }),
                ]);
                const send = await ctx.reply(
                  this.i18n.translate('booking.payments', { lang }),
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: 'back_user_5',
                          },
                        ],
                      ],
                    },
                  },
                );
                if (!ctx.session.bookingBrones) {
                  ctx.session.bookingBrones = [];
                }
                ctx.session.bookingBrones.push(send.message_id);
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'alerd':
            {
              await ctx.answerCbQuery(
                this.i18n.translate('booking.cancel_not_allowed', { lang }),
                { show_alert: true },
              );
            }
            break;
          case 'QR':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const { qr } = await this.qrservice.generateQr(Number(bookingId));

              const send = await ctx.replyWithPhoto(
                { source: Buffer.from(qr.split(',')[1], 'base64') },
                {
                  caption: this.i18n.translate('booking.qr_caption', { lang }),
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_5',
                        },
                      ],
                    ],
                  },
                },
              );
              if (!ctx.session.bookingBrones) {
                ctx.session.bookingBrones = [];
              }
              ctx.session.bookingBrones.push(send.message_id);
            }
            break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/^back_(owner|user)_(.+)$/)
  async brckAll(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, role, data] = ctx.callbackQuery.data.split('_');
      if (role === 'owner') {
        return this.ownerService.ownerBackSwitch(ctx, data, lang);
      } else if (role === 'user') {
        return this.userService.userBackSwitch(ctx, data, lang);
      }
    }
  }
  @Action(
    /^booking_peyments_(cash|card)_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d{4}-\d{1,2}-\d{1,2})_(\d+)_(\d+)_(\d+)/,
  )
  async bookingPeyments(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [
          _,
          __,
          type,
          start_time,
          end_time,
          days,
          stadionId,
          price,
          noshowCount,
        ] = ctx.callbackQuery.data.split('_');

        return this.userService.bookingPayments(
          ctx,
          type,
          days,
          start_time,
          end_time,
          Number(stadionId),
          Number(price),
          Number(noshowCount),
          lang,
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/booking_back_(\d+)$/)
  async bookingBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, stadionId] = ctx.callbackQuery.data.split('_');

      return this.userService.userbookingStadion(ctx, lang, Number(stadionId));
    }
  }
  @Action(/booking_specialBack_(\d+)_(\d+)$/)
  async bookingSpecilaBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, specialId, stadionId] = ctx.callbackQuery.data.split('_');
      return this.userService.special(
        ctx,
        lang,
        Number(specialId),
        Number(stadionId),
      );
    }
  }
  @Action(/^booking_scheduleBack_(\d+)_(\d+)_(\d+)_(\d{4})_(\d+)$/)
  async bookingScheduleBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, scheduleId, day, monthNumber, years, stadionId] =
        ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_start(
        ctx,
        years,
        day,
        monthNumber,
        Number(scheduleId),
        Number(stadionId),
        lang,
      );
    }
  }

  @Action(/^booking_timeStart_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})_(\d+)$/)
  async bookingTimeStart(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [
        _,
        __,
        start_time,
        scheduleId,
        day,
        monthNumber,
        years,
        stadionId,
      ] = ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_end(
        ctx,
        years,
        start_time,
        Number(scheduleId),
        Number(day),
        Number(monthNumber),
        Number(stadionId),
        lang,
      );
    }
  }
  @Action(
    /^booking_timeEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})$/,
  )
  async bookingTimeEnd(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, start_time, end_time, day, monthNumber, stadionId, years] =
        ctx.callbackQuery.data.split('_');
      const data = new Date(
        Date.UTC(Number(years), Number(monthNumber) - 1, Number(day)),
      );

      return this.userService.bookingScheduleFinish(
        ctx,
        start_time,
        end_time,
        data,
        lang,
        Number(stadionId),
      );
    }
  }
  @Action(/^booking_specials_(\d+)_(\d+)$/)
  async bookingBookingSpecile(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, specileId, stadionId] = ctx.callbackQuery.data.split('_');
      return this.userService.special(
        ctx,
        lang,
        Number(specileId),
        Number(stadionId),
      );
    }
  }
  @Action(/^booking_special_(\d{2}:\d{2})_(\d+)_(\d+)$/)
  async userBookingSpecial(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, start_time, specialId, stadionId] =
        ctx.callbackQuery.data.split('_');
      return this.userService.userbookingSpecialEnd(
        ctx,
        lang,
        Number(specialId),
        Number(stadionId),
        start_time,
      );
    }
  }
  @Action(
    /^booking_specialEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d{4})_(\d+)_(\d+)$/,
  )
  async userBookingSpecialEnd(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    try {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, start_time, end_time, id, year, month, day] =
          ctx.callbackQuery.data.split('_');
        const data = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );
        console.log('booking_specialEnd', data);

        return this.userService.bookingScheduleFinish(
          ctx,
          start_time,
          end_time,
          data,
          lang,
          Number(id),
        );
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/^booking_schedule_(\d{4})_(\d+)_(\d+)_(\d+)_(\d+)$/)
  async userBookingSchedule(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, year, day, monthNumber, scheduleId, stadionId] =
        ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_start(
        ctx,
        year,
        day,
        monthNumber,
        Number(scheduleId),
        Number(stadionId),
        lang,
      );
    }
  }
  @Action(/^ignore/)
  async ignore(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
  }
  @Action(/^booking_region_page_(.+)_(\d+)$/)
  async stadionPage(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, ___, anonimus, page] = ctx.callbackQuery.data.split('_');
      if (anonimus === 'favorit') {
        if (ctx.session.stadionFavoritMessages?.length) {
          const messagesId = ctx.session.stadionFavoritMessages;
          try {
            await ctx.deleteMessages(messagesId);
          } catch (e) {}
          ctx.session.stadionFavoritMessages = [];
        }
        await ctx.deleteMessage();
        await this.userService.userSwitch(
          ctx,
          'stadionFavorite',
          lang,
          Number(page),
        );
      } else if (anonimus === 'stadionBronHistory') {
        await this.userService.userSwitch(ctx, anonimus, lang, Number(page));
      } else if (anonimus === 'stadionBron') {
        if (ctx.session.bookingBrones?.length) {
          try {
            await ctx.deleteMessages(ctx.session.bookingBrones);
          } catch (error) {}
          ctx.session.bookingBrones = [];
        }
        await this.userService.userSwitch(ctx, anonimus, lang, Number(page));
      } else if (anonimus === 'cheapPrice') {
        try {
          if (ctx.session.stadionMessages?.length) {
            await ctx.deleteMessages(ctx.session.stadionMessages);
            ctx.session.stadionMessages = [];
          }
        } catch (error) {
          ctx.session.stadionMessages = [];
        }
        await this.userService.userSwitch(ctx, anonimus, lang, Number(page));
      } else {
        if (ctx.session.stadionMessages?.length) {
          const messagesId = ctx.session.stadionMessages;
          try {
            await ctx.deleteMessages(messagesId);
          } catch (e) {}
          ctx.session.stadionMessages = [];
        }
        await this.userService.userbookingRegionItems(
          ctx,
          lang,
          Number(anonimus),
          Number(page),
        );
      }
    }
  }
  @Action(/^booking_(region|regionItem|stadion|save)_(\d+)$/)
  async userBooking(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, type, id] = ctx.callbackQuery.data.split('_');
      if (type === 'region') {
        await ctx.answerCbQuery().catch(() => {});
        return this.userService.userbookingRegion(ctx, lang, Number(id));
      } else if (type === 'regionItem') {
        await ctx.answerCbQuery().catch(() => {});
        return this.userService.userbookingRegionItems(ctx, lang, Number(id));
      } else if (type === 'stadion') {
        await ctx.answerCbQuery().catch(() => {});
        return this.userService.userbookingStadion(ctx, lang, Number(id));
      } else if (type === 'save') {
        return this.userService.userSaveFnc(ctx, lang, Number(id));
      }
    }
  }

  @Action(/^user_(.+)$/)
  async userSetting(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data.split('_')[1];
      if (data === 'offday') {
        if (ctx.callbackQuery) {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.stadion.alert', { lang }),
              {
                show_alert: true,
              },
            );
          } catch (error) {}
        }
      }
      return this.userService.userSwitch(ctx, data, lang);
    }
  }
  @Action(/working_date_(.+)/)
  async working_date(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    try {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const date = ctx.callbackQuery.data.split('_')[2];
        const data = new Date(date);
        const stadion = await this.prisma.stadion.findMany({
          where: {
            working_status: true,
            admin_status: AdminStatus.APPROVED,
            owner: {
              status: Admin_S.ACTIVE,
            },
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
          take: 10,
        });
        if (!stadion.length) {
          await ctx.answerCbQuery(
            this.i18n.translate('booking.not_available_stadiums', { lang }),
          );
          return;
        }
        try {
          await ctx.answerCbQuery();
        } catch (error) {}
        const slotPerKeyboard = 3;
        const button: InlineKeyboardButton[][] = [];

        const tzOffset = 5 * 60;
        const today = new Date();
        const tzNow = new Date(
          today.getTime() + (tzOffset + today.getTimezoneOffset()) * 60000,
        );
        let startTime = '08:00';
        const time = this.utils.roundUpToNextHour(tzNow);
        const currentTime = time.toTimeString().slice(0, 5);

        if (
          today.getFullYear() === data.getFullYear() &&
          today.getMonth() === data.getMonth() &&
          today.getDate() === data.getDate()
        ) {
          startTime = currentTime;
        }
        const Slods = await this.utils.generateSlots(startTime, '23:00');
        for (let i = 0; i < Slods.length; i += slotPerKeyboard) {
          const row: InlineKeyboardButton[] = [];
          for (let j = 0; j < slotPerKeyboard; j++) {
            if (Slods[i + j]) {
              row.push({
                text: Slods[i + j].start,
                callback_data: `search_working_start_${date}_${Slods[i + j].start}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: 'user_working',
          },
        ]);
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('booking.stadion.selectTime', { lang }),
          { inline_keyboard: button },
        );
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }
  @Action(/search_working_(start|end)_(.+)_(.+)/)
  async search_working(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    try {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, type, date, time] = ctx.callbackQuery.data.split('_');
        const slotPerKeyboard = 3;
        const button: InlineKeyboardButton[][] = [];
        if (type === 'start') {
          if (ctx.callbackQuery) {
            try {
              await ctx.answerCbQuery();
            } catch {}
          }
          const Slods = await this.utils.generateSlots(time, '23:00');
          for (let i = 0; i < Slods.length; i += slotPerKeyboard) {
            const row: InlineKeyboardButton[] = [];
            for (let j = 0; j < slotPerKeyboard; j++) {
              if (Slods[i + j]) {
                row.push({
                  text: Slods[i + j].end,
                  callback_data: `search_working_end_${date}_${time}-${Slods[i + j].end}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `working_date_${date}`,
            },
          ]);
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('booking.stadion.selectEndTime', { lang }),
            { inline_keyboard: button },
          );
        } else if (type === 'end') {
          const [start_time, end_time] = time.split('-');
          return this.userService.searchWorkingStadions(
            ctx,
            date,
            start_time,
            end_time,
            lang,
          );
        }
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/search_stadionsPage_(.+)/)
  async search_stadionsPage(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    try {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, date, start_time, end_time, lang, page] =
          ctx.callbackQuery.data.split('_');
        console.log(date, start_time, end_time, lang, page);
        return this.userService.searchWorkingStadions(
          ctx,
          date,
          start_time,
          end_time,
          lang,
          Number(page),
        );
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/add_stadion/)
  async add_stadion(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    try {
      const region = await this.prisma.region.findMany();

      if (!region.length) {
        this.utils.errorFunction(ctx);
        console.log(
          'regionlar hali yaratilmagan (npm run prisma) qilish kerak',
        );

        return;
      }
      const owner = await this.prisma.owners.findUnique({
        where: {
          chatID: String(ctx.from?.id),
          status: {
            in: ['BLOCKED', 'PENDING'],
          },
        },
      });

      if (owner?.status === 'BLOCKED') {
        await ctx.answerCbQuery(
          this.i18n.translate('stadions.blocked.cannot_add_stadium', { lang }),
          { show_alert: true },
        );
        return;
      }
      if (owner?.status === 'PENDING') {
        await ctx.answerCbQuery(
          this.i18n.translate('stadions.pending.cannot_add_stadium', { lang }),
          { show_alert: true },
        );
        return;
      }

      const button: InlineKeyboardButton[][] = region.map((r) => [
        { text: r.name, callback_data: `region_${r.id}` },
      ]);

      button.push([
        {
          text: this.i18n.translate('stadions.back', { lang }),
          callback_data: 'back_owner_2',
        },
      ]);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.stadion_region', { lang }),
        {
          inline_keyboard: button,
        },
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
      console.log(error.message);
    }
  }
  @Action(/region_(.+)/)
  async region_items(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session.stadion = ctx.session.stadion || {
      image: null,
      length: null,
      step: 0,
      lockation: null,
      name: null,
      owner_id: null,
      payments: null,
      max_count: null,
      latitude: null,
      longitude: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
    };
    try {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch {}
      }
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const regionId: number = parseInt(
        ctx.callbackQuery.data.split('_')[1],
        10,
      );
      if (isNaN(regionId)) {
        this.utils.errorFunction(ctx);
        return;
      }
      const region_items = await this.prisma.region_item.findMany({
        where: {
          region_id: regionId,
        },
      });

      if (!region_items.length) {
        this.utils.errorFunction(ctx);
        return;
      }
      ctx.session.stadion.region_id = regionId;
      ctx.session.stadion.step = 1;
      const button: InlineKeyboardButton[][] = region_items.map((item) => [
        { text: item.name, callback_data: `regions_item_${item.id}` },
      ]);
      button.push([
        {
          text: this.i18n.translate('stadions.back'),
          callback_data: 'back_owner_3',
        },
      ]);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.region_items', { lang }),
        { inline_keyboard: button },
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/regions_item_(.+)/)
  async onStadions(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session.stadion = ctx.session.stadion || {
      image: null,
      length: null,
      max_count: null,
      lockation: null,
      latitude: null,
      longitude: null,
      step: 0,
      name: null,
      owner_id: null,
      payments: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
    };
    ctx.session.stadion_step = ctx.session.stadion_step || null;
    try {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch {}
      }

      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const region_item_id: number = parseInt(
        ctx.callbackQuery.data.split('_')[2],
        10,
      );

      if (isNaN(region_item_id)) {
        this.utils.errorFunction(ctx);
        return;
      }
      ctx.session.stadion.region_item_id = region_item_id;
      ctx.session.stadion.step = 2;
      await ctx.reply(this.i18n.translate('stadions.name', { lang }));
      ctx.session.stadion_step = 'stadion';
      ctx.session.stadion.name = 'N';
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/toggleNotification\|(.+)\|(\d+)/)
  async toggleNotification(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    try {
      const data = ctx.callbackQuery.data;

      const [_, type, id] = data.split('|');

      const notificationType = type as keyof NotificationSettings_type;

      const owner = await this.prisma.owners.findUnique({
        where: { id: Number(id) },
      });

      if (!owner) return;

      const settings: NotificationSettings_type = {
        ...DefaultNotificationSettings,
        ...(owner.notificationSettings as Partial<NotificationSettings_type>),
      };

      settings[notificationType] = !settings[notificationType];

      await this.prisma.owners.update({
        where: { id: owner.id },
        data: {
          notificationSettings: settings,
        },
      });

      const label = NotificationNames[notificationType][lang];
      const isEnabled = settings[notificationType];

      const key = isEnabled ? 'notification.enabled' : 'notification.disabled';

      const text = this.i18n.translate(key, {
        lang,
        args: {
          label,
        },
      });

      await ctx.answerCbQuery(text, {
        show_alert: true,
      });
      return this.ownerService.notificationSettings(ctx, owner.id, lang);
    } catch (e) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/premiumProvider\|(.+)\|(.+)\|(\d+)/)
  async premiumProvider(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const [_, providerKey, premiumPlan, id] =
        ctx.callbackQuery.data.split('|');
      const plan = premiumPlan as PremiumPlan;
      const durationMap: Record<PremiumPlan, number> = {
        WEEK_1: 7,
        MONTH_1: 30,
        MONTH_3: 90,
        MONTH_6: 180,
        YEAR_1: 365,
      };

      const amount = PREMIUM_PLANS[plan].price;

      const owner = await this.prisma.owners.findUnique({
        where: { id: Number(id) },
        select: { full_name: true, id: true },
      });
      if (!owner) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const premiumTranzaction = await this.prisma.premiumTransaction.create({
        data: {
          owner_id: owner.id,
          amount,
          plan,
          duration: durationMap[plan],
          provider: providerKey,
        },
      });
      const provider = providerKey as PaymentProvider;

      if (!(provider in PAYMENT_URL_GENERATORS)) {
        await this.utils.errorFunction(ctx);
        return;
      }

        const description = getPremiumPaymentDescription(plan, lang);
        const paymentAmount = addPaymentCommission(amount, 1);

      const paymentUrl = await PAYMENT_URL_GENERATORS[provider](
        paymentAmount,
        premiumTranzaction.id,
        plan,
        owner.full_name,
        lang,
        "premium",
        description
      );

      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('premium.payment.pay_now', {
          lang,
          args: {
            amount: amount.toLocaleString(),
          },
        }),
        {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('premium.payment.button', {
                  lang,
                }),
                url: paymentUrl,
              },
            ],
            [
              {
                text: this.i18n.translate('schedule.back', {
                  lang,
                }),
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
      await this.utils.errorFunction(ctx);
      console.log(error);
      
    }
  }

  @Action(/owner_(.+)_(\d+)/)
  async onOwner(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const [_, type, Id] = ctx.callbackQuery.data.split('_');
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    try {
      if (type === 'stadionSplit') {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('stadions.stadionSplit.title', { lang }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.stadionSplit.options.0', {
                    lang,
                  }),
                  callback_data: `owner_Split-2_${Number(Id)}`,
                },
                {
                  text: this.i18n.translate('stadions.stadionSplit.options.1', {
                    lang,
                  }),
                  callback_data: `owner_Split-4_${Number(Id)}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('stadions.stadionSplit.options.2', {
                    lang,
                  }),
                  callback_data: `owner_Split-6_${Number(Id)}`,
                },
                {
                  text: this.i18n.translate('stadions.stadionSplit.options.3', {
                    lang,
                  }),
                  callback_data: `owner_Split-8_${Number(Id)}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: JSON.stringify({
                    type: 'miniStadionlar',
                    id: Number(Id),
                  }),
                },
              ],
            ],
          },
        );
      } else if (type === 'miniStadion') {
        return this.ownerService.miniStadion(ctx, Number(Id), lang);
      } else if (type?.startsWith('Split')) {
        const [_, count] = type.split('-');
        return this.ownerService.stadionSplit(
          ctx,
          Number(count),
          Number(Id),
          lang,
        );
      }
    } catch (error) {}
  }
  @Action(/SelectOwnerPremium_(\w+)_(\d+)/)
  async ownerPremium(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const [_, __, ownerId] = ctx.callbackQuery.data.split('_');
    const lang = await this.utils.langs(ctx);
    const owner = await this.prisma.owners.findUnique({
      where: {
        id: Number(ownerId),
      },
    });

    if (!owner) {
      await this.utils.errorFunction(ctx);
      return;
    }

    await this.utils.safeEditOrReply(
      ctx,
      this.i18n.translate('premium.premium_extend.text', {
        lang,
        args: {
          month1_label: PLAN_LABELS[lang]['MONTH_1'],
          month3_label: PLAN_LABELS[lang]['MONTH_3'],
          year1_label: PLAN_LABELS[lang]['YEAR_1'],

          month1_price: this.utils.formatPrice('MONTH_1', lang),
          month3_price: this.utils.formatPrice('MONTH_3', lang),
          year1_price: this.utils.formatPrice('YEAR_1', lang),
        },
      }),
      {
        inline_keyboard: [
          [
            {
              text: `${PLAN_LABELS[lang]['MONTH_1']} — ${Premium_price.MONTH_1}`,
              callback_data: JSON.stringify({
                type: 'premium_buy',
                plan: 'MONTH_1',
                id: ownerId,
              }),
            },
          ],
          [
            {
              text: `${PLAN_LABELS[lang]['MONTH_3']} — ${Premium_price.MONTH_3}`,
              callback_data: JSON.stringify({
                type: 'premium_buy',
                plan: 'MONTH_3',
                id: ownerId,
              }),
            },
          ],
          [
            {
              text: `${PLAN_LABELS[lang]['YEAR_1']} — ${Premium_price.YEAR_1}`,
              callback_data: JSON.stringify({
                type: 'premium_buy',
                plan: 'YEAR_1',
                id: ownerId,
              }),
            },
          ],
          [
            {
              text: this.i18n.translate('schedule.back', {
                lang,
              }),
              callback_data: `backOwner_premium_${ownerId}`,
            },
          ],
        ],
      },
    );
  }
  @Action(/backOwner_premium_(\d+)/)
  async backOwner(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const [_, type, id] = ctx.callbackQuery.data.split('_');
    if (type === 'premium') {
      return this.ownerService.premium(ctx, Number(id), lang);
    }
  }

  @Action(/stadion_type_(.+)/)
  async stadion_type(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.session.stadion_step === 'stadion_type') {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch (error) {}

        const [_, __, type] = ctx.callbackQuery.data.split('_');
        ctx.session.stadion_step = null;
        return this.botService.createStadion(ctx, type as EStadion_type);
      }
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, type] = ctx.callbackQuery.data.split('_');

      if (type?.startsWith('workingStatus-')) {
        const id = Number(type.split('-')[1]);

        try {
          const stadion = await this.prisma.stadion.findUnique({
            where: { id },
            include: {
              parent: true,
              children: true,
              owner: {
                include: {
                  ownerCard: true,
                },
              },
            },
          });

          if (!stadion) {
            await this.utils.errorFunction(ctx);
            return;
          }

          const stadionIds = getRelatedStadionIds(stadion);

          const activeBookings = await this.prisma.booking.count({
            where: {
              stadion_id: { in: stadionIds },
              status: {
                in: ['CONFIRMED', 'PENDING', 'PAID'],
              },
            },
          });

          if (stadion.working_status && activeBookings > 0) {
            await ctx.answerCbQuery(
              this.i18n.translate('stadions.workingStatus.alert', { lang }),
              { show_alert: true },
            );
            return;
          }

          if (stadion.working_status) {
            await this.prisma.stadion.updateMany({
              where: {
                id: { in: stadionIds },
              },
              data: {
                working_status: false,
              },
            });

            await ctx.answerCbQuery(
              this.i18n.translate('stadions.workingStatus.off', { lang }),
              { show_alert: true },
            );
            return;
          }
          const ownerCard = stadion.owner.ownerCard;
          if (
            !stadion.working_status &&
            stadion.payments_type === 'CARD' &&
            !ownerCard
          ) {
            await ctx.answerCbQuery(
              this.i18n.translate('stadions.workingStatus.ownerCard', { lang }),
              { show_alert: true },
            );
            return;
          }
          await this.prisma.stadion.updateMany({
            where: {
              id: { in: stadionIds },
            },
            data: {
              working_status: true,
            },
          });

          await ctx.answerCbQuery(
            this.i18n.translate('stadions.workingStatus.on', { lang }),
            { show_alert: true },
          );
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }
    }
  }

  @Action(/payments_(.+)/)
  async onPayments(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (
      ctx.session.stadion_step === 'stadion' &&
      ctx.session.stadion.payments === 'payments'
    ) {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch {}
      }
      ctx.session.stadion.payments_type = ctx.callbackQuery.data.split(
        '_',
      )[1] as Payments;
      ctx.session.stadion.image = 'image';
      ctx.session.stadion.step = 9;
      ctx.reply(this.i18n.translate('stadions.image', { lang }), {
        reply_markup: {
          keyboard: [
            [{ text: this.i18n.translate('stadions.back', { lang }) }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      ctx.session.stadion.payments = null;
      return;
    }
    if (ctx.session.stadion.payments === 'PAYMENTS') {
      const stadionId = Number(ctx.session.stadion.id);
      const [_, payment] = ctx.callbackQuery.data.split('_');
      try {
        const stadion = await this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: {
            owner: { include: { ownerCard: true } },
            children: true,
          },
        });
        if (!stadion) {
          await this.utils.errorFunction(ctx);
          return;
        }
        const relatedStadionIds = getRelatedStadionIds(stadion);
        const bookingsCount = await this.prisma.booking.count({
          where: {
            stadion_id: { in: relatedStadionIds },
            status: {
              in: ['CONFIRMED', 'PENDING', 'PAID'],
            },
          },
        });
        const cartBooking = await this.prisma.booking.findFirst({
          where: {
            stadion_id: { in: relatedStadionIds },
            status: { in: ['CONFIRMED', 'PENDING', 'PAID'] },
            payment_method: 'CARD',
          },
        });
        const hasCardBooking = Boolean(cartBooking);

        if (stadion.payments_type === (payment as Payments)) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.alert', { lang }),
            { show_alert: true },
          );
          return;
        }

        const ownerCard = stadion.owner.ownerCard;
        let workingStatus = true;

        if (
          (payment as Payments) === 'CARD' &&
          !ownerCard &&
          bookingsCount === 0
        ) {
          workingStatus = false;
        } else if (
          (payment as Payments) === 'CARD' &&
          !ownerCard &&
          bookingsCount > 0
        ) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.ownerCard', { lang }),
            { show_alert: true },
          );
          return;
        } else if (
          stadion.payments_type === 'CARD' &&
          (payment as Payments) === 'CASH' &&
          bookingsCount > 0
        ) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.cardToCash', { lang }),
            { show_alert: true },
          );
          return;
        } else if (
          stadion.payments_type === 'CASH' &&
          (payment as Payments) === 'CARD' &&
          bookingsCount > 0 &&
          !hasCardBooking
        ) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.cashToCard', { lang }),
            { show_alert: true },
          );
          return;
        } else if (
          stadion.payments_type === 'GIBRID' &&
          (payment as Payments) === 'CASH' &&
          bookingsCount > 0 &&
          hasCardBooking
        ) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.hybridToCash', { lang }),
            { show_alert: true },
          );
          return;
        } else if (
          stadion.payments_type === 'GIBRID' &&
          (payment as Payments) === 'CARD' &&
          bookingsCount > 0 &&
          !hasCardBooking
        ) {
          await ctx.answerCbQuery(
            this.i18n.translate('stadions.payments.hybridToCard', { lang }),
            { show_alert: true },
          );
          return;
        }

        await this.prisma.stadion.updateMany({
          where: { id: { in: relatedStadionIds } },
          data: {
            payments_type: payment as Payments,
            working_status: workingStatus,
          },
        });

        ctx.session.stadion.payments = null;
        ctx.session.stadion.id = null;

        return this.ownerService.stadionPayments(ctx, stadion.id, lang);
      } catch (error) {
        console.log(error);
        await this.utils.errorFunction(ctx);
      }
    } else {
      ctx.reply(this.i18n.translate('error.sesion', { lang }), {
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
    }
  }

  /////////////////////////////////////////⬇️⬇️⬇️⬇️⬇️  ADMIN PANELi  ⬇️⬇️⬇️⬇️⬇️//////////////////////////////////////////////

  @Action(/admins_(.+)/)
  async stadiumMenu(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const type = ctx.callbackQuery.data.split('_')[1];
    return this.adminPaneli.admins_stadiums(ctx, type, lang);
  }
  @Action(/stadium_(.+)_(\d+)_(\d+)/)
  async status(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, status, Id, page] = ctx.callbackQuery.data.split('_');
    return this.adminPaneli.stadium_status(ctx, status, Number(Id), page);
  }
  @Action(/stadiumChecking_(approved|rejected)_(\d+)_(\d+)/)
  async stadiumChecking(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, status, stadionId, currentPage] =
      ctx.callbackQuery.data.split('_');
    return this.adminPaneli.status_Checking(
      ctx,
      status,
      Number(stadionId),
      Number(currentPage),
    );
  }
  @Action(/stadiumConfirm_(rejected|approved)_(\d+)/)
  async stadiumConfirm(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, status, stadionId, currentPage] =
      ctx.callbackQuery.data.split('_');
    return this.adminPaneli.stadiumConfirm(ctx, status, Number(stadionId));
  }
  @Action(/AdminPanel_Owner_(\w+)_(\d+)_(\d+)/)
  async AdminPaner_Owner(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }

    const parts = ctx.callbackQuery.data.split('_');
    const page = parts[parts.length - 1];
    const ownerId = parts[parts.length - 2];
    const status = parts[2];
    const action =
      parts.length > 5 ? (parts[3] as 'activate' | 'block') : undefined;

    return this.adminPaneli.AdminPanel_owner(
      ctx,
      status,
      Number(ownerId),
      Number(page),
      action,
    );
  }
  @Action(/AdminOwner_(\w+)_(\d+)_(\d+)_(\d+)/)
  async AdminOwner(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, status, ownerId, currentPage, historyPage] =
      ctx.callbackQuery.data.split('_');
    return this.adminPaneli.AdminOwner_select(
      ctx,
      status,
      Number(ownerId),
      Number(currentPage),
      Number(historyPage),
    );
  }
  @Action(/ownerPremiumReason_(\w+)_(\d+)_(\d+)/)
  async ownerPremiumReason(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, reason, ownerId, currentPage] = ctx.callbackQuery.data.split('_');
    return this.adminPaneli.ownerPremiumReason(
      ctx,
      reason,
      Number(ownerId),
      Number(currentPage),
    );
  }
  @Action(/ownerPremiumGift_(\d+)_(\d+)_(\d+)_(\w+)/)
  async ownerPremiumGift(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, days, ownerId, currentPage, reason] =
      ctx.callbackQuery.data.split('_');
    return this.adminPaneli.ownerPremiumGift(
      ctx,
      Number(days),
      Number(ownerId),
      Number(currentPage),
      reason as PremiumReason,
    );
  }
  @Action(/AdminOwnerConfirmGift_(\d+)_(\d+)_(\d+)_(\w+)/)
  async AdminOwnerConfirmGift(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const userId = ctx.from?.id;
    if (!userId || !this.AdminChatid.includes(Number(userId))) {
      await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
        parse_mode: 'HTML',
      });
      ctx.answerCbQuery().catch(() => {});
      return;
    }
    const [_, days, ownerId, currentPage, reason] =
      ctx.callbackQuery.data.split('_');
    return this.adminPaneli.AdminOwnerConfirmGift(
      ctx,
      Number(days),
      Number(ownerId),
      Number(currentPage),
      reason as PremiumReason,
    );
  }
  @Action(/AdminOwnerStadium_detail_(\d+)_(\d+)_(\d+)_(\d+)/)
  async AdminOwner_stadium_detail(@Ctx() ctx: MyContext) {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      const lang = await this.utils.langs(ctx);

      const userId = ctx.from?.id;
      if (!userId || !this.AdminChatid.includes(Number(userId))) {
        await ctx.reply(this.i18n.translate('admin.admin_only', { lang }), {
          parse_mode: 'HTML',
        });
        ctx.answerCbQuery().catch(() => {});
        return;
      }

      const [_, __, stadionId, ownerId, currentPage, historyPage] =
        ctx.callbackQuery.data.split('_');

      return this.adminPaneli.admin_stadions_details(
        ctx,
        Number(stadionId),
        Number(ownerId),
        currentPage,
        historyPage,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  @Action(/admin_back_(\d+)/)
  async adminBack(@Ctx() ctx: MyContext) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    const lang = await this.utils.langs(ctx);
    const [_, __, step] = ctx.callbackQuery.data.split('_');
    switch (step) {
      case '1': {
        return this.adminPaneli.admin_paneli(ctx, lang);
      }
      case '2': {
        if (ctx.session.admin_messageId) {
          await ctx.deleteMessage(ctx.session.admin_messageId).catch(() => {});
          ctx.session.admin_messageId = null;
          ctx.session.admin_step = null;
          ctx.session.ownerId = null;
          ctx.session.currentPage = null;
          ctx.session.historyPage = null;
          ctx.session.confirment_messageId = null;
        }
      }
    }
  }

  /////////////////////////////////////////⬆️⬆️⬆️⬆️⬆️  ADMIN PANELi  ⬆️⬆️⬆️⬆️⬆️//////////////////////////////////////////////

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
        case 'premium_provider':
          {
            const keyboard = PAYMENT_PROVIDERS.map((provider) => [
              {
                text: `${provider.icon} ${this.i18n.translate(
                  provider.translationKey,
                  { lang },
                )}`,
                callback_data: `premiumProvider|${provider.key}|${data.plan}|${data.id}`,
              },
            ]);

            keyboard.push([
              {
                text: this.i18n.translate('schedule.back', {
                  lang,
                }),
                callback_data: JSON.stringify({
                  type: 'premium_buy',
                  id: data.id,
                  plan: data.plan,
                }),
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('premium.payment.choose_provider', {
                lang,
              }),
              {
                inline_keyboard: keyboard,
              },
            );
          }
          break;

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
                      callback_data: `advertisement.advertisement_create_${ownerId}`,
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
          return this.ownerService.owner_card(ctx, lang);

        case this.i18n.translate('menyu_buttons.settings', { lang }):
          if (await this.utils.isChecket(String(ctx.from?.id), ctx)) {
            return this.ownerService.ownerSettings(ctx, lang);
          } else {
            return this.userService.settings(ctx, lang);
          }

        case this.i18n.translate('menyu_buttons.help', { lang }): {
          if (await this.utils.isChecket(String(ctx.from?.id), ctx)) {
            ctx.reply(
              this.i18n.translate('help.help.title', { lang }),
              helpMenuKeyboard_Owner(this.i18n, lang),
            );
            return;
          } else {
            ctx.reply(
              this.i18n.translate('user_help.menu.title', { lang }),
              helpMenuKeyboard_Users(this.i18n, lang),
            );
            return;
          }
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
          await ctx.editMessageText(this.i18n.translate("admin.booking.enter_phone",{lang}));
          
        } catch (error) {
          const sent = await ctx.reply(this.i18n.translate("admin.booking.enter_phone",{lang}))
          ctx.session.admin_booking_messages ??= []
          ctx.session.admin_booking_messages.push(sent.message_id)
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
