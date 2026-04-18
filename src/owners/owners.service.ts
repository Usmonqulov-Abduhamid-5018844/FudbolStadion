import { Injectable } from '@nestjs/common';
import { Payments } from '@prisma/client';
import { InlineKeyboardButton } from '@telegraf/types';
import { toZonedTime, format } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { statusMap } from 'src/helpers/bookingStatus';
import { MyContext } from 'src/helpers/bot.sesion';
import { IBooking } from 'src/helpers/interface';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { getPaymentText } from 'src/helpers/peyments_type';
import { getPaymentUrl } from 'src/helpers/url';
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

  async registor(ctx: MyContext, lang: string) {
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

  async registor_step(ctx: MyContext, lang: string) {
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
        try {
          const owner = await this.prisma.owners.findFirst({
            where: { email: String(ctx.message.text) },
          });
          if (owner) {
            ctx.reply(
              this.i18n.translate('registor.email_exists_error', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_owner_6',
                      },
                    ],
                  ],
                  remove_keyboard: true,
                  one_time_keyboard: true,
                },
              },
            );
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
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
          return;
        } catch (error) {}
      }
    } else if (ctx.message && 'contact' in ctx.message) {
      if (ctx.session.owner_registor.step === 'phone') {
        try {
          ctx.session.owner_registor.phone = ctx.message.contact.phone_number;
          ctx.session.owner_registor.step = null;
          ctx.session.step = 'finish';
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
          console.log(error);
          await this.utils.errorFunction(ctx);
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
        where: { owner_id: owner.id, stadion_mini: false },
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
      const isValidName = /^[a-zA-Zа-яА-ЯёЁ0-9\s'’-]+$/.test(text);
      if (!isValidName) {
        await ctx.reply(
          this.i18n.translate('booking.stadions.format', { lang }),
        );
        return;
      }
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
      await this.utils.errorFunction(ctx);
      console.log('ERROR', error);
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
      await this.utils.errorFunction(ctx);
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
  async ownerBackSwitch(ctx: MyContext, data: string, lang: string) {
    try {
      switch (data) {
        case '1':
          {
            ctx.reply(
              this.i18n.translate('menyu_buttons.menu', { lang }),
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
          break;
        case '2':
          {
            try {
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
                await ctx.reply(
                  this.i18n.translate('stadions.stadion', { lang }),
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: this.i18n.translate('stadions.add', {
                              lang,
                            }),
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
                  },
                );
                return;
              }
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
              await ctx.reply(
                this.i18n.translate('stadions.select', { lang }),
                {
                  reply_markup: { inline_keyboard: button },
                },
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;
        case '3':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch {}
            }
            try {
              const region = await this.prisma.region.findMany();
              if (!region.length) {
                throw new Error();
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

              await ctx.reply(
                this.i18n.translate('stadions.stadion_region', { lang }),
                {
                  reply_markup: { inline_keyboard: button },
                },
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;
        case '4':
          {
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
          }
          break;
        case 'help':
          {
            try {
              await this.utils.safeEditHelpMenuReply(
                ctx,
                this.i18n.translate('help.help.title', { lang }),
              );
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;
        case '5':
          {
            ctx.session.step = 'registor';
            ctx.reply(
              this.i18n.translate('registor.title', {
                lang: ctx.session.lang || ctx.from?.language_code,
              }),
              Markup.keyboard([
                [`💼 ${this.i18n.translate('registor.button.0', { lang })}`],
                [`🏃🏼 ${this.i18n.translate('registor.button.1', { lang })}`],
              ])
                .oneTime()
                .resize(),
            );
          }
          break;
        case '6': {
          return this.registor(ctx, lang);
        }
        case '7': {
          try {
            await this.utils.clearSessionMessages(ctx);
          } catch (error) {}
        }
        default: {
          break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadionSplit(
    ctx: MyContext,
    count: number,
    stadionId: number,
    lang: string,
  ) {
    try {
      const parent = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!parent) {
        await this.utils.errorFunction(ctx);
        return;
      }

      const childLength = Math.floor(parent.length / count);
      const childWidth = Math.floor(parent.width / count);
      const childPrice = Math.floor(parent.price / count);
      const childMax = Math.floor(parent.max_count / count);

      for (let i = 0; i < count; i++) {
        const send = await this.prisma.stadion.create({
          data: {
            stadion_mini: true,
            image: parent.image,
            name: parent.name + ` - ${i + 1}`,
            parent_id: parent.id,
            length: childLength,
            width: childWidth,
            price: childPrice,
            max_count: childMax,
            owner_id: parent.owner_id,
            region_id: parent.region_id,
            region_item_id: parent.region_item_id,
            working_status: true,
            latitude: parent.latitude,
            longitude: parent.longitude,
            admin_checked: parent.admin_checked,
            mini: parent.mini,
          },
        });
      }
      const sent = await ctx.reply(
        this.i18n.translate('success.mini_stadium_created', {
          lang,
          args: { count },
        }),
      );
      if (!ctx.session.stadionMessages) {
        ctx.session.stadionMessages = [];
      }
      ctx.session.stadionMessages.push(sent.message_id);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async miniStadion(ctx: MyContext, childId: number, lang: string) {
    try {
      const child = await this.prisma.stadion.findFirstOrThrow({
        where: { id: childId, parent_id: { not: null }, stadion_mini: true },
      });
      const keyboard: InlineKeyboardButton[][] = [
        [
          {
            text: this.i18n.translate('stadions.stadium.name', { lang }),
            callback_data: JSON.stringify({
              type: 'Stadion_nomi',
              id: child.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.price', { lang }),
            callback_data: JSON.stringify({ type: 'price', id: child.id }),
          },
        ],
        [
          {
            text: this.i18n.translate('stadions.players_count', { lang }),
            callback_data: JSON.stringify({
              type: 'players_count',
              id: child.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.image', { lang }),
            callback_data: JSON.stringify({ type: 'image', id: child.id }),
          },
        ],
        [
          {
            text: this.i18n.translate('stadions.menyu.all_data', {
              lang,
            }),
            callback_data: JSON.stringify({
              type: 'all_data',
              id: child.id,
            }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.delete', { lang }),
            callback_data: JSON.stringify({
              type: 'delete',
              id: child.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'miniStadionlar',
              id: child.parent_id,
            }),
          },
        ],
      ];
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.mini_stadium_settings', { lang }),
        {
          inline_keyboard: keyboard,
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async miniStadionlar(ctx: MyContext, stadionId: number, lang: string) {
    try {
      if (ctx.session.stadionMessages?.length) {
        await ctx.deleteMessages(ctx.session.stadionMessages);
      }
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch (error) {}
      }

      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          children: {
            orderBy: { updatedAt: 'desc' },
          },
        },
      });

      if (!stadion?.children.length) {
        await this.utils.safeEditOrReply(
          ctx,
          this.i18n.translate('stadions.stadium_not_divided', { lang }),
          {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('stadions.stadium_divide', {
                    lang,
                  }),
                  callback_data: `owner_stadionSplit_${stadionId}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: JSON.stringify({
                    type: 'stadion',
                    id: stadionId,
                  }),
                },
              ],
            ],
          },
        );
        return;
      }

      const button: InlineKeyboardButton[][] = [];
      for (const child of stadion.children) {
        const priceText = child.price
          ? this.i18n.translate('stadions.price_label', {
              lang,
              args: { price: child.price },
            })
          : this.i18n.translate('stadions.price_unknown', { lang });
        button.push([
          {
            text: this.i18n.translate('stadions.stadium_button', {
              lang,
              args: { name: child.name, price: priceText },
            }),
            callback_data: `owner_miniStadion_${child.id}`,
          },
        ]);
      }

      button.push([
        {
          text: this.i18n.translate('schedule.back', { lang }),
          callback_data: JSON.stringify({
            type: 'stadion',
            id: stadion.id,
          }),
        },
      ]);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.mini_stadium_list', { lang }),
        {
          inline_keyboard: button,
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async stadionMenyu(ctx: MyContext, stadionID: number, lang: string) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionID },
      });
      if (!stadion) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const keyboard: InlineKeyboardButton[][] = [
        [
          {
            text: this.i18n.translate('stadions.stadium.name', { lang }),
            callback_data: JSON.stringify({
              type: 'Stadion_nomi',
              id: stadion.id,
            }),
          },
          {
            text: this.i18n.translate('stadions.payment_method', { lang }),
            callback_data: JSON.stringify({
              type: 'payment_method',
              id: stadion.id,
            }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.working', { lang }),
            callback_data: JSON.stringify({
              type: 'schedule',
              id: stadion.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.price', { lang }),
            callback_data: JSON.stringify({ type: 'price', id: stadion.id }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.location', { lang }),
            callback_data: JSON.stringify({
              type: 'lokation',
              id: stadion.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.image', { lang }),
            callback_data: JSON.stringify({ type: 'image', id: stadion.id }),
          },
        ],
      ];

      if (!stadion.stadion_mini && !stadion.mini) {
        keyboard.push(
          [
            {
              text: this.i18n.translate('stadions.mini_stadium.my_stadiums', {
                lang,
              }),
              callback_data: JSON.stringify({
                type: 'miniStadionlar',
                id: stadion.id,
              }),
            },
          ],
          [
            {
              text: this.i18n.translate('stadions.change_working_status', {
                lang,
              }),
              callback_data: `stadion_type_workingStatus-${stadion.id}`,
            },
          ],
        );
      } else if (!stadion.stadion_mini) {
        keyboard.push([
          {
            text: this.i18n.translate('stadions.change_working_status', {
              lang,
            }),
            callback_data: `stadion_type_workingStatus-${stadion.id}`,
          },
        ]);
      }
      keyboard.push(
        [
          {
            text: this.i18n.translate('stadions.menyu.all_data', {
              lang,
            }),
            callback_data: JSON.stringify({
              type: 'all_data',
              id: stadion.id,
            }),
          },
        ],
        [
          {
            text: this.i18n.translate('schedule.delete', { lang }),
            callback_data: JSON.stringify({
              type: 'delete',
              id: stadion.id,
            }),
          },
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: JSON.stringify({
              type: 'back_1',
              id: stadion.id,
            }),
          },
        ],
      );
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.stadion_settings', { lang }),
        {
          inline_keyboard: keyboard,
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async stadionPayments(ctx: MyContext, stadionId: number, lang: string) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!stadion) {
        await this.utils.errorFunction(ctx);
        return;
      }
      if (stadion.stadion_mini) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const paymentText = getPaymentText(
        stadion.payments_type,
        this.i18n.translate('peyments', { lang }),
      );
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.current_payment_type', {
          lang,
          args: { payment: paymentText },
        }),
        {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('success.edit', { lang }),
                callback_data: JSON.stringify({
                  type: 'Update_Payments',
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
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async owner_Bron(ctx: MyContext, lang: string) {
    try {
      const ownerData = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
        include: {
          ownerCard: {
            select: {
              id: true,
            },
          },
          stadions: {
            select: {
              id: true,
            },
          },
        },
      });
      if (!ownerData) {
        return await this.utils.errorFunction(ctx);
      }
      if (!ownerData.stadions.length) {
        await ctx.reply(
          this.i18n.translate('owner_booking.no_stadion', { lang }),
          {
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
          },
        );
        return;
      }
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('owner_booking.booking_menu.title', { lang }),
        {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.active',
                  { lang },
                ),
                callback_data: `ownerBooking_active_${ownerData.id}_1`,
              },
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.pending',
                  { lang },
                ),
                callback_data: `ownerBooking_pending_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.today',
                  { lang },
                ),
                callback_data: `ownerBooking_today_${ownerData.id}_1`,
              },
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.tomorrow',
                  { lang },
                ),
                callback_data: `ownerBooking_tomorrow_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.upcoming',
                  { lang },
                ),
                callback_data: `ownerBooking_upcoming_${ownerData.id}_1`,
              },
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.now',
                  { lang },
                ),
                callback_data: `ownerBooking_now_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.all',
                  { lang },
                ),
                callback_data: `ownerBooking_all_${ownerData.id}_1`,
              },
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.cancelled',
                  { lang },
                ),
                callback_data: `ownerBooking_cancelled_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.by_stadion',
                  { lang },
                ),
                callback_data: `ownerBooking_Bystadion_${ownerData.id}_1`,
              },
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.search',
                  { lang },
                ),
                callback_data: `ownerBooking_search_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate(
                  'owner_booking.booking_menu.buttons.stats',
                  { lang },
                ),
                callback_data: `ownerBooking_stats_${ownerData.id}_1`,
              },
            ],
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: `back_owner_1`,
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async sendBookingMessage(
    ctx: MyContext,
    booking: IBooking,
    page: number,
    lang: string,
    type: string,
  ) {
    const button = this.utils.buildOwnerBookingButtons(
      booking,
      page,
      lang,
      type,
    );

    const send = await ctx.reply(
      this.i18n.translate('owner_booking.details', {
        lang,
        args: {
          id: booking.id,
          date: format(new Date(booking.date), 'dd.MM.yyyy'),
          time: `${booking.start_time} - ${booking.end_time}`,
          stadium: booking.stadion.name,
          region: booking.stadion.region.name,
          user: booking.user.full_name,
          status: statusMap(booking.status, this.i18n, lang),
          check_in: booking.check_in
            ? this.i18n.translate('owner_booking.check_in', { lang })
            : this.i18n.translate('owner_booking.not_check_in', { lang }),
        },
      }),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: button,
        },
      },
    );

    ctx.session.ownerActiveBooking ??= [];
    ctx.session.ownerActiveBooking.push(send.message_id);
  }

  async bookingDetails(
    ctx: MyContext,
    bookingId: number,
    page: number = 1,
    lang: string,
    type: string,
  ) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          stadion: {
            select: {
              name: true,
              owner_id: true,
              region: { select: { name: true } },
              region_items: { select: { name: true } },
            },
          },
          user: {
            select: {
              full_name: true,
              phone: true,
              username: true,
            },
          },
        },
      });

      if (!booking) return this.utils.errorFunction(ctx);

      const { totalMinutes, timeLeftText } = this.utils.bookingTimeCalculate(
        booking.date,
        booking.start_time,
        lang,
      );

      await this.utils.clearSessionMessages(ctx);

      const message = this.i18n.translate('owner_booking.full_details', {
        lang,
        args: {
          id: booking.id,
          stadium: booking.stadion.name,
          region: `${booking.stadion.region.name} / ${booking.stadion.region_items.name}`,
          date: format(booking.date, 'dd.MM.yyyy'),
          time: `${booking.start_time} - ${booking.end_time}`,
          time_left:
            totalMinutes > 0
              ? timeLeftText
              : this.i18n.translate('owner_booking.time_finished', { lang }),
          user: booking.user.full_name,
          phone: booking.user.phone,
          username: booking.user.username ? `🔗 @${booking.user.username}` : '',
          price: Number(booking.total_price),
          payment: getPaymentText(
            booking.payment_method,
            this.i18n.translate('peyments', { lang }),
          ),
          status: statusMap(booking.status, this.i18n, lang),
          created_at: format(booking.createdAt, 'dd.MM.yyyy HH:mm'),
          check_in: booking.check_in
            ? this.i18n.translate('owner_booking.check_in', { lang })
            : this.i18n.translate('owner_booking.not_check_in', { lang }),
        },
      });

      const send = await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: `ownerBooking_${type}_${booking.stadion.owner_id}_${page}`,
              },
            ],
          ],
        },
      });

      ctx.session.ownerActiveBooking ??= [];
      ctx.session.ownerActiveBooking.push(send.message_id);
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  async owner_card(ctx: MyContext, lang: string) {
    try {
      const owner = await this.prisma.owners.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!owner) {
        return await this.utils.errorFunction(ctx);
      }
      const owner_cards = await this.prisma.owner_card.findUnique({
        where: { owner_id: owner.id },
      });
      if (!owner_cards) {
        await ctx.reply(this.i18n.translate('peyments.not_found', { lang }), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('peyments.cards', { lang }),
                  url: getPaymentUrl(0, { id: 2 }),
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
      await this.utils.errorFunction(ctx);
    }
  }
}
