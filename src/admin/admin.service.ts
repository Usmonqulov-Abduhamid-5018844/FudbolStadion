import { Injectable } from '@nestjs/common';
import { NotificationType, PremiumReason } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { formatDate } from 'src/helpers/dateFormat';
import { PLAN_LABELS, PremiumPlan } from 'src/helpers/interface';
import { getLocation } from 'src/helpers/lokationSeorch';
import { getPremiumReasonText } from 'src/helpers/reason';
import { NotifikationService } from 'src/notifikation/notifikation.service';
import { PrismaService } from 'src/prisma/prisma.service';

import { UtilisService } from 'src/utils/utile.service';
import { InlineKeyboardButton } from 'telegraf/types';

@Injectable()
export class AdminService {
  constructor(
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilisService,
    private readonly notificationService: NotifikationService,
  ) {}
  async admin_paneli(ctx: MyContext, lang: string) {
    try {
      const owners = await this.prisma.owners.count();
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('admin.title', { lang }),
        {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('admin.language', { lang }),
                callback_data: 'admins_lang',
              },
            ],
            [
              {
                text: this.i18n.translate('admin.statistics', { lang }),
                callback_data: 'admins_stats',
              },
              {
                text: this.i18n.translate('admin.stadiums', { lang }),
                callback_data: 'admins_stadiums',
              },
            ],
            [
              {
                text: this.i18n.translate('admin.bookings', { lang }),
                callback_data: 'admins_bookings',
              },
              {
                text: this.i18n.translate('admin.premium', { lang }),
                callback_data: 'admins_premium',
              },
            ],
            [
              {
                text: this.i18n.translate('admin.owners', {
                  lang,
                  args: { count: owners },
                }),
                callback_data: 'admins_owners',
              },
              {
                text: this.i18n.translate('admin.broadcast', { lang }),
                callback_data: 'admins_broadcast',
              },
            ],
          ],
        },
      );
      if (ctx.session.admin_messageId) {
        await ctx.deleteMessage(ctx.session.admin_messageId);
      }
    } catch (error) {}
  }
  async admins_stadiums(ctx: MyContext, type: string) {
    try {
      const lang = await this.utils.langs(ctx);
      switch (type) {
        case 'lang': {
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('common.START', { lang }),
            {
              inline_keyboard: [
                [
                  {
                    text: `🇺🇿 O'zbekcha`,
                    callback_data: 'lang_uz',
                  },
                ],
                [
                  {
                    text: `🇷🇺 Русский`,
                    callback_data: 'lang_ru',
                  },
                ],
                [
                  {
                    text: `🇬🇧 English`,
                    callback_data: 'lang_en',
                  },
                ],
              ],
            },
          );

          break;
        }
        case 'stats':
          {
            ctx.reply('Statistika');
          }
          break;
        case 'stadiums':
          {
            const [pending, approved, rejected] = await Promise.all([
              this.prisma.stadion.count({
                where: { admin_status: 'PENDING' },
              }),
              this.prisma.stadion.count({
                where: { admin_status: 'APPROVED' },
              }),
              this.prisma.stadion.count({
                where: { admin_status: 'REJECTED' },
              }),
            ]);
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.stadium.title', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('admin.stadium.pending', {
                        lang,
                        args: { count: pending },
                      }),
                      callback_data: 'stadium_pending_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('admin.stadium.approved', {
                        lang,
                        args: { count: approved },
                      }),
                      callback_data: 'stadium_approved_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('admin.stadium.rejected', {
                        lang,
                        args: { count: rejected },
                      }),
                      callback_data: 'stadium_rejected_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'admin_back_1',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'bookings':
          {
            ctx.reply('Bookings');
          }
          break;
        case 'premium':
          {
            ctx.reply('Premium');
          }
          break;
        case 'owners':
          {
            const [active, blocked] = await Promise.all([
              this.prisma.owners.count({ where: { status: 'ACTIVE' } }),
              this.prisma.owners.count({ where: { status: 'BLOCKED' } }),
            ]);
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.owner.title', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('admin.owner.active', {
                        lang,
                        args: { count: active },
                      }),
                      callback_data: 'AdminPaner_Owner_active_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('admin.owner.blocked', {
                        lang,
                        args: { count: blocked },
                      }),
                      callback_data: 'AdminPaner_Owner_blocked_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('admin.owner.search', { lang }),
                      callback_data: 'AdminPaner_Owner_search_0_1',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'admin_back_1',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'broadcast':
          {
            ctx.reply('Habar yuborish');
          }
          break;
        default: {
          await this.utils.errorFunction(ctx);
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadium_status(
    ctx: MyContext,
    status: string,
    Id: number,
    page: string,
  ) {
    try {
      const lang = await this.utils.langs(ctx);

      const limit = 5;
      const currentPage = Math.max(1, Number(page) || 1);
      switch (status) {
        case 'pending':
          {
            const [list, total] = await Promise.all([
              this.prisma.stadion.findMany({
                where: { admin_status: 'PENDING' },
                skip: (currentPage - 1) * limit,
                take: limit,
              }),
              this.prisma.stadion.count({
                where: { admin_status: 'PENDING' },
              }),
            ]);

            if (!list.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('admin.pending_empty', { lang }),
                {
                  show_alert: true,
                },
              );
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Previous', { lang }),
                callback_data: `stadium_pending_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `📄 ${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Next', { lang }),
                callback_data: `stadium_pending_${Id}_${currentPage + 1}`,
              });
            }

            const button: InlineKeyboardButton[][] = list.map((s) => [
              {
                text: `🏟 ${s.name}`,
                callback_data: `stadium_view_${s.id}_${currentPage}`,
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.pending_list', { lang }),
              {
                inline_keyboard: [
                  ...button,
                  ...(totalPages > 1 ? [paginationButtons] : []),
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'admins_stadiums',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'approved':
          {
            const [list, total] = await Promise.all([
              this.prisma.stadion.findMany({
                where: { admin_status: 'APPROVED' },
                skip: (currentPage - 1) * limit,
                take: limit,
              }),
              this.prisma.stadion.count({
                where: { admin_status: 'APPROVED' },
              }),
            ]);

            if (!list.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('admin.approved_empty', { lang }),
                {
                  show_alert: true,
                },
              );
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Previous', { lang }),
                callback_data: `stadium_approved_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Next', { lang }),
                callback_data: `stadium_approved_${Id}_${currentPage + 1}`,
              });
            }

            const button: InlineKeyboardButton[][] = list.map((s) => [
              {
                text: `🏟 ${s.name}`,
                callback_data: `stadium_view_${s.id}_${currentPage}`,
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.approved_list', { lang }),
              {
                inline_keyboard: [
                  ...button,
                  ...(totalPages > 1 ? [paginationButtons] : []),
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'admins_stadiums',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'rejected':
          {
            const [list, total] = await Promise.all([
              this.prisma.stadion.findMany({
                where: { admin_status: 'REJECTED' },
                skip: (currentPage - 1) * limit,
                take: limit,
              }),
              this.prisma.stadion.count({
                where: { admin_status: 'REJECTED' },
              }),
            ]);

            if (!list.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('admin.rejected_empty', { lang }),
                {
                  show_alert: true,
                },
              );
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Previous', { lang }),
                callback_data: `stadium_rejected_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: this.i18n.translate('stadions.Next', { lang }),
                callback_data: `stadium_rejected_${Id}_${currentPage + 1}`,
              });
            }

            const button: InlineKeyboardButton[][] = list.map((s) => [
              {
                text: `🏟 ${s.name}`,
                callback_data: `stadium_view_${s.id}_${currentPage}`,
              },
            ]);

            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.rejected_list', { lang }),
              {
                inline_keyboard: [
                  ...button,
                  ...(totalPages > 1 ? [paginationButtons] : []),
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'admins_stadiums',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'view':
          {
            const stadion = await this.prisma.stadion.findUnique({
              where: {
                id: Id,
              },
              include: {
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
              },
            });

            if (!stadion) {
              await ctx.answerCbQuery(
                this.i18n.translate('admin.not_found', { lang }),
                {
                  show_alert: true,
                },
              );
              return;
            }
            const schedules =
              stadion.stadionChedules.length > 0
                ? stadion.stadionChedules
                : (stadion.parent?.stadionChedules ?? []);

            const offDaySchedules =
              stadion.stadionOffDays.length > 0
                ? stadion.stadionOffDays
                : (stadion.parent?.stadionOffDays ?? []);

            const specialSchedules =
              stadion.stadionSpecialSchedules.length > 0
                ? stadion.stadionSpecialSchedules
                : (stadion.parent?.stadionSpecialSchedules ?? []);

            const weekDays = schedules.length
              ? schedules
                  .map(
                    (s) =>
                      `${this.i18n.translate(
                        `admin.week_days.${s.day_of_week}`,
                        { lang },
                      )}: ${s.start_time} - ${s.end_time}`,
                  )
                  .join('\n')
              : this.i18n.translate('admin.stadium_list.no_data', { lang });

            const offDays = offDaySchedules.length
              ? offDaySchedules.map((d) => formatDate(d.date, lang)).join('\n')
              : this.i18n.translate('admin.stadium_list.no_data', { lang });

            const specialDays = specialSchedules.length
              ? specialSchedules
                  .map(
                    (s) =>
                      `${formatDate(s.date, lang)}, ${s.start_time} - ${s.end_time}`,
                  )
                  .join('\n')
              : this.i18n.translate('admin.stadium_list.no_data', { lang });

            const stadionType = stadion.parent_id
              ? this.i18n.translate('admin.stadium_list.types.child', { lang })
              : stadion.mini
                ? this.i18n.translate('admin.stadium_list.types.mini', { lang })
                : this.i18n.translate('admin.stadium_list.types.main', {
                    lang,
                  });
            const statusText = this.i18n.translate(
              `admin.stadium_list.statuses.${stadion.admin_status.toLowerCase()}`,
              { lang },
            );
            const text = this.i18n.translate('admin.stadium_list.details', {
              lang,
              args: {
                id: stadion.id,
                name: stadion.name,
                type: stadionType,
                location: getLocation(
                  stadion.latitude,
                  stadion.longitude,
                  stadion.region.name,
                  stadion.region_items.name,
                ),
                owner: stadion.owner.full_name,
                phone: stadion.owner.phone,
                price: stadion.price?.toLocaleString(),
                status: statusText,
                weekDays,
                offDays,
                specialDays,
                createdAt: formatDate(stadion.createdAt, lang),
              },
            });

            const actionButtons: InlineKeyboardButton[][] = [];

            if (stadion.admin_status === 'PENDING') {
              actionButtons.push([
                {
                  text: this.i18n.translate(
                    'admin.stadium_list.buttons.approve',
                    { lang },
                  ),
                  callback_data: `stadiumChecking_approved_${stadion.id}_${currentPage}`,
                },

                {
                  text: this.i18n.translate(
                    'admin.stadium_list.buttons.reject',
                    { lang },
                  ),
                  callback_data: `stadiumChecking_rejected_${stadion.id}_${currentPage}`,
                },
              ]);
            }

            if (stadion.admin_status === 'APPROVED') {
              actionButtons.push([
                {
                  text: this.i18n.translate(
                    'admin.stadium_list.buttons.reject',
                    { lang },
                  ),
                  callback_data: `stadiumChecking_rejected_${stadion.id}_${currentPage}`,
                },
              ]);
            }

            if (stadion.admin_status === 'REJECTED') {
              actionButtons.push([
                {
                  text: this.i18n.translate(
                    'admin.stadium_list.buttons.approve',
                    { lang },
                  ),
                  callback_data: `stadiumChecking_approved_${stadion.id}_${currentPage}`,
                },
              ]);
            }
            await this.utils.safeEditOrReply(ctx, text, {
              inline_keyboard: [
                ...actionButtons,
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: `stadium_${stadion.admin_status.toLowerCase()}_${stadion.id}_${currentPage}`,
                  },
                ],
              ],
            });
          }
          break;
        default: {
          await this.utils.errorFunction(ctx);
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async status_Checking(
    ctx: MyContext,
    status: string,
    stadionId: number,
    page: number,
  ) {
    try {
      const lang = await this.utils.langs(ctx);
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!stadion) return await this.utils.errorFunction(ctx);

      switch (status) {
        case 'approved':
          {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.stadium_list.approve_confirm', {
                lang,
              }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate(
                        'admin.stadium_list.button.approve',
                        { lang },
                      ),
                      callback_data: `stadiumConfirm_approved_${stadion.id}`,
                    },
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: `stadium_view_${stadion.id}_${page}`,
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'rejected':
          {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('admin.stadium_list.reject_confirm', {
                lang,
              }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate(
                        'admin.stadium_list.Button.reject',
                        { lang },
                      ),
                      callback_data: `stadiumConfirm_rejected_${stadion.id}`,
                    },
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: `stadium_view_${stadion.id}_${page}`,
                    },
                  ],
                ],
              },
            );
          }
          break;
        default: {
          await this.utils.errorFunction(ctx);
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      await ctx
        .answerCbQuery()
        .then(() => {})
        .catch();
    }
  }
  async stadiumConfirm(ctx: MyContext, status: string, stadionId: number) {
    try {
      const lang = await this.utils.langs(ctx);
      if (status === 'approved') {
        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { admin_status: 'APPROVED' },
        });
        await ctx.answerCbQuery(
          this.i18n.translate('admin.stadium_list.approved_success', { lang }),
          { show_alert: true },
        );
        return this.stadium_status(ctx, status, stadionId, '1');
      } else {
        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { admin_status: 'REJECTED' },
        });
        await ctx.answerCbQuery(
          this.i18n.translate('admin.stadium_list.rejected_success', { lang }),
          { show_alert: true },
        );
        return this.stadium_status(ctx, status, stadionId, '1');
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async AdminPaner_owner(
    ctx: MyContext,
    status: string,
    ownerId: number,
    page: number,
  ) {
    try {
      const lang = await this.utils.langs(ctx);
      const limit = 1;
      const currentPage = Math.max(1, Number(page) || 1);

      switch (status) {
        case 'active': {
          const [owners, total] = await Promise.all([
            this.prisma.owners.findMany({
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                full_name: true,
              },
              skip: (currentPage - 1) * limit,
              take: limit,
              orderBy: {
                id: 'asc',
              },
            }),
            this.prisma.owners.count({
              where: { status: 'ACTIVE' },
            }),
          ]);

          if (!owners.length) {
            await ctx.answerCbQuery(
              this.i18n.translate('admin.active_empty', { lang }),
              { show_alert: true },
            );
            return;
          }

          const totalPages = Math.ceil(total / limit);

          const buttons: InlineKeyboardButton[][] = [];

          owners.forEach((item) => {
            buttons.push([
              {
                text: `👤 ${item.full_name}`,
                callback_data: `AdminPaner_Owner_detels_${item.id}_${currentPage}`,
              },
            ]);
          });

          const pagination: InlineKeyboardButton[] = [];

          if (currentPage > 1) {
            pagination.push({
              text: this.i18n.translate('admin.Previous', { lang }),
              callback_data: `AdminPaner_Owner_active_${currentPage - 1}`,
            });
          }

          pagination.push({
            text: `📄 ${currentPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (currentPage < totalPages) {
            pagination.push({
              text: this.i18n.translate('admin.Next', { lang }),
              callback_data: `AdminPaner_Owner_active_${currentPage + 1}`,
            });
          }

          buttons.push(totalPages > 1 ? pagination : []);

          buttons.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: 'admins_owners',
            },
          ]);

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('admin.active_list', { lang }),
            {
              inline_keyboard: buttons,
            },
          );
          break;
        }

        case 'blocked': {
          const [owners, total] = await Promise.all([
            this.prisma.owners.findMany({
              where: { status: 'BLOCKED' },
              select: {
                id: true,
                full_name: true,
              },
              skip: (currentPage - 1) * limit,
              take: limit,
              orderBy: {
                id: 'asc',
              },
            }),
            this.prisma.owners.count({
              where: { status: 'BLOCKED' },
            }),
          ]);

          if (!owners.length) {
            await ctx.answerCbQuery(
              this.i18n.translate('admin.blocked_empty', { lang }),
              {
                show_alert: true,
              },
            );
            return;
          }

          const totalPages = Math.ceil(total / limit);

          const buttons: InlineKeyboardButton[][] = [];

          owners.forEach((item) => {
            buttons.push([
              {
                text: `👤 ${item.full_name}`,
                callback_data: `AdminPaner_Owner_detels_${item.id}_${currentPage}`,
              },
            ]);
          });

          const pagination: InlineKeyboardButton[] = [];

          if (currentPage > 1) {
            pagination.push({
              text: this.i18n.translate('admin.Previous', { lang }),
              callback_data: `AdminPaner_Owner_active_${currentPage - 1}`,
            });
          }

          pagination.push({
            text: `📄 ${currentPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (currentPage < totalPages) {
            pagination.push({
              text: this.i18n.translate('admin.Next', { lang }),
              callback_data: `AdminPaner_Owner_active_${currentPage + 1}`,
            });
          }

          buttons.push(totalPages > 1 ? pagination : []);

          buttons.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: 'admins_owners',
            },
          ]);

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('admin.blocked_list', { lang }),
            {
              inline_keyboard: buttons,
            },
          );
          break;
        }

        case 'detels': {
          const [owner, bookingCount] = await Promise.all([
            this.prisma.owners.findUnique({
              where: { id: ownerId },
              include: {
                subscriptions: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                  },
                },
                _count: {
                  select: {
                    stadions: true,
                  },
                },
              },
            }),

            this.prisma.booking.count({
              where: {
                stadion: {
                  owner_id: ownerId,
                },
              },
            }),
          ]);
          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }
          const stadiumCount = owner._count.stadions ?? 0;
          const hasActivePremium = owner.subscriptions.length > 0;

          const text = this.i18n.translate('admin.details', {
            lang,
            args: {
              id: owner.id,
              fullName: owner.full_name,
              phone: owner.phone,
              email:
                owner.email ??
                this.i18n.translate('admin.email_empty', { lang }),
              stadiumCount,
              bookingCount,
              premium: this.i18n.translate(
                hasActivePremium
                  ? 'admin.Premium.active'
                  : 'admin.Premium.inactive',
                { lang },
              ),
              status: this.i18n.translate(
                owner.status === 'ACTIVE'
                  ? 'admin.status.active'
                  : 'admin.status.blocked',
                { lang },
              ),
            },
          });

          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('admin.buttons.stadiums', { lang }),
                  callback_data: `AdminOwner_stadiums_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: this.i18n.translate('admin.buttons.premium', { lang }),
                  callback_data: `AdminOwner_premium_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: this.i18n.translate(
                    owner.status === 'ACTIVE'
                      ? 'admin.buttons.block'
                      : 'admin.buttons.activate',
                    { lang },
                  ),
                  callback_data: `AdminPaner_Owner_status_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: `AdminPaner_Owner_${owner.status.toLowerCase()}_${owner.id}_${currentPage}`,
                },
              ],
            ],
          });
          break;
        }

        case 'status': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: ownerId },
            select: {
              id: true,
              status: true,
              full_name: true,
            },
          });

          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }

          const isActive = owner.status === 'ACTIVE';

          const text = this.i18n.translate(
            isActive ? 'admin.confirm.block' : 'admin.confirm.activate',
            {
              lang,
              args: {
                fullName: owner.full_name,
              },
            },
          );
          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate(
                    isActive
                      ? 'admin.confirm.buttons.confirm_block'
                      : 'admin.confirm.buttons.confirm_activate',
                    { lang },
                  ),
                  callback_data: `AdminPaner_Owner_confirm_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: `AdminPaner_Owner_detels_${owner.id}_${currentPage}`,
                },
              ],
            ],
          });

          break;
        }
        case 'confirm': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: ownerId },
            select: {
              id: true,
              status: true,
              full_name: true,
            },
          });

          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }

          const updatedOwner = await this.prisma.owners.update({
            where: { id: ownerId },
            data: {
              status: owner.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE',
            },
          });

          await ctx.answerCbQuery(
            this.i18n.translate(
              updatedOwner.status === 'ACTIVE'
                ? 'admin.status_updated.active'
                : 'admin.status_updated.blocked',
              {
                lang,
                args: {
                  fullName: owner.full_name,
                },
              },
            ),
          );
          return this.AdminPaner_owner(
            ctx,
            'detels',
            updatedOwner.id,
            currentPage,
          );
        }

        default: {
          await this.utils.errorFunction(ctx);
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async AdminOwner_premium(
    ctx: MyContext,
    status: string,
    ownerId: number,
    currentPage: number,
    historyPage: number,
  ) {
    try {
      const limit = 5;
      const lang = await this.utils.langs(ctx);
      switch (status) {
        case 'premium': {
          const owner = await this.prisma.owners.findUnique({
            where: { id: ownerId },
            include: {
              subscriptions: {
                where: {
                  isActive: true,
                },
                take: 1,
              },
            },
          });

          if (!owner) {
            await this.utils.errorFunction(ctx);
            return;
          }

          const premium = owner.subscriptions[0];

          const statistics = premium
            ? await this.prisma.premiumTransaction.groupBy({
                by: ['reason'],
                where: {
                  owner_id: owner.id,
                  subscription_id: premium.id,
                  status: 'SUCCESS',
                },
                _sum: {
                  duration: true,
                },
              })
            : [];

          const purchaseDays =
            statistics.find((i) => i.reason === 'PURCHASE')?._sum.duration ?? 0;

          const giftDays =
            statistics.find((i) => i.reason === 'GIFT')?._sum.duration ?? 0;

          const compensationDays =
            statistics.find((i) => i.reason === 'COMPENSATION')?._sum
              .duration ?? 0;

          const trialDays =
            statistics.find((i) => i.reason === 'TRIAL')?._sum.duration ?? 0;

          const statisticsText: string[] = [];

          if (purchaseDays > 0) {
            statisticsText.push(
              this.i18n.translate('admin.premiums.statistics.purchase', {
                lang,
                args: {
                  days: purchaseDays,
                },
              }),
            );
          }

          if (giftDays > 0) {
            statisticsText.push(
              this.i18n.translate('admin.premiums.statistics.gift', {
                lang,
                args: {
                  days: giftDays,
                },
              }),
            );
          }

          if (compensationDays > 0) {
            statisticsText.push(
              this.i18n.translate('admin.premiums.statistics.compensation', {
                lang,
                args: {
                  days: compensationDays,
                },
              }),
            );
          }

          if (trialDays > 0) {
            statisticsText.push(
              this.i18n.translate('admin.premiums.statistics.trial', {
                lang,
                args: {
                  days: trialDays,
                },
              }),
            );
          }

          const text = premium
            ? this.i18n.translate('admin.premiums.details_active', {
                lang,
                args: {
                  owner: owner.full_name,
                  plan: PLAN_LABELS[lang][premium.plan],
                  startDate: formatDate(premium.startDate, lang),
                  endDate: formatDate(premium.endDate, lang),
                  statistics: statisticsText.join('\n\n'),
                },
              })
            : this.i18n.translate('admin.premiums.details_inactive', {
                lang,
                args: {
                  owner: owner.full_name,
                },
              });

          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('admin.premiums.buttons.gift', {
                    lang,
                  }),
                  callback_data: `AdminOwner_gift_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: this.i18n.translate('admin.premiums.buttons.history', {
                    lang,
                  }),
                  callback_data: `AdminOwner_history_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', {
                    lang,
                  }),
                  callback_data: `AdminPaner_Owner_detels_${owner.id}_${currentPage}`,
                },
              ],
            ],
          });

          break;
        }
        case 'history': {
          const [history, total] = await Promise.all([
            this.prisma.subscription.findMany({
              where: {
                ownerId,
                isActive: false,
              },
              include: {
                premiumTransactions: {
                  where: {
                    status: 'SUCCESS',
                  },
                  take: 1,
                  orderBy: {
                    createdAt: 'desc',
                  },
                },
              },
              orderBy: {
                endDate: 'desc',
              },
              skip: (historyPage - 1) * limit,
              take: limit,
            }),

            this.prisma.subscription.count({
              where: {
                ownerId,
                isActive: false,
              },
            }),
          ]);

          if (!history.length) {
            await ctx.answerCbQuery(
              this.i18n.translate('admin.premium_history.history.empty', {
                lang,
              }),
              {
                show_alert: true,
              },
            );
            return;
          }

          const totalPages = Math.ceil(total / limit);

          const historyText = history
            .map((item, index) => {
              const transaction = item.premiumTransactions[0];

              return this.i18n.translate('admin.premium_history.history.item', {
                lang,
                args: {
                  index: (historyPage - 1) * limit + index + 1,
                  plan: PLAN_LABELS[lang][item.plan],
                  reason: getPremiumReasonText(item.reason, this.i18n, lang),
                  startDate: formatDate(item.startDate, lang),
                  endDate: formatDate(item.endDate, lang),
                  amount: transaction
                    ? `${transaction.amount.toLocaleString('uz-UZ')} ${this.i18n.translate('admin.premium_history.currency', { lang })}`
                    : this.i18n.translate('admin.premium_history.free', {
                        lang,
                      }),
                  provider:
                    transaction?.provider === 'ADMIN_GIFT'
                      ? this.i18n.translate(
                          'admin.premium_history.provider.admin',
                          { lang },
                        )
                      : (transaction?.provider ??
                        this.i18n.translate(
                          'admin.premium_history.provider.unknown',
                          {
                            lang,
                          },
                        )),
                },
              });
            })
            .join('\n\n━━━━━━━━━━━━━━━\n\n');

          const pagination: InlineKeyboardButton[] = [];

          if (historyPage > 1) {
            pagination.push({
              text: this.i18n.translate('admin.Previous', { lang }),
              callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${historyPage - 1}`,
            });
          }

          pagination.push({
            text: `${historyPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (historyPage < totalPages) {
            pagination.push({
              text: this.i18n.translate('admin.Next', { lang }),
              callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${historyPage + 1}`,
            });
          }

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('admin.premium_history.history.title', {
              lang,
              args: {
                history: historyText,
              },
            }),
            {
              inline_keyboard: [
                ...(totalPages > 1 ? [pagination] : []),
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: `AdminOwner_premium_${ownerId}_${currentPage}_1`,
                  },
                ],
              ],
            },
          );

          break;
        }
        case 'gift': {
          const reasons: PremiumReason[] = [
            PremiumReason.GIFT,
            PremiumReason.COMPENSATION,
            PremiumReason.TRIAL,
          ];

          const inline_keyboard = reasons.map((reason) => [
            {
              text: getPremiumReasonText(reason, this.i18n, lang),
              callback_data: `ownerPremiumReason_${reason}_${ownerId}_${currentPage}`,
            },
          ]);

          inline_keyboard.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `AdminOwner_premium_${ownerId}_${currentPage}_${historyPage}`,
            },
          ]);

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('admin.gift.title', { lang }),
            {
              inline_keyboard,
            },
          );
          break;
        }
        default:
          {
            await this.utils.errorFunction(ctx);
          }
          break;
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async ownerPremiumReason(
    ctx: MyContext,
    reason: string,
    ownerId: number,
    currentPage: number,
  ) {
    try {
      const lang = await this.utils.langs(ctx);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('admin.gift.duration.title', { lang }),
        {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('admin.gift.duration.week_1', {
                  lang,
                }),
                callback_data: `ownerPremiumGift_7_${ownerId}_${currentPage}_${reason}`,
              },
              {
                text: this.i18n.translate('admin.gift.duration.month_1', {
                  lang,
                }),
                callback_data: `ownerPremiumGift_30_${ownerId}_${currentPage}_${reason}`,
              },
            ],
            [
              {
                text: this.i18n.translate('admin.gift.duration.month_3', {
                  lang,
                }),
                callback_data: `ownerPremiumGift_90_${ownerId}_${currentPage}_${reason}`,
              },
              {
                text: this.i18n.translate('admin.gift.duration.month_6', {
                  lang,
                }),
                callback_data: `ownerPremiumGift_180_${ownerId}_${currentPage}_${reason}`,
              },
            ],
            [
              {
                text: this.i18n.translate('admin.gift.duration.year_1', {
                  lang,
                }),
                callback_data: `ownerPremiumGift_365_${ownerId}_${currentPage}_${reason}`,
              },
            ],
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: `AdminOwner_gift_${ownerId}_${currentPage}_1`,
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async ownerPremiumGift(
    ctx: MyContext,
    days: number,
    ownerId: number,
    currentPage: number,
    reason: PremiumReason,
  ) {
    try {
      const lang = await this.utils.langs(ctx);
      let plan: PremiumPlan;

      switch (days) {
        case 7:
          plan = PremiumPlan.WEEK_1;
          break;
        case 30:
          plan = PremiumPlan.MONTH_1;
          break;
        case 90:
          plan = PremiumPlan.MONTH_3;
          break;
        case 180:
          plan = PremiumPlan.MONTH_6;
          break;
        case 365:
          plan = PremiumPlan.YEAR_1;
          break;
        default:
          throw new Error("Noto'g'ri premium muddati");
      }
      const owner = await this.prisma.owners.findUnique({
        where: { id: ownerId },
      });
      if (!owner) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const premium = await this.prisma.subscription.findFirst({
        where: {
          ownerId,
          isActive: true,
        },
      });
      const label = PLAN_LABELS[lang][plan];
      const text = this.i18n.translate('admin.confirm_gift.text', {
        lang,
        args: {
          owner: owner.full_name,
          plan: label,
          premiumInfo: premium
            ? this.i18n.translate('admin.confirm_gift.has_premium', { lang })
            : this.i18n.translate('admin.confirm_gift.no_premium', { lang }),
        },
      });

      await this.utils.safeEditOrReply(ctx, text, {
        inline_keyboard: [
          [
            {
              text: this.i18n.translate('admin.confirm_gift.confirm', {
                lang,
              }),
              callback_data: `AdminOwnerConfirmGift_${days}_${owner.id}_${currentPage}_${reason}`,
            },
          ],
          [
            {
              text: this.i18n.translate('admin.confirm_gift.cancel', {
                lang,
              }),
              callback_data: `AdminOwner_premium_${owner.id}_${currentPage}_1`,
            },
          ],
        ],
      });
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async AdminOwnerConfirmGift(
    ctx: MyContext,
    day: number,
    ownerId: number,
    currentPage: number,
    reason: PremiumReason,
  ) {
    try {
      const lang = await this.utils.langs(ctx);

      const owner = await this.prisma.owners.findUnique({
        where: { id: ownerId },
      });

      if (!owner) {
        return await this.utils.errorFunction(ctx);
      }
      let plan: PremiumPlan;

      switch (day) {
        case 7:
          plan = PremiumPlan.WEEK_1;
          break;
        case 30:
          plan = PremiumPlan.MONTH_1;
          break;
        case 90:
          plan = PremiumPlan.MONTH_3;
          break;
        case 180:
          plan = PremiumPlan.MONTH_6;
          break;
        case 365:
          plan = PremiumPlan.YEAR_1;
          break;
        default:
          throw new Error("Noto'g'ri premium muddati");
      }

      const daysMap: Record<PremiumPlan, number> = {
        WEEK_1: 7,
        MONTH_1: 30,
        MONTH_3: 90,
        MONTH_6: 180,
        YEAR_1: 365,
      };

      const days = daysMap[plan];

      await this.prisma.$transaction(async (tx) => {
        const activeSubscription = await tx.subscription.findFirst({
          where: {
            ownerId,
            isActive: true,
          },
        });

        if (activeSubscription) {
          const newEndDate = new Date(activeSubscription.endDate);
          newEndDate.setDate(newEndDate.getDate() + days);

          await tx.subscription.update({
            where: {
              id: activeSubscription.id,
            },
            data: {
              endDate: newEndDate,
            },
          });

          await tx.premiumTransaction.create({
            data: {
              owner_id: ownerId,
              subscription_id: activeSubscription.id,

              plan,

              duration: days,

              amount: 0,

              reason,

              provider: 'ADMIN_GIFT',

              provider_transactionId: null,

              status: 'SUCCESS',
            },
          });
        } else {
          const startDate = new Date();

          const endDate = new Date();
          endDate.setDate(endDate.getDate() + days);

          const subscription = await tx.subscription.create({
            data: {
              ownerId,
              plan,
              startDate,
              endDate,
              isActive: true,
              reason,
            },
          });

          await tx.premiumTransaction.create({
            data: {
              owner_id: ownerId,
              subscription_id: subscription.id,

              plan,

              duration: days,

              amount: 0,

              reason,

              provider: 'ADMIN_GIFT',

              provider_transactionId: null,

              status: 'SUCCESS',
            },
          });
        }
      });

      await ctx.answerCbQuery(
        this.i18n.translate('admin.gift_success', {
          lang,
          args: {
            owner: owner.full_name,
            plan: PLAN_LABELS[lang][plan],
          },
        }),
        {
          show_alert: true,
        },
      );
      const translations = Object.fromEntries(
        ['uz', 'ru', 'en'].map((lang) => [
          lang,
          {
            title: this.i18n.translate(
              'admin.notification.premium_gift.title',
              {
                lang,
              },
            ),
            message: this.i18n.translate(
              'admin.notification.premium_gift.message',
              {
                lang,
                args: {
                  plan: PLAN_LABELS[lang][plan],
                },
              },
            ),
          },
        ]),
      );
      const notification = await this.prisma.notification.create({
        data: {
          ownerId,
          type: NotificationType.PREMIUM_EXPIRY,
          translations,
        },
      });
      await this.notificationService.sendNotification(
        owner.chatID,
        notification.id,
      );

      return this.AdminOwner_premium(ctx, 'premium', owner.id, currentPage, 1);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
}
