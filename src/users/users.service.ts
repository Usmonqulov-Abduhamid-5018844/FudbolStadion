import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { MyContext } from 'src/helpers/bot.sesion';
import { getDistance } from 'src/helpers/lokationSeorch';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly botService: BotService,
  ) {}

  async registor(ctx: MyContext, lang: string) {
    ctx.session = ctx.session || {};
    ctx.session.step = 'user_registor';

    ctx.session.user_registor = ctx.session.user_registor || {
      full_name: null,
      phone: null,
      step: 'full_name',
    };
    ctx.reply(this.i18n.translate('registor.name', { lang }));
  }

  async registor_step(ctx: MyContext, lang: string) {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.user_registor.step === 'full_name') {
        ctx.session.user_registor.full_name = ctx.message.text;

        ctx.session.user_registor.step = 'phone';
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
      }
    } else if (ctx.message && 'contact' in ctx.message) {
      if (ctx.session.user_registor.step === 'phone') {
        ctx.session.user_registor.phone = ctx.message.contact.phone_number;
        ctx.session.user_registor.step = null;
        ctx.session.step = 'finish';
        try {
          const data = {
            username: String(ctx.from?.username),
            full_name: String(ctx.session.user_registor.full_name),
            phone: String(ctx.session.user_registor.phone),
            chatID: String(ctx.from!.id),
          };
          await this.prisma.users.create({ data: { ...data } });

          ctx.reply(
            this.i18n.translate('registor.finish', { lang }),
            Markup.keyboard([
              [
                this.i18n.translate('menyu_buttons.user_stadion_booking', {
                  lang,
                }),
              ],
              [
                this.i18n.translate('menyu_buttons.settings', { lang }),
                this.i18n.translate('menyu_buttons.help', { lang }),
              ],
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
  async userMenyu(ctx: MyContext, lang: string) {
    ctx.reply(
      this.i18n.translate('menyu_buttons.menu', {
        lang,
      }),
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
  }

  async settings(ctx: MyContext, lang: string) {
    try {
      const user = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!user) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }

      ctx.reply(this.i18n.translate('settings.title', { lang }), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('settings.language', { lang }),
                callback_data: 'user_language',
              },
            ],
            [
              {
                text: this.i18n.translate('settings.phone', { lang }),
                callback_data: 'user_phone',
              },
            ],
            [
              {
                text: this.i18n.translate('settings.account', { lang }),
                callback_data: 'user_account',
              },
            ],
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: 'back_user_1',
              },
            ],
          ],
        },
      });
      ctx.session.step = null;
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userUpdate_phone(ctx: MyContext, lang: string, text: string) {
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

      ctx.session.user_registor.phone = null;

      await this.prisma.users.update({
        where: { chatID: String(ctx.from?.id) },
        data: { phone: normalizedPhone },
      });
      ctx.reply(this.i18n.translate('success.phone_updated', { lang }));
      const user = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!user) {
        await ctx.reply(this.i18n.translate('stadions.not_fount', { lang }));
        return;
      }
      await ctx.reply(
        `${this.i18n.translate('success.your_phone', { lang })} ${user.phone}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('success.edit', { lang }),
                  callback_data: 'user_editPhone',
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: 'back_user_2',
                },
              ],
            ],
          },
        },
      );
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userBackSwitch(ctx: MyContext, data: string, lang: string) {
    try {
      switch (data) {
        case '1': {
          return this.userMenyu(ctx, lang);
        }
        case '2': {
          return this.settings(ctx, lang);
        }
        default: {
          break;
        }
      }
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async userSwitch(ctx: MyContext, data: string, lang: string) {
    try {
      ctx.session.user_registor = ctx.session.user_registor || {
        id: null,
        full_name: null,
        phone: null,
        step: null,
      };
      switch (data) {
        case 'language':
          {
            ctx.session = ctx.session || {};
            ctx.reply(
              this.i18n.translate('common.START', { lang }),
              Markup.inlineKeyboard([
                [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
                [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
                [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
                [
                  Markup.button.callback(
                    `${this.i18n.translate('schedule.back', { lang })}`,
                    'back_user_2',
                  ),
                ],
              ]),
            );
            ctx.session.step = 'user_langs';
          }
          break;
        case 'phone':
          {
            const user = await this.prisma.users.findUnique({
              where: { chatID: String(ctx.from?.id) },
            });
            if (!user) {
              await ctx.reply(
                this.i18n.translate('stadions.not_fount', { lang }),
              );
              return;
            }
            await ctx.reply(
              `${this.i18n.translate('success.your_phone', { lang })} ${user.phone}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('success.edit', { lang }),
                        callback_data: 'user_editPhone',
                      },
                    ],
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_user_2',
                      },
                    ],
                  ],
                },
              },
            );
          }
          break;
        case 'editPhone':
          {
            ctx.session.user_registor.phone = 'phone';
            ctx.reply(this.i18n.translate('registor.phone', { lang }));
          }
          break;
        default: {
          break;
        }
      }
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userHelp(ctx: MyContext, lang: string) {
    ctx.reply('Help');
  }
  async userBooking(ctx: MyContext, lang: string) {
    try {
      ctx.reply('Stadion band qiloish', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '➕ Yangi stadionni band qilish',
                callback_data: 'user_stadionNewBron',
              },
            ],
            [
              {
                text: '📅 Faol bronlarim',
                callback_data: 'user_stadionBron',
              },
            ],
            [
              {
                text: '📜 Bronlar tarixi',
                callback_data: 'user_stadionBronHistory',
              },
            ],
            [
              {
                text: '⭐ Sevimli stadionlar',
                callback_data: 'user_stadionFavorite',
              },
            ],
            [
              {
                text: '🔎 Stadion qidirish',
                callback_data: 'user_stadionSeorch',
              },
            ],
            [
              {
                text: this.i18n.translate('schedule.back', { lang }),
                callback_data: 'back_user_1',
              },
            ],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async handleLocation(ctx: MyContext, lang: string, location: any) {
    try {
      if (!location) {
        return ctx.reply(
          this.i18n.translate('error.location_required', { lang }),
        );
      }

      const { latitude, longitude } = location;

      await ctx.sendChatAction('typing');

      await new Promise((r) => setTimeout(r, 2000));

      const stadiums = await this.prisma.stadion.findMany();

      const nearby = stadiums.filter((s) => {
        const distance = getDistance(
          latitude,
          longitude,
          s.latitude,
          s.longitude,
        );
        return distance < 5000;
      });

      if (!nearby.length) {
        return ctx.reply(this.i18n.translate('stadions.not_found', { lang }));
      }

      for (const s of nearby) {
        let locationText = this.i18n.translate('view.not_available', { lang });
        if (s.latitude && s.longitude) {
          const mapsLink = `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`;
          locationText = `<a href="${mapsLink}">${this.i18n.translate('view.view', { lang })}</a>`;
        }
        const formatPrice = (price?: number | string) => {
          if (!price) return '❌';
          return new Intl.NumberFormat('uz-UZ').format(Number(price));
        };

        await ctx.replyWithPhoto(s.image, {
          caption: `🏟 ${s.name}\n📍${this.i18n.translate('view.locate', { lang })} ${locationText} \n💵 ${this.i18n.translate('view.price', { lang })} ${formatPrice(s.price) || '❌'}`,
        });
      }
    } catch (error) {
      console.error(error);
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
}
