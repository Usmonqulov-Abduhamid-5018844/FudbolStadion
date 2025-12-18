import { Injectable } from '@nestjs/common';
import { Payments } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isCkecked } from 'src/helpers/isChecked_firstName';
import { PrismaService } from 'src/prisma/prisma.service';
import { Context, Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { format, formatInTimeZone } from 'date-fns-tz';
import { getPaymentText } from 'src/helpers/peyments_type';
import axios from 'axios';
@Injectable()
export class BotService {
  private ownerId: number;
  private userId: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async start(ctx: MyContext) {
    ctx.session = ctx.session || {};
    ctx.reply(
      `${this.i18n.translate('common.START', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
        [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
        [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
      ]),
    );
  }

  async checket(ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
          `${this.i18n.translate('registor.title', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          Markup.keyboard([
            [
              `💼 ${this.i18n.translate('registor.button.0', { lang: ctx.session.lang || ctx.from?.language_code })}`,
            ],
            [
              `🏃🏼 ${this.i18n.translate('registor.button.1', { lang: ctx.session.lang || ctx.from?.language_code })}`,
            ],
          ])
            .oneTime()
            .resize(),
        );
        return;
      }
      this.userId = users.id;
      const welcomeMessage = this.i18n.translate('common.HELLO', {
        lang: ctx.session.lang || ctx.from?.language_code,
        args: {
          name: isCkecked(ctx.from?.first_name)
            ? ctx.from?.first_name
            : `${this.i18n.translate('common.firstName', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        },
      });
      await ctx.reply(
        `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
          lang: ctx.session.lang || ctx.from?.language_code,
        })}`,
        Markup.keyboard([
          ['test', 'test'],
          ['⚙️ Sozlamalar', '❓ Yordam'],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }
    this.ownerId = owners.id;
    const welcomeMessage = this.i18n.translate('common.HELLO', {
      lang: ctx.session.lang || ctx.from?.language_code,
      args: {
        name: isCkecked(ctx.from?.first_name)
          ? ctx.from?.first_name
          : `${this.i18n.translate('common.firstName', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      },
    });
    await ctx.reply(
      `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
        lang: ctx.session.lang || ctx.from?.language_code,
      })}`,
      Markup.keyboard([
        [
          `${this.i18n.translate('menyu_buttons.stadion', { lang })}`,
          `${this.i18n.translate('menyu_buttons.bron', { lang })}`,
        ],
        [
          `${this.i18n.translate('menyu_buttons.settings', { lang })}`,
          `${this.i18n.translate('menyu_buttons.help', { lang })}`,
        ],
      ])
        .resize()
        .oneTime(),
    );
  }

  async createStadion(ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;

    await ctx.replyWithPhoto(String(ctx.session.stadion.image), {
      caption: 'Image',
    });
    ctx.reply(
      `Name: ${ctx.session.stadion.name}\nUzunligi:${ctx.session.stadion.length}\nEni: ${ctx.session.stadion.width}\nNarxi: ${ctx.session.stadion.price}\nJoylashuvi: https://www.google.com/maps?q=${ctx.session.stadion.latitude},${ctx.session.stadion.longitude}\nTo'lov turi: ${ctx.session.stadion.payments_type}\nOdamlar soni: ${ctx.session.stadion.max_count}\n region_id: ${ctx.session.stadion.region_id}\n Tuman_id: ${ctx.session.stadion.region_item_id}`,
    );

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
        owner_id: this.ownerId,
        length: Number(ctx.session.stadion.length),
        width: Number(ctx.session.stadion.width),
        payments_type: ctx.session.stadion.payments_type,
      };
      const stadion = await this.prisma.stadion.create({ data });

      ctx.reply(
        `${this.i18n.translate('stadions.stadion_added_success', { lang })}`,
        {
          reply_markup: {
            keyboard: [
              [{ text: `${this.i18n.translate('stadions.menu', { lang })}` }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
      ctx.session.step = 'menyu';
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }

  async renderScheduleMenu(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;

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
              text: `${this.i18n.translate('schedule.schedules.view_schedule', { lang })}`,
              callback_data: JSON.stringify({
                type: 'view_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: `${this.i18n.translate('schedule.back', { lang })}`,
              callback_data: JSON.stringify({
                type: 'schedule',
                id: stadion_id,
                back: 'back',
              }),
            },
          ],
        ];
        try {
          await ctx.editMessageText(
            `${this.i18n.translate('schedule.schedules.manager_weekli', { lang })}`,
            {
              reply_markup: { inline_keyboard: inlineKeyboard },
            },
          );
        } catch (e) {
          if (e.description?.includes("can't be edited")) {
            ctx.reply(
              `${this.i18n.translate('schedule.schedules.manager_weekli', { lang })}`,
              {
                reply_markup: { inline_keyboard: inlineKeyboard },
              },
            );
          }
        }
        return;
      } else if (existingSchedules.length) {
        inlineKeyboard = [
          [
            {
              text: `${this.i18n.translate('schedule.schedules.view_schedule', { lang })}`,
              callback_data: JSON.stringify({
                type: 'view_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: `${this.i18n.translate('schedule.schedules.add_schedule', { lang })}`,
              callback_data: JSON.stringify({
                type: 'add_schedule',
                id: stadion_id,
              }),
            },
          ],
          [
            {
              text: `${this.i18n.translate('schedule.back', { lang })}`,
              callback_data: JSON.stringify({
                type: 'schedule',
                id: stadion_id,
                back: 'back',
              }),
            },
          ],
        ];
        try {
          await ctx.editMessageText(
            `${this.i18n.translate('schedule.schedules.manager_weekli', { lang })}`,
            {
              reply_markup: { inline_keyboard: inlineKeyboard },
            },
          );
        } catch (e) {
          if (e.description?.includes("can't be edited")) {
            ctx.reply(
              `${this.i18n.translate('schedule.schedules.manager_weekli', { lang })}`,
              {
                reply_markup: { inline_keyboard: inlineKeyboard },
              },
            );
          }
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
            text: `${this.i18n.translate('schedule.back', { lang })}`,
            callback_data: JSON.stringify({ type: 'schedule', id: stadion_id }),
          },
        ]);
      }

      try {
        await ctx.editMessageText(
          `${this.i18n.translate('schedule.schedules.craed_week', { lang })}`,
          {
            reply_markup: { inline_keyboard: inlineKeyboard },
          },
        );
      } catch (e) {
        if (e.description?.includes("can't be edited")) {
          ctx.reply(
            `${this.i18n.translate('schedule.schedules.craed_week', { lang })}`,
            {
              reply_markup: { inline_keyboard: inlineKeyboard },
            },
          );
        }
      }
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  async renderSchedule_week(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;

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
            text: `${this.i18n.translate('schedule.back', { lang })}`,
            callback_data: JSON.stringify({
              type: 'week_schedule',
              id: stadion_id,
            }),
          },
        ]);
      }

      try {
        await ctx.editMessageText(
          `${this.i18n.translate('schedule.schedules.craed_week', { lang })}`,
          {
            reply_markup: { inline_keyboard: inlineKeyboard },
          },
        );
      } catch (e) {
        if (e.description?.includes("can't be edited")) {
          ctx.reply(
            `${this.i18n.translate('schedule.schedules.craed_week', { lang })}`,
            {
              reply_markup: { inline_keyboard: inlineKeyboard },
            },
          );
        }
      }
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  async viewSchedule(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
            text: `${this.i18n.translate('schedule.schedules.delet', { lang })}`,
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
            text: `${this.i18n.translate('schedule.back', { lang })}`,
            callback_data: JSON.stringify({
              type: 'week_schedule',
              id: stadion_id,
            }),
          },
        ]);
        try {
          await ctx.editMessageText(
            `${this.i18n.translate('schedule.schedules.week', { lang })}`,
            {
              reply_markup: { inline_keyboard: inlineKeyboard },
            },
          );
        } catch (e) {
          if (e.description?.includes("can't be edited")) {
            ctx.reply(
              `${this.i18n.translate('schedule.schedules.week', { lang })}`,
              {
                reply_markup: { inline_keyboard: inlineKeyboard },
              },
            );
          }
        }
      } else {
        return this.renderScheduleMenu(ctx, stadion_id);
      }
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async stadion_off_days(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
              text: `${this.i18n.translate('schedule.schedules.delet', { lang })}`,
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
            text: `${this.i18n.translate('schedule.schedules.add_schedule', { lang })}`,
            callback_data: JSON.stringify({
              id: stadion_id,
              type: 'off_stadion',
            }),
          },
        ],
        [
          {
            text: `${this.i18n.translate('schedule.back', { lang })}`,
            callback_data: JSON.stringify({
              type: 'schedule',
              id: stadion_id,
              back: 'back',
            }),
          },
        ],
      );
      try {
        await ctx.editMessageText(
          `${this.i18n.translate('schedule.off_day.off', { lang })}`,
          {
            reply_markup: { inline_keyboard: button },
          },
        );
      } catch (e) {
        if (e.description?.includes("can't be edited")) {
          ctx.reply(
            `${this.i18n.translate('schedule.off_day.off', { lang })}`,
            {
              reply_markup: { inline_keyboard: button },
            },
          );
        }
      }
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }

  async stadion_special(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
              text: `${this.i18n.translate('schedule.schedules.delet', { lang })}`,
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
            text: `${this.i18n.translate('schedule.schedules.add_schedule', { lang })}`,
            callback_data: JSON.stringify({
              type: 'add_special',
              id: stadion_id,
            }),
          },
        ],
        [
          {
            text: `${this.i18n.translate('schedule.back', { lang })}`,
            callback_data: JSON.stringify({
              type: 'schedule',
              id: stadion_id,
              back: 'back',
            }),
          },
        ],
      );
      try {
        await ctx.editMessageText(
          `${this.i18n.translate('schedule.specile_days', { lang })}`,
          {
            reply_markup: { inline_keyboard: button },
          },
        );
      } catch (e) {
        if (e.description?.includes("can't be edited")) {
          ctx.reply(`${this.i18n.translate('schedule.specile_days')}`, {
            reply_markup: { inline_keyboard: button },
          });
        }
      }
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async location(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(`${this.i18n.translate('stadions.not_fount')}`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `${this.i18n.translate('schedule.back', { lang })}`,
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
        ctx.reply(
          `${this.i18n.translate('stadions.menyu.update_text', { lang })}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `${this.i18n.translate('stadions.menyu.location', { lang })}`,
                    callback_data: JSON.stringify({
                      type: 'update_location',
                      id: stadion.id,
                    }),
                  },
                ],
                [
                  {
                    text: `${this.i18n.translate('schedule.back', { lang })}`,
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
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async stadion_price(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(`${this.i18n.translate('stadions.not_fount')}`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `${this.i18n.translate('schedule.back', { lang })}`,
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
        await ctx.reply(
          `${this.i18n.translate('stadions.menyu.price', { lang, args: { price: stadion.price.toLocaleString('uz-UZ') } })}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `${this.i18n.translate('stadions.menyu.update_price', { lang })}`,
                    callback_data: JSON.stringify({
                      type: 'Update_price',
                      id: stadion.id,
                    }),
                  },
                ],
                [
                  {
                    text: `${this.i18n.translate('schedule.back', { lang })}`,
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
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async stadion_image(ctx: MyContext, stadion_id: number) {
    const lang = ctx.session.lang || ctx.from?.language_code;
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
      });
      if (!stadion) {
        ctx.reply(`${this.i18n.translate('stadions.not_fount')}`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `${this.i18n.translate('schedule.back', { lang })}`,
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
          `${this.i18n.translate('stadions.menyu.update_image_text', { lang })}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `${this.i18n.translate('stadions.menyu.update_image', { lang })}`,
                    callback_data: JSON.stringify({
                      type: 'update_image',
                      id: stadion.id,
                    }),
                  },
                ],
                [
                  {
                    text: `${this.i18n.translate('schedule.back', { lang })}`,
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
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async all_data(ctx: MyContext, stadion_id: number) {
    let lang = ctx.session.lang || ctx.from?.language_code;

    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadion_id },
        select: {
          name: true,
          latitude: true,
          longitude: true,
          image: true,
          price: true,
          max_count: true,
          length: true,
          width: true,
          payments_type: true,
          is_premium: true,
          working_status: true,
          createdAt: true,
          updatedAt: true,
          owner_id: true,
        },
      });

      if (!stadion) {
        return ctx.reply(
          `${this.i18n.translate('stadions.not_found', { lang })}`,
        );
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

      let locationText = `${this.i18n.translate('view.not_available', { lang })}`;
      if (stadion.latitude && stadion.longitude) {
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${stadion.latitude},${stadion.longitude}`;
        locationText = `<a href="${mapsLink}">${this.i18n.translate('view.view', { lang })}</a>`;
      }

      const message = `
🏟 <b>${stadion.name}</b>\n
${this.i18n.translate('view.locate', { lang })} ${locationText}
${this.i18n.translate('view.count', { lang })} ${stadion.max_count || `${this.i18n.translate('view.not', { lang })}`}
${this.i18n.translate('view.size', { lang })} ${stadion.length || '❌'} x ${stadion.width || '❌'}
${this.i18n.translate('view.price', { lang })} ${formatPrice(stadion.price) || '❌'}
${this.i18n.translate('view.peyments', { lang })} ${getPaymentText(stadion.payments_type, String(lang), this.i18n.translate('peyments', { lang }))}
${this.i18n.translate('view.phone', { lang })} ${owner?.phone}
${this.i18n.translate('view.premium', { lang })} ${stadion.is_premium ? `${this.i18n.translate('view.yes', { lang })}` : `${this.i18n.translate('view.no', { lang })}`}
${(this, this.i18n.translate('view.status', { lang }))} ${stadion.working_status ? `${this.i18n.translate('view.active', { lang })}` : `${this.i18n.translate('view.inactive', { lang })}`}
${this.i18n.translate('view.creted', { lang })} ${createdAt}
${this.i18n.translate('view.update', { lang })} ${updatedAt}
`;

      if (stadion.image) {
        await ctx.replyWithPhoto(stadion.image, {
          caption: message,
          parse_mode: 'HTML',
        });
        ctx.reply(
          `${this.i18n.translate('stadions.menyu.all_data', { lang })}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `${this.i18n.translate('schedule.back', { lang })}`,
                    callback_data: JSON.stringify({
                      type: 'stadion',
                      id: stadion_id,
                    }),
                  },
                ],
              ],
            },
          },
        );
      } else {
        await ctx.reply(message, {
          parse_mode: 'HTML',
        });
        ctx.reply(
          `${this.i18n.translate('stadions.menyu.all_data', { lang })}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `${this.i18n.translate('schedule.back', { lang })}`,
                    callback_data: JSON.stringify({
                      type: 'stadion',
                      id: stadion_id,
                    }),
                  },
                ],
              ],
            },
          },
        );
      }
    } catch (error) {
      console.error(error);
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
}
