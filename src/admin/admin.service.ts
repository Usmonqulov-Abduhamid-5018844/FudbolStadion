import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { getLocation } from 'src/helpers/lokationSeorch';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { InlineKeyboardButton } from 'telegraf/types';

@Injectable()
export class AdminService {
  constructor(
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilisService,
  ) {}

  async admin_paneli(ctx: MyContext, lang: string) {
    try {
      const owners = await this.prisma.owners.count();
      await this.utils.safeEditOrReply(ctx, 'Admin bo‘limlari:', {
        inline_keyboard: [
          [
            { text: '📊 Statistika', callback_data: 'admins_stats' },
            { text: '🏟 Stadionlar', callback_data: 'admins_stadiums' },
          ],
          [
            { text: '📋 Bronlar', callback_data: 'admins_bookings' },
            { text: '⭐ Premium', callback_data: 'admins_premium' },
          ],
          [
            { text: `👤 Ownerlar (${owners})`, callback_data: 'admins_owners' },
            { text: '📢 Xabar yuborish', callback_data: 'admins_broadcast' },
          ],
        ],
      });
      if (ctx.session.admin_messageId) {
        await ctx.deleteMessage(ctx.session.admin_messageId);
      }
    } catch (error) {}
  }
  async admins_stadiums(ctx: MyContext, type: string) {
    try {
      const lang = await this.utils.langs(ctx);
      switch (type) {
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
            await this.utils.safeEditOrReply(ctx, '🏟 Stadionlar bo‘limi', {
              inline_keyboard: [
                [
                  {
                    text: `⏳ Kutilayotgan (${pending})`,
                    callback_data: 'stadium_pending_0_1',
                  },
                ],
                [
                  {
                    text: `✅ Tasdiqlangan (${approved})`,
                    callback_data: 'stadium_approved_0_1',
                  },
                ],
                [
                  {
                    text: `❌ Rad etilgan (${rejected})`,
                    callback_data: 'stadium_rejected_0_1',
                  },
                ],
                [{ text: '⬅️ Orqaga', callback_data: 'admin_back_1' }],
              ],
            });
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
            const [] = await Promise.all([
              this.prisma.owners
            ])
            await this.utils.safeEditOrReply(ctx, '👤 Ownerlarni boshqarish', {
              inline_keyboard: [
                [
                  {
                    text: '🟢 Faol ownerlar',
                    callback_data: 'owner_active_1',
                  },
                ],
                [
                  {
                    text: '🔴 Bloklangan ownerlar',
                    callback_data: 'owner_blocked_1',
                  },
                ],
                [
                  {
                    text: '🔍 Owner qidirish',
                    callback_data: 'owner_search',
                  },
                ],
                [
                  {
                    text: '⬅️ Orqaga',
                    callback_data: 'admin_back_1',
                  },
                ],
              ],
            });
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
              await ctx.answerCbQuery('Kutilayotgan stadionlar yo‘q', {
                show_alert: true,
              });
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: '⬅️',
                callback_data: `stadium_pending_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: '➡️',
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
              '⏳ Kutilayotgan stadionlar',
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
              await ctx.answerCbQuery('Tasdiqlangan stadionlar yo‘q', {
                show_alert: true,
              });
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: '⬅️',
                callback_data: `stadium_approved_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: '➡️',
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
              '✅ Tasdiqlangan stadionlar',
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
              await ctx.answerCbQuery('Rad etilgan stadionlar yo‘q', {
                show_alert: true,
              });
              return;
            }
            const totalPages = Math.ceil(total / limit);
            const paginationButtons: InlineKeyboardButton[] = [];

            if (currentPage > 1) {
              paginationButtons.push({
                text: '⬅️',
                callback_data: `stadium_rejected_${Id}_${currentPage - 1}`,
              });
            }

            paginationButtons.push({
              text: `${currentPage}/${totalPages}`,
              callback_data: 'ignore',
            });

            if (currentPage < totalPages) {
              paginationButtons.push({
                text: '➡️',
                callback_data: `stadium_rejected_${Id}_${currentPage + 1}`,
              });
            }

            const button: InlineKeyboardButton[][] = list.map((s) => [
              {
                text: `🏟 ${s.name}`,
                callback_data: `stadium_view_${s.id}_${currentPage}`,
              },
            ]);

            await this.utils.safeEditOrReply(ctx, '❌ Rad etilgan stadionlar', {
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
            });
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
              },
            });

            if (!stadion) {
              await ctx.answerCbQuery('Stadion topilmadi', {
                show_alert: true,
              });
              return;
            }
            const weekDays = stadion.stadionChedules.length
              ? stadion.stadionChedules
                  .map(
                    (s) =>
                      `${this.i18n.translate(`admin.week_days.${s.day_of_week}`, { lang })}: ${s.start_time} - ${s.end_time}`,
                  )
                  .join('\n')
              : "Yo'q";
            const offDays = stadion.stadionOffDays.length
              ? stadion.stadionOffDays
                  .map((d) => d.date.toLocaleString().split(',')[0])
                  .join('\n')
              : "Yo'q";

            const specialDays = stadion.stadionSpecialSchedules.length
              ? stadion.stadionSpecialSchedules
                  .map(
                    (s) =>
                      `${s.date.toLocaleString().split(',')[0]}, ${s.start_time} - ${s.end_time}`,
                  )
                  .join('\n')
              : "Yo'q";

            const text = `
              🏟 <b>Stadion ma'lumotlari</b>
      
              🆔 ID: ${stadion.id}
      
              🏟 Nomi: ${stadion.name}
      
              📍 Manzil:
              ${getLocation(
                stadion.latitude,
                stadion.longitude,
                stadion.region.name,
                stadion.region_items.name,
              )}
      
              👤 Egasi: ${stadion.owner.full_name}
      
              📞 Telefon: ${stadion.owner.phone}
      
              💰 Narxi: ${stadion.price?.toLocaleString()} so'm
      
              📌 Status: ${stadion.admin_status}
      
              🕒 Haftalik jadval
      
                ${weekDays}
      
              🚫 Dam olish kunlari
      
               ${offDays}
      
              ⭐ Maxsus ish kunlari
      
               ${specialDays}
      
              📅 Yaratilgan sana: ${new Date(stadion.createdAt).toLocaleString('uz-UZ')}\n
              `;
            const actionButtons: InlineKeyboardButton[][] = [];

            if (stadion.admin_status === 'PENDING') {
              actionButtons.push([
                {
                  text: '✅ Tasdiqlash',
                  callback_data: `stadiumChecking_approved_${stadion.id}_${currentPage}`,
                },

                {
                  text: '❌ Rad etish',
                  callback_data: `stadiumChecking_rejected_${stadion.id}_${currentPage}`,
                },
              ]);
            }

            if (stadion.admin_status === 'APPROVED') {
              actionButtons.push([
                {
                  text: '❌ Rad etish',
                  callback_data: `stadiumChecking_rejected_${stadion.id}_${currentPage}`,
                },
              ]);
            }

            if (stadion.admin_status === 'REJECTED') {
              actionButtons.push([
                {
                  text: '✅ Tasdiqlash',
                  callback_data: `stadiumChecking_approved_${stadion.id}_${currentPage}`,
                },
              ]);
            }
            await this.utils.safeEditOrReply(ctx, text, {
              inline_keyboard: [
                ...actionButtons,
                [
                  {
                    text: '🔙 Orqaga',
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
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!stadion) return await this.utils.errorFunction(ctx);

      switch (status) {
        case 'approved':
          {
            await this.utils.safeEditOrReply(
              ctx,
              'siz rosdanham tasqiqlamaochimisiz ',
              {
                inline_keyboard: [
                  [
                    {
                      text: '✅ Ha, tasdiqlash',
                      callback_data: `stadiumConfirm_approved_${stadion.id}_${page}`,
                    },
                    {
                      text: 'Orqaga',
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
              'siz rosdanham bekor qilmaqchimisiz ',
              {
                inline_keyboard: [
                  [
                    {
                      text: '❌ Ha, rad etish',
                      callback_data: `stadiumConfirm_rejected_${stadion.id}_${page}`,
                    },
                    {
                      text: 'Orqaga',
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
  async stadiumConfirm(
    ctx: MyContext,
    status: string,
    stadionId: number,
    page: number,
  ) {
    try {
      if (status === 'approved') {
        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { admin_status: 'APPROVED' },
        });
        await ctx.answerCbQuery('Stadion tasdiqlandi');
        return this.stadium_status(ctx, status, stadionId, '1');
      } else {
        await this.prisma.stadion.update({
          where: { id: stadionId },
          data: { admin_status: 'REJECTED' },
        });
        await ctx.answerCbQuery('Stadion rad etildi');
        return this.stadium_status(ctx, status, stadionId, '1');
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
}
