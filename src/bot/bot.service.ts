import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isCkecked } from 'src/helpers/isChecked_firstName';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { formatInTimeZone } from 'date-fns-tz';
import { getPaymentText } from 'src/helpers/peyments_type';
import { UtilisService } from 'src/utils/utile.service';
import { EStadion_type } from 'src/helpers/interface';
import { getLocation } from 'src/helpers/url';
import { stadionTypeLabel } from 'src/helpers/lokationSeorch';

@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly utils: UtilisService,
  ) {}

  async start(ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session = ctx.session || {};
    ctx.reply(
      this.i18n.translate('common.START', { lang }),
      Markup.inlineKeyboard([
        [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
        [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
        [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
      ]),
    );
  }

  async checket(ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    const owners = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
    });
    if (!owners) {
      const users = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!users) {
        ctx.session.step = 'registor';
        ctx.reply(
          this.i18n.translate('registor.title', { lang }),
          Markup.keyboard([
            [`💼 ${this.i18n.translate('registor.button.0', { lang })}`],
            [`🏃🏼 ${this.i18n.translate('registor.button.1', { lang })}`],
          ])
            .oneTime()
            .resize(),
        );
        return;
      }
      if (!ctx.session.user_registor)
        ctx.session.user_registor = {
          full_name: null,
          step: null,
          id: 0,
          phone: null,
        };
      ctx.session.user_registor.id = users.id;
      const welcomeMessage = this.i18n.translate('common.HELLO', {
        lang,
        args: {
          name: isCkecked(ctx.from?.first_name)
            ? ctx.from?.first_name
            : this.i18n.translate('common.firstName', { lang }),
        },
      });
      await ctx.reply(
        `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
          lang,
        })}`,
        Markup.keyboard([
          [this.i18n.translate('menyu_buttons.user_stadion_booking', { lang })],
          [
            this.i18n.translate('menyu_buttons.settings', { lang }),
            this.i18n.translate('menyu_buttons.help', { lang }),
          ],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }
    if (!ctx.session.owner_registor)
      ctx.session.owner_registor = {
        email: null,
        full_name: null,
        id: 0,
        phone: null,
        step: null,
      };
    ctx.session.owner_registor.id = owners.id;
    const welcomeMessage = this.i18n.translate('common.HELLO', {
      lang,
      args: {
        name: isCkecked(ctx.from?.first_name)
          ? ctx.from?.first_name
          : this.i18n.translate('common.firstName', { lang }),
      },
    });
    await ctx.reply(
      `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
        lang,
      })}`,
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
  }

  async createStadion(ctx: MyContext, type: EStadion_type) {
    const lang = await this.utils.langs(ctx);
    try {
      const data = {
        name: String(ctx.session.stadion.name),
        latitude: Number(ctx.session.stadion.latitude),
        longitude: Number(ctx.session.stadion.longitude),
        image: String(ctx.session.stadion.image),
        region_id: Number(ctx.session.stadion.region_id),
        max_count: Number(ctx.session.stadion.max_count),
        price: Number(ctx.session.stadion.price),
        region_item_id: Number(ctx.session.stadion.region_item_id),
        owner_id: Number(ctx.session.owner_registor.id),
        length: Number(ctx.session.stadion.length),
        width: Number(ctx.session.stadion.width),
        payments_type: ctx.session.stadion.payments_type,
        mini: type === EStadion_type.SMOL,
      };
      let stadion: any;
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        include: {
          ownerCard: true,
        },
      });
      if (!owner) {
        await this.utils.errorFunction(ctx);
        return;
      }
      if (data.payments_type === 'CARD' && !owner.ownerCard) {
        stadion = await this.prisma.stadion.create({
          data: { ...data, owner_id: owner.id, working_status: false },
        });
      } else {
        stadion = await this.prisma.stadion.create({
          data: { ...data, owner_id: owner.id },
        });
      }

      await ctx.reply(
        this.i18n.translate('stadions.stadion_added_success', { lang }),
        {
          reply_markup: {
            keyboard: [
              [{ text: this.i18n.translate('stadions.menu', { lang }) }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
      ctx.session.step = 'menyu';

      return this.all_data(ctx, stadion.id);
    } catch (error) {
      console.log(error);

      await this.utils.errorFunction(ctx);
    }
  }

  async renderScheduleMenu(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);

    try {
      const existingSchedules = await this.prisma.stadion_chedule.findMany({
        where: { stadion_id },
        select: { day_of_week: true },
      });

      const existingDays = existingSchedules.map((s) => s.day_of_week);

      const allDays = [1, 2, 3, 4, 5, 6, 7];
      const remainingDays = allDays.filter(
        (day) => !existingDays.includes(day),
      );

      let inlineKeyboard: InlineKeyboardButton[][] = [];

      if (!remainingDays.length) {
        inlineKeyboard = [
          [
            {
              text: this.i18n.translate('schedule.schedules.view_schedule', {
                lang,
              }),
              callback_data: JSON.stringify({
                type: 'view_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: JSON.stringify({
                type: 'schedule',
                id: stadion_id,
                back: 'back',
              }),
            },
          ],
        ];
        try {
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('schedule.schedules.manager_weekli', { lang }),
            { inline_keyboard: inlineKeyboard },
          );
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
        return;
      } else if (existingSchedules.length) {
        inlineKeyboard = [
          [
            {
              text: this.i18n.translate('schedule.schedules.view_schedule', {
                lang,
              }),
              callback_data: JSON.stringify({
                type: 'view_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: this.i18n.translate('schedule.schedules.add_schedule', {
                lang,
              }),
              callback_data: JSON.stringify({
                type: 'add_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: JSON.stringify({
                type: 'schedule',
                id: stadion_id,
                back: 'back',
              }),
            },
          ],
        ];
        try {
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('schedule.schedules.manager_weekli', { lang }),
            { inline_keyboard: inlineKeyboard },
          );
        } catch (error) {
          ctx.reply(this.i18n.translate('error.error', { lang }));
        }

        return;
      } else {
        inlineKeyboard = remainingDays.map((day) => [
          {
            text: this.i18n.translate(`schedule.week_days.${day}`, { lang }),
            callback_data: JSON.stringify({
              type: 'add_schedule_day',
              day,
              id: stadion_id,
            }),
          },
        ]);
        inlineKeyboard.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({ type: 'schedule', id: stadion_id }),
          },
        ]);
      }
      try {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('schedule.schedules.craed_week', { lang }),
          { inline_keyboard: inlineKeyboard },
        );
      } catch (error) {
        await this.utils.errorFunction(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async renderSchedule_week(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);

    try {
      const existingSchedules = await this.prisma.stadion_chedule.findMany({
        where: { stadion_id },
        select: { day_of_week: true },
      });

      const existingDays = existingSchedules.map((s) => s.day_of_week);

      const allDays = [1, 2, 3, 4, 5, 6, 7];
      const remainingDays = allDays.filter(
        (day) => !existingDays.includes(day),
      );

      let inlineKeyboard: InlineKeyboardButton[][] = [];

      if (remainingDays.length) {
        inlineKeyboard = remainingDays.map((day) => [
          {
            text: this.i18n.translate(`schedule.week_days.${day}`, { lang }),
            callback_data: JSON.stringify({
              type: 'add_schedule_day',
              day,
              id: stadion_id,
            }),
          },
        ]);
        inlineKeyboard.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'week_schedule',
              id: stadion_id,
            }),
          },
        ]);
      }
      try {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('schedule.schedules.craed_week', { lang }),
          { inline_keyboard: inlineKeyboard },
        );
      } catch (error) {
        await this.utils.errorFunction(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async viewSchedule(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const schedule = await this.prisma.stadion_chedule.findMany({
        where: { stadion_id },
        orderBy: { day_of_week: 'asc' },
      });
      if (schedule.length) {
        const inlineKeyboard: InlineKeyboardButton[][] = schedule.map((sch) => [
          {
            text: `${this.i18n.translate(`schedule.week_days.${sch.day_of_week}`, { lang })} ⏰ ${sch.start_time}-${sch.end_time}`,
            callback_data: JSON.stringify({
              type: 'edit_schedule',
              day: sch.day_of_week,
              id: stadion_id,
              schedule_id: sch.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.schedules.delet', { lang }),
            callback_data: JSON.stringify({
              type: 'delete_schedule_day',
              day: sch.day_of_week,
              id: stadion_id,
              schedule_id: sch.id,
            }),
          },
        ]);
        inlineKeyboard.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'week_schedule',
              id: stadion_id,
            }),
          },
        ]);
   
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('schedule.schedules.week', { lang }),
            { inline_keyboard: inlineKeyboard },
          );
      } else {
        return this.renderScheduleMenu(ctx, stadion_id);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadion_off_days(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const stadion_off_day = await this.prisma.stadion_off_days.findMany({
        where: { stadion_id },
        orderBy: { createdAt: 'asc' },
      });
      const button: InlineKeyboardButton[][] = [];
      if (stadion_off_day.length) {
        stadion_off_day.forEach((s) => {
          button.push([
            {
              text: `${s.date.toISOString().split('T')[0]}`,
              callback_data: JSON.stringify({
                type: 'week_edit',
                id: stadion_id,
                stadion_off: s.id,
              }),
            },
            {
              text: this.i18n.translate('schedule.schedules.delet', { lang }),
              callback_data: JSON.stringify({
                type: 'delete_week',
                id: stadion_id,
                stadion_off: s.id,
              }),
            },
          ]);
        });
      }
      button.push(
        [
          {
            text: this.i18n.translate('schedule.schedules.add_schedule', {
              lang,
            }),
            callback_data: JSON.stringify({
              id: stadion_id,
              type: 'off_stadion',
            }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'schedule',
              id: stadion_id,
              back: 'back',
            }),
          },
        ],
      );
      try {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('schedule.off_day.off', { lang }),
          { inline_keyboard: button },
        );
      } catch (error) {
        await this.utils.errorFunction(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async stadion_special(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const data = await this.prisma.stadion_special_schedule.findMany({
        where: { stadion_id },
      });
      const button: InlineKeyboardButton[][] = [];
      if (data.length) {
        data.forEach((d) => {
          button.push([
            {
              text: `${d.date.toISOString().split('T')[0]} 🕒 ${d.start_time}-${d.end_time}`,
              callback_data: JSON.stringify({
                type: 'special_edit',
                id: stadion_id,
                special_id: d.id,
              }),
            },
            {
              text: this.i18n.translate('schedule.schedules.delet', { lang }),
              callback_data: JSON.stringify({
                type: 'special_delet',
                special_id: d.id,
                id: stadion_id,
              }),
            },
          ]);
        });
      }
      button.push(
        [
          {
            text: this.i18n.translate('schedule.schedules.add_schedule', {
              lang,
            }),
            callback_data: JSON.stringify({
              type: 'add_special',
              id: stadion_id,
            }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'schedule',
              id: stadion_id,
              back: 'back',
            }),
          },
        ],
      );
      try {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('schedule.specile_days', { lang }),
          { inline_keyboard: button },
        );
      } catch (error) {
        await this.utils.errorFunction(ctx);
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async location(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(this.i18n.translate('stadions.not_fount'), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: JSON.stringify({
                    type: 'stadion',
                    id: stadion_id,
                  }),
                },
              ],
            ],
          },
        });
      } else {
        await ctx.replyWithLocation(stadion.latitude, stadion.longitude);
        ctx.reply(this.i18n.translate('stadions.menyu.update_text', { lang }), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.menyu.location', {
                    lang,
                  }),
                  callback_data: JSON.stringify({
                    type: 'update_location',
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
        });
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadion_price(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(this.i18n.translate('stadions.not_fount'), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: JSON.stringify({
                    type: 'stadion',
                    id: stadion_id,
                  }),
                },
              ],
            ],
          },
        });
      } else {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('stadions.menyu.price', {
            lang,
            args: { price: stadion.price.toLocaleString('uz-UZ') },
          }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.menyu.update_price', {
                    lang,
                  }),
                  callback_data: JSON.stringify({
                    type: 'Update_price',
                    id: stadion.id,
                  }),
                },
              ],
              [
                stadion.stadion_mini
                  ? {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: `owner_miniStadion_${stadion.id}`,
                    }
                  : {
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
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadion_image(ctx: MyContext, stadion_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(this.i18n.translate('stadions.not_fount'), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: JSON.stringify({
                    type: 'stadion',
                    id: stadion_id,
                  }),
                },
              ],
            ],
          },
        });
      } else {
        await ctx.replyWithPhoto(stadion.image, {});
        ctx.reply(
          this.i18n.translate('stadions.menyu.update_image_text', { lang }),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('stadions.menyu.update_image', {
                      lang,
                    }),
                    callback_data: JSON.stringify({
                      type: 'update_image',
                      id: stadion.id,
                    }),
                  },
                ],
                [
                  stadion.stadion_mini
                    ? {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `owner_miniStadion_${stadion.id}`,
                      }
                    : {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: JSON.stringify({
                          type: 'stadion',
                          id: stadion.id,
                        }),
                      },
                ],
              ],
            },
          },
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async all_data(ctx: MyContext, stadion_id: number) {
    let lang = await this.utils.langs(ctx);

    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
        include: {
          region: {
            select: {
              name: true,
            },
          },
          region_items: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!stadion) {
        return ctx.reply(this.i18n.translate('stadions.not_found', { lang }));
      }
      const owner = await this.prisma.owners.findUnique({
        where: { id: stadion.owner_id },
      });
      const formatPrice = (price?: number | string) => {
        if (!price) return '❌';
        return new Intl.NumberFormat('uz-UZ').format(Number(price));
      };

      const createdAt = formatInTimeZone(
        stadion.createdAt,
        'Asia/Tashkent',
        'yyyy-MM-dd HH:mm',
      );

      const updatedAt = formatInTimeZone(
        stadion.updatedAt,
        'Asia/Tashkent',
        'yyyy-MM-dd HH:mm',
      );
      const statusText = stadion.working_status
        ? `🟢 ${this.i18n.translate('view.active', { lang })}`
        : `🔴 ${this.i18n.translate('view.inactive', { lang })}`;

      let locationText = this.i18n.translate('view.not_available', { lang });
      if (stadion.latitude && stadion.longitude) {
        locationText = getLocation(
          stadion.latitude,
          stadion.longitude,
          stadion.region.name,
          stadion.region_items.name,
        );
      }

      const message = `
🏟 <b>${stadion.name}</b>\n
${this.i18n.translate('view.locate', { lang })} ${locationText}
${stadion.admin_checked ? "✅ Admin tomonidan tasqiqlangan" : "🔺Admin tomonidan tasqiqlanmagan"}
${stadionTypeLabel(stadion.mini, stadion.stadion_mini, lang, this.i18n)}
${this.i18n.translate('view.count', { lang })} ${stadion.max_count || `${this.i18n.translate('view.not', { lang })}`}
${this.i18n.translate('view.size', { lang })} ${stadion.length || '❌'} x ${stadion.width || '❌'}
${this.i18n.translate('view.price', { lang })} ${formatPrice(stadion.price) || '❌'}
${this.i18n.translate('view.peyments', { lang })} ${getPaymentText(stadion.payments_type, this.i18n.translate('peyments', { lang }))}
${this.i18n.translate('view.phone', { lang })} ${owner?.phone}
${this.i18n.translate('view.premium', { lang })} ${stadion.is_premium ? `${this.i18n.translate('view.yes', { lang })}` : `${this.i18n.translate('view.no', { lang })}`}
${(this, this.i18n.translate('view.status', { lang }))} ${statusText}
${this.i18n.translate('view.creted', { lang })} ${createdAt}
${this.i18n.translate('view.update', { lang })} ${updatedAt}
`;

      if (!ctx.session.ownerStadions) {
        ctx.session.ownerStadions = [];
      }
      const sendText = async () => {
        const sent = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                stadion.stadion_mini
                  ? {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: `owner_miniStadion_${stadion.id}`,
                    }
                  : {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'stadion',
                        id: stadion.id,
                      }),
                    },
              ],
            ],
          },
        });
        ctx.session.ownerStadions?.push(sent.message_id);
      };

      if (stadion.image) {
        try {
          const sent = await ctx.replyWithPhoto(stadion.image, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  stadion.stadion_mini
                    ? {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `owner_miniStadion_${stadion.id}`,
                      }
                    : {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: JSON.stringify({
                          type: 'stadion',
                          id: stadion.id,
                        }),
                      },
                ],
              ],
            },
          });
          ctx.session.ownerStadions.push(sent.message_id);
        } catch (err) {
          await sendText();
        }
      } else {
        await sendText();
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
}
