import { Injectable } from '@nestjs/common';
import { PremiumReason } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { formatDate } from 'src/helpers/dateFormat';
import { PLAN_LABELS, PremiumPlan } from 'src/helpers/interface';
import { getLocation } from 'src/helpers/lokationSeorch';
import { getPremiumReasonText } from 'src/helpers/reason';
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
            const [active, blocked] = await Promise.all([
              this.prisma.owners.count({ where: { status: 'ACTIVE' } }),
              this.prisma.owners.count({ where: { status: 'BLOCKED' } }),
            ]);
            await this.utils.safeEditOrReply(ctx, '👤 Ownerlarni boshqarish', {
              inline_keyboard: [
                [
                  {
                    text: `🟢 Faol ownerlar (${active})`,
                    callback_data: 'AdminPaner_Owner_active_0_1',
                  },
                ],
                [
                  {
                    text: `🔴 Bloklangan ownerlar (${blocked})`,
                    callback_data: 'AdminPaner_Owner_blocked_0_1',
                  },
                ],
                [
                  {
                    text: '🔍 Owner qidirish',
                    callback_data: 'AdminPaner_Owner_search_0_1',
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
              text: `📄 ${currentPage}/${totalPages}`,
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
              await ctx.answerCbQuery('Stadion topilmadi', {
                show_alert: true,
              });
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
              : "Yo'q";

            const offDays = offDaySchedules.length
              ? offDaySchedules
                  .map((d) => d.date.toLocaleDateString('uz-UZ'))
                  .join('\n')
              : "Yo'q";

            const specialDays = specialSchedules.length
              ? specialSchedules
                  .map(
                    (s) =>
                      `${s.date.toLocaleDateString('uz-UZ')}, ${s.start_time} - ${s.end_time}`,
                  )
                  .join('\n')
              : "Yo'q";

            const stadionType = stadion.parent_id
              ? 'Katta stadionning mini bo‘lagi'
              : stadion.mini
                ? 'Mini stadion'
                : 'Katta stadion';

            const text = `
🏟 <b>STADION MA'LUMOTLARI</b>

━━━━━━━━━━━━━━━

🆔 <b>ID:</b> ${stadion.id}
🏟 <b>Nomi:</b> ${stadion.name}
🏷 <b>Turi:</b> ${stadionType}

📍 <b>Manzil:</b>
${getLocation(
  stadion.latitude,
  stadion.longitude,
  stadion.region.name,
  stadion.region_items.name,
)}

👤 <b>Owner:</b> ${stadion.owner.full_name}
📞 <b>Telefon:</b> ${stadion.owner.phone}

💰 <b>Narxi:</b> ${stadion.price?.toLocaleString()} so'm
📌 <b>Status:</b> ${stadion.admin_status}

━━━━━━━━━━━━━━━

🕒 <b>Haftalik jadval</b>

${weekDays}

🚫 <b>Dam olish kunlari</b>

${offDays}

⭐ <b>Maxsus ish kunlari</b>

${specialDays}

━━━━━━━━━━━━━━━

📅 <b>Yaratilgan:</b>
${new Date(stadion.createdAt).toLocaleString('uz-UZ')}
`.trim();

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
            await ctx.answerCbQuery("Hozirda aktiv ownerlar yo'q");
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
              text: '⬅️',
              callback_data: `AdminPaner_Owner_active_${currentPage - 1}`,
            });
          }

          pagination.push({
            text: `📄 ${currentPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (currentPage < totalPages) {
            pagination.push({
              text: '➡️',
              callback_data: `AdminPaner_Owner_active_${currentPage + 1}`,
            });
          }

          buttons.push(totalPages > 1 ? pagination : []);

          buttons.push([
            {
              text: '⬅️ Orqaga',
              callback_data: 'admins_owners',
            },
          ]);

          await this.utils.safeEditOrReply(ctx, "👥 Aktiv ownerlar ro'yxati:", {
            inline_keyboard: buttons,
          });
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
            await ctx.answerCbQuery("Hozirda Bloklangan ownerlar yo'q");
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
              text: '⬅️',
              callback_data: `AdminPaner_Owner_active_${currentPage - 1}`,
            });
          }

          pagination.push({
            text: `📄 ${currentPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (currentPage < totalPages) {
            pagination.push({
              text: '➡️',
              callback_data: `AdminPaner_Owner_active_${currentPage + 1}`,
            });
          }

          buttons.push(totalPages > 1 ? pagination : []);

          buttons.push([
            {
              text: '⬅️ Orqaga',
              callback_data: 'admins_owners',
            },
          ]);

          await this.utils.safeEditOrReply(
            ctx,
            "👥 Bloklangan ownerlar ro'yxati:",
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

          const text = `
👤 <b>Owner ma'lumotlari</b>

━━━━━━━━━━━━━━━

🆔 <b>ID:</b> ${owner.id}

👤 <b>F.I.O:</b> ${owner.full_name}

📞 <b>Telefon:</b> ${owner.phone}

📧 <b>Email:</b> ${owner.email ?? 'Kiritilmagan'}

🏟 <b>Stadionlar soni:</b> ${stadiumCount}

📅 <b>Bronlar soni:</b> ${bookingCount}

⭐ <b>Premium:</b> ${hasActivePremium ? 'Faol ✅' : 'Mavjud emas ❌'}

🟢 <b>Status:</b> ${owner.status === 'ACTIVE' ? 'Faol' : 'Bloklangan'}
`.trim();

          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: '🏟 Stadionlari',
                  callback_data: `AdminOwner_stadiums_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: '⭐ Premium boshqarish',
                  callback_data: `AdminOwner_premium_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text:
                    owner.status === 'ACTIVE'
                      ? '🚫 Bloklash'
                      : '✅ Faollashtirish',
                  callback_data: `AdminPaner_Owner_status_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: '⬅️ Orqaga',
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

          const text = isActive
            ? `🚫 Siz rostdan ham <b>${owner.full_name}</b> ni bloklamoqchimisiz?`
            : `✅ Siz rostdan ham <b>${owner.full_name}</b> ni faollashtirmoqchimisiz?`;

          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: isActive ? '🚫 Ha, bloklash' : '✅ Ha, faollashtirish',
                  callback_data: `AdminPaner_Owner_confirm_${owner.id}_${currentPage}`,
                },
              ],
              [
                {
                  text: '⬅️ Orqaga',
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
            updatedOwner.status === 'ACTIVE'
              ? `✅ ${owner.full_name} faollashtirildi`
              : `🚫 ${owner.full_name} bloklandi`,
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
            statistics.find((item) => item.reason === 'PURCHASE')?._sum
              .duration ?? 0;

          const giftDays =
            statistics.find((item) => item.reason === 'GIFT')?._sum.duration ??
            0;

          const compensationDays =
            statistics.find((item) => item.reason === 'COMPENSATION')?._sum
              .duration ?? 0;

          const trialDays =
            statistics.find((item) => item.reason === 'TRIAL')?._sum.duration ??
            0;

          const text = premium
            ? `
⭐ <b>Premium boshqarish</b>

━━━━━━━━━━━━━━━

👤 <b>Owner:</b> ${owner.full_name}

📌 <b>Holati:</b> 🟢 Faol

📦 <b>Asosiy tarif:</b> ${PLAN_LABELS[lang][premium.plan]}

📅 <b>Faollashtirilgan:</b> ${formatDate(premium.startDate, lang)}

⏳ <b>Amal qilish muddati:</b> ${formatDate(premium.endDate, lang)}
_____________________________________________\n
${purchaseDays > 0 ? `💳 <b>Sotib olingan:</b> ${purchaseDays} kun\n\n` : ''}${
                giftDays > 0 ? `🎁 <b>Sovg'a:</b> +${giftDays} kun\n\n` : ''
              }${
                compensationDays > 0
                  ? `🤝 <b>Kompensatsiya:</b> +${compensationDays} kun\n\n`
                  : ''
              }${
                trialDays > 0
                  ? `🎉 <b>Sinov muddati:</b> ${trialDays} kun\n`
                  : ''
              }
____________________________________________

Quyidagi amallardan birini tanlang 👇
`.trim()
            : `
⭐ <b>Premium boshqarish</b>

━━━━━━━━━━━━━━━

👤 <b>Owner:</b> ${owner.full_name}

📌 <b>Holati:</b> 🔴 Premium mavjud emas

━━━━━━━━━━━━━━━

Quyidagi amallardan birini tanlang 👇
`.trim();

          await this.utils.safeEditOrReply(ctx, text, {
            inline_keyboard: [
              [
                {
                  text: "🎁 Premium sovg'a qilish",
                  callback_data: `AdminOwner_gift_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: '📜 Premium tarixi',
                  callback_data: `AdminOwner_history_${owner.id}_${currentPage}_1`,
                },
              ],
              [
                {
                  text: '⬅️ Orqaga',
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
            await ctx.answerCbQuery('Premium tarixi mavjud emas', {
              show_alert: true,
            });
            return;
          }

          const totalPages = Math.ceil(total / limit);

          const historyText = history
            .map((item, index) => {
              const transaction = item.premiumTransactions[0];

              return `
<b>${(historyPage - 1) * limit + index + 1}.</b>

📦 <b>Tarif:</b> ${PLAN_LABELS[lang][item.plan]}

🎯 <b>Sababi:</b> ${getPremiumReasonText(item.reason, this.i18n, lang)}

📅 <b>Boshlangan:</b> ${formatDate(item.startDate, lang)}

⏳ <b>Tugagan:</b> ${formatDate(item.endDate, lang)}

💰 <b>Summa:</b> ${
                transaction
                  ? `${transaction.amount.toLocaleString('uz-UZ')} so'm`
                  : 'Bepul'
              }

💳 <b>To'lov:</b> ${
                transaction.provider === 'ADMIN_GIFT'
                  ? 'Admin tomonidan berilgan'
                  : transaction.provider
              }
`.trim();
            })
            .join('\n\n━━━━━━━━━━━━━━━\n\n');

          const pagination: InlineKeyboardButton[] = [];

          if (historyPage > 1) {
            pagination.push({
              text: '⬅️',
              callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${historyPage - 1}`,
            });
          }

          pagination.push({
            text: `${historyPage}/${totalPages}`,
            callback_data: 'ignore',
          });

          if (historyPage < totalPages) {
            pagination.push({
              text: '➡️',
              callback_data: `AdminOwner_history_${ownerId}_${currentPage}_${historyPage + 1}`,
            });
          }

          await this.utils.safeEditOrReply(
            ctx,
            `📜 <b>Premium tarixi</b>\n\n${historyText}`,
            {
              inline_keyboard: [
                ...(totalPages > 1 ? [pagination] : []),
                [
                  {
                    text: '⬅️ Orqaga',
                    callback_data: `AdminOwner_premium_${ownerId}_${currentPage}_1`,
                  },
                ],
              ],
            },
          );

          break;
        }
        case 'gift': {
          await this.utils.safeEditOrReply(
            ctx,
            `🎁 Premium muddatini tanlang`,
            {
              inline_keyboard: [
                [
                  {
                    text: '⭐ 1 hafta',
                    callback_data: `ownerPremiumGift_7_${ownerId}_${currentPage}`,
                  },
                  {
                    text: '⭐ 1 oy',
                    callback_data: `ownerPremiumGift_30_${ownerId}_${currentPage}`,
                  },
                ],
                [
                  {
                    text: '⭐ 3 oy',
                    callback_data: `ownerPremiumGift_90_${ownerId}_${currentPage}`,
                  },
                  {
                    text: '⭐ 6 oy',
                    callback_data: `ownerPremiumGift_180_${ownerId}_${currentPage}`,
                  },
                ],
                [
                  {
                    text: '⭐ 12 oy',
                    callback_data: `ownerPremiumGift_365_${ownerId}_${currentPage}`,
                  },
                ],
                [
                  {
                    text: '⬅️ Orqaga',
                    callback_data: `AdminOwner_premium_${ownerId}_${currentPage}_${historyPage}`,
                  },
                ],
              ],
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
      console.log(error);
    }
  }
  async ownerPremiumGift(
    ctx: MyContext,
    days: number,
    ownerId: number,
    currentPage: number,
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
      const text = `
🎁 <b>Premium sovg'a qilish</b>

━━━━━━━━━━━━━━━

👤 <b>Owner:</b> ${owner.full_name}

📦 <b>Premium tarifi:</b> ${label}

🎉 Ushbu Premium <b>${owner.full_name}</b> hisobiga sovg'a sifatida beriladi.

${
  premium
    ? '⚠️ <b>Diqqat:</b> Ownerda faol Premium mavjud.\nPremium muddati avtomatik ravishda uzaytiriladi.'
    : 'ℹ️ Premium darhol faollashtiriladi.'
}

━━━━━━━━━━━━━━━

❓ <b>Amalni tasdiqlaysizmi?</b>
`.trim();

      await this.utils.safeEditOrReply(ctx, text, {
        inline_keyboard: [
          [
            {
              text: '✅ Ha, sovg‘a qilish',
              callback_data: `AdminOwnerConfirmGift_${days}_${owner.id}_${currentPage}`,
            },
          ],
          [
            {
              text: '❌ Bekor qilish',
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

              reason: 'GIFT',

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
              reason: 'GIFT',
            },
          });

          await tx.premiumTransaction.create({
            data: {
              owner_id: ownerId,
              subscription_id: subscription.id,

              plan,

              duration: days,

              amount: 0,

              reason: 'GIFT',

              provider: 'ADMIN_GIFT',

              provider_transactionId: null,

              status: 'SUCCESS',
            },
          });
        }
      });

      await ctx.answerCbQuery(
        `🎉 Premium muvaffaqiyatli sovg'a qilindi!\n\n👤 Owner: ${owner.full_name}\n📦 Tarif: ${PLAN_LABELS[lang][plan]}`,
        {
          show_alert: true,
        },
      );
      return this.AdminOwner_premium(ctx, 'premium', owner.id, currentPage, 1);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  
}
