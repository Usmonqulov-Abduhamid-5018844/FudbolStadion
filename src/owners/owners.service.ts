import { Injectable } from '@nestjs/common';
import { Payments } from '@prisma/client';
import { InlineKeyboardButton } from '@telegraf/types';
import { url } from 'inspector';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { MyContext } from 'src/helpers/bot.sesion';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { Markup } from 'telegraf';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly utils: UtilisService,
    private readonly botService: BotService,
  ) {}

  async registor(ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session = ctx.session || {};
    ctx.session.step = 'owner_registor';

    ctx.session.owner_registor = ctx.session.owner_registor || {
      full_name: null,
      email: null,
      phone: null,
      step: null,
    };
    ctx.session.owner_registor.step = 'full_name';

    ctx.reply(this.i18n.translate('registor.name', { lang }), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: 'back_owner_5',
            },
          ],
        ],
      },
    });
  }

  async registor_step(ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.owner_registor.step === 'full_name') {
        ctx.session.owner_registor.full_name = ctx.message.text;
        ctx.session.owner_registor.step = 'email';

        ctx.reply(this.i18n.translate('registor.email', { lang }), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: 'back_owner_6',
                },
              ],
            ],
          },
        });
        return;
      } else if (ctx.session.owner_registor.step === 'email') {
        if (!isEmailFormat(ctx.message.text)) {
          ctx.reply(this.i18n.translate('registor.email_format', { lang }));
          return;
        }
        ctx.session.owner_registor.email = ctx.message.text;
        ctx.session.owner_registor.step = 'phone';
        ctx.reply(this.i18n.translate('registor.phone', { lang }), {
          reply_markup: {
            keyboard: [
              [
                {
                  text: this.i18n.translate('registor.send_phone', { lang }),
                  request_contact: true,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
    } else if (ctx.message && 'contact' in ctx.message) {
      if (ctx.session.owner_registor.step === 'phone') {
        ctx.session.owner_registor.phone = ctx.message.contact.phone_number;
        ctx.session.owner_registor.step = null;
        ctx.session.step = 'finish';
        try {
          const data = {
            username: String(ctx.from?.username),
            full_name: String(ctx.session.owner_registor.full_name),
            phone: String(ctx.session.owner_registor.phone),
            email: String(ctx.session.owner_registor.email),
            chatID: String(ctx.from!.id),
          };
          await this.prisma.owners.create({ data: { ...data } });

          ctx.reply(
            this.i18n.translate('registor.finish', { lang }),
            Markup.keyboard([
              [
                this.i18n.translate('menyu_buttons.stadion', { lang }),
                this.i18n.translate('menyu_buttons.bron', { lang }),
              ],
              [
                this.i18n.translate('menyu_buttons.settings', { lang }),
                this.i18n.translate('menyu.buttons.help', { lang }),
              ],
              [this.i18n.translate('menyu_buttons.card', { lang })],
            ])
              .resize()
              .oneTime(),
          );
        } catch (error) {
          ctx.reply(this.i18n.translate('error.error', { lang }));
        }
      }
    }
  }
  async ownerContakt(ctx: MyContext, owner_id: number) {
    const lang = await this.utils.langs(ctx);
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { id: owner_id },
      });
      if (owner) {
        ctx.reply(
          `${this.i18n.translate('success.your_phone', { lang })} ${owner.phone}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('success.edit', { lang }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'phone_update',
                    }),
                  },
                ],
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: JSON.stringify({
                      id: owner.id,
                      type: 'phone_back',
                    }),
                  },
                ],
              ],
            },
          },
        );
      }
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async handleStadionMenu(ctx: MyContext, lang: string) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!owner) {
        throw new Error();
      }
      const stadion = await this.prisma.stadion.findMany({
        where: { owner_id: owner.id },
        orderBy: { updatedAt: 'desc' },
      });
      if (!stadion.length) {
        await ctx.reply(this.i18n.translate('stadions.stadion', { lang }), {
          reply_markup: {
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
        });
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
        await ctx.reply(this.i18n.translate('stadions.select', { lang }), {
          reply_markup: { inline_keyboard: button },
        });
      }
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async ownerSettings(ctx: MyContext, lang: string) {
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
                text: this.i18n.translate('settings.account', { lang }),
                callback_data: JSON.stringify({
                  id: owner.id,
                  type: 'account',
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
  }

  async updatePhone(ctx: MyContext, lang: string, text: string) {
    try {
      const phone = text;

      const phoneRegex = /^(?:\+998|998)?[0-9]{9}$/;

      if (!phone || !phoneRegex.test(phone)) {
        ctx.reply(this.i18n.translate('error.phone_invalid', { lang }));
        return;
      }

      let normalizedPhone = phone;

      if (phone.length === 9) {
        normalizedPhone = `+998${phone}`;
      } else if (phone.startsWith('998')) {
        normalizedPhone = `+${phone}`;
      }

      ctx.session.owner_registor.phone = null;
      const id = Number(ctx.session.owner_registor.id);

      await this.prisma.owners.update({
        where: { id },
        data: { phone: normalizedPhone },
      });
      ctx.reply(this.i18n.translate('success.phone_updated', { lang }));
      return this.ownerContakt(ctx, id);
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async handleStadionSteps(ctx: MyContext, lang: string, text: string) {
    if (ctx.session.stadion.name === 'N') {
      ctx.session.stadion.name = text;
      ctx.session.stadion.step = 3;

      await ctx.reply(
        this.i18n.translate('stadions.location', {
          lang,
        }),
        {
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
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );

      ctx.session.stadion.lockation = 'L';
      return;
    }
    if (ctx.session.stadion.max_count === 0) {
      const input = text;
      const count = Number(input);
      if (!/^\d+$/.test(input)) {
        await ctx.reply(this.i18n.translate('error.number_error', { lang }));
        return;
      }

      if (count <= 0) {
        await ctx.reply(this.i18n.translate('error.positive_number', { lang }));
        return;
      }
      ctx.session.stadion.max_count = count;
      ctx.session.stadion.length = 'length';
      ctx.session.stadion.step = 5;
      ctx.reply(this.i18n.translate('stadions.length', { lang }), {
        reply_markup: {
          keyboard: [
            [
              {
                text: this.i18n.translate('stadions.back', { lang }),
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (ctx.session.stadion.length === 'length') {
      const input = text;
      const length = Number(input);
      if (!/^\d+$/.test(input)) {
        await ctx.reply(this.i18n.translate('error.number_error', { lang }));
        return;
      }

      if (length <= 0) {
        await ctx.reply(this.i18n.translate('error.positive_number', { lang }));
        return;
      }
      ctx.session.stadion.length = length;
      ctx.session.stadion.width = 'width';
      ctx.session.stadion.step = 6;
      ctx.reply(this.i18n.translate('stadions.width', { lang }), {
        reply_markup: {
          keyboard: [
            [
              {
                text: this.i18n.translate('stadions.back', { lang }),
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (ctx.session.stadion.width === 'width') {
      const input = text;
      const width = Number(input);
      if (!/^\d+$/.test(input)) {
        await ctx.reply(this.i18n.translate('error.number_error', { lang }));
        return;
      }

      if (width <= 0) {
        await ctx.reply(this.i18n.translate('error.positive_number', { lang }));
        return;
      }
      ctx.session.stadion.width = width;
      ctx.session.stadion.price = 'price';
      ctx.session.stadion.step = 7;
      ctx.reply(this.i18n.translate('stadions.price', { lang }), {
        reply_markup: {
          keyboard: [
            [
              {
                text: this.i18n.translate('stadions.back', { lang }),
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (ctx.session.stadion.price === 'price') {
      const input = text;
      const price = Number(input);

      if (!/^\d+$/.test(input)) {
        await ctx.reply(this.i18n.translate('error.number_error', { lang }));
        return;
      }

      if (price <= 0) {
        await ctx.reply(this.i18n.translate('error.positive_number', { lang }));
        return;
      }

      if (price > 1500000) {
        await ctx.reply(this.i18n.translate('error.too_large', { lang }));
        return;
      }

      ctx.session.stadion.price = price;
      ctx.session.stadion.payments = 'payments';
      ctx.session.stadion.step = 8;
      ctx.reply(this.i18n.translate('stadions.paymenst_type', { lang }), {
        reply_markup: {
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
                text: this.i18n.translate('stadions.back', { lang }),
                callback_data: 'back_owner_4',
              },
            ],
          ],
        },
      });
    }
  }

  async handleOffDays(ctx: MyContext, lang: string, text: string) {
    const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(text);
    if (!isValidFormat) {
      await ctx.reply(this.i18n.translate('schedule.off_day.format', { lang }));
      return;
    }

    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(text);

    const isRealDate =
      date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day;

    if (!isRealDate) {
      await ctx.reply(
        this.i18n.translate('schedule.off_day.not_fount_day', { lang }),
      );
      return;
    }
    if (ctx.session.step === 'add_special') {
      await ctx.reply(this.i18n.translate('schedule.time_specile', { lang }));
      ctx.session.stadion.special = date;
      ctx.session.step = 'special_time';
      return;
    }
    if (ctx.session.step === 'edit_specile') {
      await ctx.reply(this.i18n.translate('schedule.update_time', { lang }));
      ctx.session.stadion.special = date;
      ctx.session.step = 'special_time_edit';
      return;
    }

    try {
      if (ctx.session.step === 'week_edit') {
        await this.prisma.stadion_off_days.update({
          where: { id: Number(ctx.session.stadion.off) },
          data: { date },
        });
        await ctx.reply(
          this.i18n.translate('schedule.off_day.update', { lang }),
        );
        ctx.session.step = null;
        return this.botService.stadion_off_days(
          ctx,
          Number(ctx.session.stadion.id),
        );
      }

      await this.prisma.stadion_off_days.create({
        data: {
          stadion_id: Number(ctx.session.stadion.id),
          date: date,
        },
      });

      await ctx.reply(
        this.i18n.translate('schedule.off_day.succses', { lang }),
      );
      ctx.session.step = null;
      return this.botService.stadion_off_days(
        ctx,
        Number(ctx.session.stadion.id),
      );
    } catch (e) {
      await ctx.reply(this.i18n.translate('schedule.off_day.error', { lang }));
    }
  }

  async handleSchedule(ctx: MyContext, lang: string, text: string) {
    const timePattern =
      /^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)$/;
    const match = text.match(timePattern);

    if (!match) {
      ctx.reply(this.i18n.translate('schedule.schedules.format', { lang }));
      return;
    }

    const startTime = `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
    const endTime = `${match[3].padStart(2, '0')}:${match[4].padStart(2, '0')}`;

    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    if (toMinutes(startTime) >= toMinutes(endTime)) {
      ctx.reply(this.i18n.translate('schedule.schedules.error', { lang }));
      return;
    }

    try {
      if (ctx.session.step === 'special_time') {
        await this.prisma.stadion_special_schedule.create({
          data: {
            date: new Date(ctx.session.stadion.special),
            start_time: startTime,
            end_time: endTime,
            stadion_id: Number(ctx.session.stadion.id),
          },
        });
        await ctx.reply(
          this.i18n.translate('schedule.off_day.succses', { lang }),
        );
        ctx.session.step = null;
        return this.botService.stadion_special(
          ctx,
          Number(ctx.session.stadion.id),
        );
      }
      if (ctx.session.step === 'special_time_edit') {
        await this.prisma.stadion_special_schedule.update({
          where: {
            id: Number(ctx.session.stadion.schedule_id),
          },
          data: {
            stadion_id: Number(ctx.session.stadion.id),
            start_time: startTime,
            end_time: endTime,
            date: ctx.session.stadion.special,
          },
        });
        await ctx.reply(
          this.i18n.translate('schedule.off_day.update', { lang }),
        );
        ctx.session.step = null;
        return this.botService.stadion_special(
          ctx,
          Number(ctx.session.stadion.id),
        );
      }
      if (ctx.session.step === 'edit_schedule_time') {
        await this.prisma.stadion_chedule.update({
          where: { id: Number(ctx.session.stadion.schedule_id) },
          data: { start_time: startTime, end_time: endTime },
        });

        await ctx.reply(
          this.i18n.translate('schedule.schedules.updated', { lang }),
        );
      } else {
        await this.prisma.stadion_chedule.create({
          data: {
            stadion_id: Number(ctx.session.stadion.id),
            day_of_week: Number(ctx.session.stadion.schedule_day),
            start_time: startTime,
            end_time: endTime,
          },
        });

        await ctx.reply(
          this.i18n.translate('schedule.schedules.creat', { lang }),
        );
      }
    } catch (error) {
      ctx.reply(
        this.i18n.translate('schedule.schedules.creat_error', { lang }),
      );
    }
    ctx.session.step = null;
    ctx.session.stadion.schedule_day = null;

    return this.botService.renderScheduleMenu(
      ctx,
      Number(ctx.session.stadion.id),
    );
  }
  async handlePrice(ctx: MyContext, lang: string, text: string) {
    const price = Number(text);

    if (!/^\d+$/.test(text)) {
      await ctx.reply(this.i18n.translate('error.number_error', { lang }));
      return;
    }

    if (price <= 0) {
      await ctx.reply(this.i18n.translate('error.positive_number', { lang }));
      return;
    }

    if (price > 1500000) {
      await ctx.reply(this.i18n.translate('error.too_large', { lang }));
      return;
    }
    try {
      const stadion = await this.prisma.stadion.update({
        where: { id: Number(ctx.session.stadion.id) },
        data: { price },
      });
      return this.botService.stadion_price(ctx, stadion.id);
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async handleStadionBack(ctx: MyContext, lang: string) {
    switch (ctx.session.stadion.step) {
      case 4: {
        await ctx.reply(
          this.i18n.translate('stadions.location', {
            lang,
          }),
          {
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
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );

        ctx.session.stadion.lockation = 'L';
        return;
      }

      case 5: {
        await ctx.reply(
          this.i18n.translate('stadions.location_back', { lang }),
        );
        ctx.session.stadion.max_count = 0;
        return;
      }

      case 6: {
        ctx.session.stadion.length = 'length';
        ctx.session.stadion.step = 5;
        ctx.reply(this.i18n.translate('stadions.length', { lang }), {
          reply_markup: {
            keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.back', { lang }),
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      case 7: {
        ctx.session.stadion.width = 'width';
        ctx.session.stadion.step = 6;
        ctx.reply(this.i18n.translate('stadions.width', { lang }), {
          reply_markup: {
            keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.back', { lang }),
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      case 9: {
        ctx.session.stadion.payments = 'payments';
        ctx.session.stadion.step = 8;
        ctx.reply(this.i18n.translate('stadions.paymenst_type', { lang }), {
          reply_markup: {
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
                  text: this.i18n.translate('stadions.back', { lang }),
                  callback_data: 'back_owner_4',
                },
              ],
            ],
          },
        });
        return;
      }

      default: {
        break;
      }
    }
  }

  async owner_Bron(ctx: MyContext, lang: string) {
    try {
      ctx.reply('Tez kunlarda...');
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async owner_card(ctx: MyContext, lang: string) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!owner) {
        throw new Error('Owner not found');
      }
      const owner_cards = await this.prisma.owner_card.findFirst({
        where: { owner_id: owner.id },
      });
      if (!owner_cards) {
        await ctx.reply(this.i18n.translate('peyments.not_fount', { lang }), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('peyments.cards', { lang }),
                  url: 'https://docs.click.uz/en/click-api/',
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
      }
      await ctx.reply('Karta mavjud ✅', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: 'back_owner_1',
              },
            ],
          ],
        },
      });
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
}
