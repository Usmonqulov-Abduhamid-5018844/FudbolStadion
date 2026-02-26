import { Injectable } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { MyContext } from 'src/helpers/bot.sesion';
import { IStadion } from 'src/helpers/interface';
import { getDistance } from 'src/helpers/lokationSeorch';
import { getPaymentText } from 'src/helpers/peyments_type';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly botService: BotService,
    private readonly utils: UtilisService,
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
        case '3': {
          return this.userBooking(ctx, lang);
        }
        case '4': {
          return this.userBookingFanc(ctx, lang);
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
        case 'stadionNewBron': {
          return this.userBookingFanc(ctx, lang);
        }
        case 'stadionFavorite': {
          const lang = await this.utils.langs(ctx);
          const favorites = await this.prisma.myFavoriteStadium.findMany({
            where: { chat_id: String(ctx.from?.id) },
            include: {
              stadion: true,
            },
          });
          if (favorites.length) {
            favorites.forEach((i) => {
              this.stadionFavorite(ctx, lang, i.stadion);
            });
            return;
          } else {
            ctx.reply(
              this.i18n.translate('booking.stadion.noFavorites', { lang }),
            );
            return;
          }
        }
        default: {
          break;
        }
      }
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userHelp(ctx: MyContext, lang: string) {
    ctx.reply('Help');
  }
  async userBooking(ctx: MyContext, lang: string) {
    try {
      ctx.reply(this.i18n.translate('booking.stadion.menuTitle', { lang }), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: this.i18n.translate('booking.stadion.newBooking', {
                  lang,
                }),
                callback_data: 'user_stadionNewBron',
              },
            ],
            [
              {
                text: this.i18n.translate('booking.stadion.activeBookings', {
                  lang,
                }),
                callback_data: 'user_stadionBron',
              },
            ],
            [
              {
                text: this.i18n.translate('booking.stadion.history', { lang }),
                callback_data: 'user_stadionBronHistory',
              },
            ],
            [
              {
                text: this.i18n.translate('booking.stadion.favorites', {
                  lang,
                }),
                callback_data: 'user_stadionFavorite',
              },
            ],
            [
              {
                text: this.i18n.translate('booking.stadion.search', { lang }),
                callback_data: 'user_stadionSearch',
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
  async userbookingRegion(ctx: MyContext, lang: string, id: number) {
    try {
      const region_Item = await this.prisma.region_item.findMany({
        where: { region_id: id },
        include: {
          stadions: {
            where: { working_status: true },
            select: { id: true },
          },
        },
      });
      const avaylableItem = region_Item.filter((i) => i.stadions.length > 0);
      if (!avaylableItem.length) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const button: InlineKeyboardButton[][] = avaylableItem.map((r) => [
        {
          text: r.name,
          callback_data: `booking_regionItem_${r.id}`,
        },
      ]);
      button.push([
        {
          text: this.i18n.translate('schedule.back', { lang }),
          callback_data: 'back_user_4',
        },
      ]);
      await ctx.reply(
        this.i18n.translate('booking.stadion.selectRegion', { lang }),
        {
          reply_markup: { inline_keyboard: button },
        },
      );
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userbookingRegionItems(ctx: MyContext, lang: string, itemId: number) {
    try {
      const stadions = await this.prisma.stadion.findMany({
        where: { region_item_id: itemId, working_status: true },
      });
      if (!stadions.length) {
        await ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      stadions.forEach(async (stadions) => {
        await this.stadionAll_data(ctx, lang, stadions);
      });
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async userBookingFanc(ctx: MyContext, lang: string) {
    try {
      const stadions = await this.prisma.stadion.findMany({
        where: { working_status: true },
      });
      if (!stadions.length) {
        try {
          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('booking.stadion.notAvailable', { lang }),
            {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('schedule.back', {
                      lang,
                    }),
                    callback_data: 'back_user_3',
                  },
                ],
              ],
            },
          );
          return;
        } catch (error) {
          await ctx.reply(
            this.i18n.translate('booking.stadion.notAvailable', { lang }),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.back', {
                        lang,
                      }),
                      callback_data: 'back_user_3',
                    },
                  ],
                ],
              },
            },
          );
          return;
        }
      }
      const regionId = [...new Set(stadions.map((s) => s.region_id))];

      const regions = await this.prisma.region.findMany({
        where: { id: { in: regionId } },
      });
      const button: InlineKeyboardButton[][] = regions.map((r) => [
        { text: `${r.name}`, callback_data: `booking_region_${r.id}` },
      ]);
      button.push([
        {
          text: this.i18n.translate('schedule.back', { lang }),
          callback_data: 'back_user_3',
        },
      ]);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.availableRegions', { lang }),
        {
          inline_keyboard: button,
        },
      );
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async stadionAll_data(ctx: MyContext, lang: string, stadion: IStadion) {
    try {
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
${(this, this.i18n.translate('view.status', { lang }))} ${statusText}
${this.i18n.translate('view.creted', { lang })} ${createdAt}
${this.i18n.translate('view.update', { lang })} ${updatedAt}
`;

      const sendText = async () => {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.stadion.book', { lang }),
                  callback_data: `booking_stadion_${stadion.id}`,
                },
                {
                  text: this.i18n.translate('booking.stadion.favorite', {
                    lang,
                  }),
                  callback_data: `booking_save_${stadion.id}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('schedule.back'),
                  callback_data: JSON.stringify({
                    type: 'user_back_regionItems',
                    id: stadion.region_id,
                  }),
                },
              ],
            ],
          },
        });
      };

      if (stadion.image) {
        try {
          await ctx.replyWithPhoto(stadion.image, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.stadion.book', { lang }),
                    callback_data: `booking_stadion_${stadion.id}`,
                  },
                  {
                    text: this.i18n.translate('booking.stadion.favorite', {
                      lang,
                    }),
                    callback_data: `booking_save_${stadion.id}`,
                  },
                ],
                [
                  {
                    text: this.i18n.translate('schedule.back'),
                    callback_data: JSON.stringify({
                      type: 'user_back_regionItems',
                      id: stadion.region_id,
                    }),
                  },
                ],
              ],
            },
          });
        } catch (err) {
          await sendText();
        }
      } else {
        await sendText();
      }
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async userSaveFnc(ctx: MyContext, lang: string, stadionId: number) {
    try {
      const where = {
        chat_id_stadion_id: {
          chat_id: String(ctx.from?.id),
          stadion_id: stadionId,
        },
      };
      const data = await this.prisma.myFavoriteStadium.findUnique({ where });
      if (data) {
        await this.prisma.myFavoriteStadium.delete({ where });
        await ctx.reply(
          this.i18n.translate('booking.stadion.removedFromFavorites', { lang }),
        );
      } else {
        await this.prisma.myFavoriteStadium.create({
          data: { stadion_id: stadionId, chat_id: String(ctx.from?.id) },
        });
        await ctx.reply(
          this.i18n.translate('booking.stadion.addedToFavorites', { lang }),
        );
      }
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

  async stadionFavorite(ctx: MyContext, lang: string, stadion: IStadion) {
    try {
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
${(this, this.i18n.translate('view.status', { lang }))} ${statusText}
${this.i18n.translate('view.creted', { lang })} ${createdAt}
${this.i18n.translate('view.update', { lang })} ${updatedAt}
`;

      const sendText = async () => {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.stadion.book', { lang }),
                  callback_data: `booking_stadion_${stadion.id}`,
                },
                {
                  text: this.i18n.translate('schedule.back'),
                  callback_data: 'back_user_3',
                },
              ],
            ],
          },
        });
      };

      if (stadion.image) {
        try {
          await ctx.replyWithPhoto(stadion.image, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.stadion.book', { lang }),
                    callback_data: `booking_stadion_${stadion.id}`,
                  },
                  {
                    text: this.i18n.translate('schedule.back'),
                    callback_data: 'back_user_3',
                  },
                ],
              ],
            },
          });
        } catch (err) {
          await sendText();
        }
      } else {
        await sendText();
      }
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async userbookingStadion(ctx: MyContext, lang: string, stadionId: number) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!stadion) {
        await ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const schedule = await this.prisma.stadion_chedule.findMany({
        where: { stadion_id: stadionId },
      });

      if (!schedule.length) {
        await ctx.reply(
          this.i18n.translate('booking.stadion.noWorkingHours', { lang }),
        );
        return;
      }
      const offDays = await this.prisma.stadion_off_days.findMany({
        where: { stadion_id: stadionId },
      });
      const specialDays = await this.prisma.stadion_special_schedule.findMany({
        where: { stadion_id: stadionId },
      });

      const tz = 'Asia/Tashkent';
      const now = toZonedTime(new Date(), tz);

      const buttons = schedule.map((s) => {
        const dayOfWeek = s.day_of_week;
        const currentDay = now.getDay() === 0 ? 7 : now.getDay();

        let diffDays = dayOfWeek - currentDay;
        if (diffDays < 0) diffDays += 7;

        const date = new Date(now);
        date.setDate(now.getDate() + diffDays);
        const day = format(date, 'd', { timeZone: tz });
        const monthNumber = date.getMonth() + 1;
        const monthText = this.i18n.translate(
          `schedule.months.${monthNumber}`,
          { lang },
        );

        const weekDayText = this.i18n.translate(
          `schedule.week_days.${dayOfWeek}`,
          { lang },
        );
        const special = specialDays.find((d) => {
          const specialDate = toZonedTime(new Date(d.date), tz);
          return (
            format(specialDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
          );
        });
        if (special) {
          return [
            {
              text: `⭐ ${day} - ${monthText}. ${weekDayText} || ${special.start_time} - ${special.end_time}`,
              callback_data: `booking_special_${special.id}`,
            },
          ];
        }

        const isOffDay = offDays.some((d) => {
          const offDate = toZonedTime(new Date(d.date), tz);
          return format(offDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        });
        if (isOffDay) {
          return [
            {
              text: `❌ ${day} - ${monthText}. ${weekDayText} || ${s.start_time} - ${s.end_time}`,
              callback_data: 'user_offday',
            },
          ];
        }

        return [
          {
            text: `${day} - ${monthText}. ${weekDayText} || ${s.start_time} - ${s.end_time}`,
            callback_data: `booking_schedule_${day}_${monthNumber}_${s.id}`,
          },
        ];
      });
      buttons.push([
        {
          text: this.i18n.translate('schedule.back', { lang }),
          callback_data: JSON.stringify({
            type: 'Continue_back_stadion',
            id: stadion.region_item_id,
          }),
        },
      ]);
      await ctx.reply(
        this.i18n.translate('booking.stadion.selectDate', { lang }),
        {
          reply_markup: { inline_keyboard: buttons },
        },
      );
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async userbookingStadionBack(
    ctx: MyContext,
    lang: string,
    stadionId: number,
  ) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });
      if (!stadion) {
        await ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const schedule = await this.prisma.stadion_chedule.findMany({
        where: { stadion_id: stadionId },
      });

      if (!schedule.length) {
        await ctx.reply(
          this.i18n.translate('booking.stadion.noWorkingHours', { lang }),
        );
        return;
      }
      const offDays = await this.prisma.stadion_off_days.findMany({
        where: { stadion_id: stadionId },
      });
      const specialDays = await this.prisma.stadion_special_schedule.findMany({
        where: { stadion_id: stadionId },
      });

      const tz = 'Asia/Tashkent';
      const now = toZonedTime(new Date(), tz);

      const buttons = schedule.map((s) => {
        const dayOfWeek = s.day_of_week;
        const currentDay = now.getDay() === 0 ? 7 : now.getDay();

        let diffDays = dayOfWeek - currentDay;
        if (diffDays < 0) diffDays += 7;

        const date = new Date(now);
        date.setDate(now.getDate() + diffDays);
        const day = format(date, 'd', { timeZone: tz });
        const monthNumber = date.getMonth() + 1;
        const monthText = this.i18n.translate(
          `schedule.months.${monthNumber}`,
          { lang },
        );

        const weekDayText = this.i18n.translate(
          `schedule.week_days.${dayOfWeek}`,
          { lang },
        );
        const special = specialDays.find((d) => {
          const specialDate = toZonedTime(new Date(d.date), tz);
          return (
            format(specialDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
          );
        });
        if (special) {
          return [
            {
              text: `⭐ ${day} - ${monthText}. ${weekDayText} || ${special.start_time} - ${special.end_time}`,
              callback_data: `booking_special_${special.id}`,
            },
          ];
        }

        const isOffDay = offDays.some((d) => {
          const offDate = toZonedTime(new Date(d.date), tz);
          return format(offDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        });
        if (isOffDay) {
          return [
            {
              text: `❌ ${day} - ${monthText}. ${weekDayText} || ${s.start_time} - ${s.end_time}`,
              callback_data: 'user_offday',
            },
          ];
        }

        return [
          {
            text: `${day} - ${monthText}. ${weekDayText} || ${s.start_time} - ${s.end_time}`,
            callback_data: `booking_schedule_${day}_${monthNumber}_${s.id}`,
          },
        ];
      });
      buttons.push([
        {
          text: this.i18n.translate('schedule.back', { lang }),
          callback_data: JSON.stringify({
            type: 'Continue_back_stadion',
            id: stadion.region_item_id,
          }),
        },
      ]);
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.selectDate', { lang }),
        {
          inline_keyboard: buttons,
        },
      );
    } catch (error) {
      await ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async special(ctx: MyContext, lang: string, specialId: number) {
    try {
      ctx.reply('special');
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
  async bookingSchedule_start(
    ctx: MyContext,
    day: string,
    monthNumber: string,
    scheduleId: number,
    lang: string,
  ) {
    try {
      const scheduleDate = await this.prisma.stadion_chedule.findUnique({
        where: { id: scheduleId },
      });
      if (!scheduleDate) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;

      const tz = 'Asia/Tashkent';
      const year = new Date().getFullYear();
      const startString = `${year}-${monthNumber
        .toString()
        .padStart(2, '0')}-${day.toString().padStart(2, '0')} 00:00:00`;
      const endString = `${year}-${monthNumber
        .toString()
        .padStart(2, '0')}-${day.toString().padStart(2, '0')} 23:59:59`;
      const startOfDay = fromZonedTime(startString, tz);
      const endOfDay = fromZonedTime(endString, tz);

      const allSlots = await this.utils.generateSlots(
        scheduleDate.start_time,
        scheduleDate.end_time,
      );

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: scheduleDate.stadion_id,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (bookings.length) {
        const freeSlots = allSlots.filter((slot) =>
          this.utils.isSlotFree(slot, bookings),
        );
        if (freeSlots.length) {
          for (let i = 0; i < freeSlots.length; i += slotsPerKeyboard) {
            const row: InlineKeyboardButton[] = [];
            for (let j = 0; j < slotsPerKeyboard; j++) {
              if (freeSlots[i + j]) {
                row.push({
                  text: freeSlots[i + j].start,
                  callback_data: `booking_timeStart_${freeSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('booking.back', { lang }),
              callback_data: `booking_back_${scheduleDate.stadion_id}`,
            },
          ]);
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
          } catch (error) {
            await ctx.reply(
              this.i18n.translate('booking.no_free_slots', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `booking_back_${scheduleDate.stadion_id}`,
                      },
                    ],
                  ],
                },
              },
            );
          }
        }
      } else {
        for (let i = 0; i < allSlots.length; i += slotsPerKeyboard) {
          const row: InlineKeyboardButton[] = [];
          for (let j = 0; j < slotsPerKeyboard; j++) {
            if (allSlots[i + j]) {
              row.push({
                text: allSlots[i + j].start,
                callback_data: `booking_timeStart_${allSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_back_${scheduleDate.stadion_id}`,
          },
        ]);
      }
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.selectTime', { lang }),
        {
          inline_keyboard: button,
        },
      );
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  async bookingSchedule_end(
    ctx: MyContext,
    start_time: string,
    scheduleId: number,
    day: number,
    monthNumber: number,
    lang: string,
  ) {
    try {
      const scheduleDate = await this.prisma.stadion_chedule.findUnique({
        where: { id: scheduleId },
      });
      if (!scheduleDate) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;

      const tz = 'Asia/Tashkent';
      const year = new Date().getFullYear();
      const startString = `${year}-${monthNumber
        .toString()
        .padStart(2, '0')}-${day.toString().padStart(2, '0')} 00:00:00`;
      const endString = `${year}-${monthNumber
        .toString()
        .padStart(2, '0')}-${day.toString().padStart(2, '0')} 23:59:59`;
      const startOfDay = fromZonedTime(startString, tz);
      const endOfDay = fromZonedTime(endString, tz);

      const allSlots = await this.utils.generateSlots(
        start_time,
        scheduleDate.end_time,
      );

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: scheduleDate.stadion_id,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (bookings.length) {
        const freeSlots = allSlots.filter((slot) =>
          this.utils.isSlotFree(slot, bookings),
        );
        if (freeSlots.length) {
          for (let i = 0; i < freeSlots.length; i += slotsPerKeyboard) {
            const row: InlineKeyboardButton[] = [];
            for (let j = 0; j < slotsPerKeyboard; j++) {
              if (freeSlots[i + j]) {
                row.push({
                  text: freeSlots[i + j].end,
                  callback_data: `booking_timeEnd_${start_time}_${freeSlots[i + j].end}_${day}_${monthNumber}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('booking.back', { lang }),
              callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}`,
            },
          ]);
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
          } catch (error) {
            await ctx.reply(
              this.i18n.translate('booking.no_free_slots', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}`,
                      },
                    ],
                  ],
                },
              },
            );
          }
        }
      } else {
        for (let i = 0; i < allSlots.length; i += slotsPerKeyboard) {
          const row: InlineKeyboardButton[] = [];
          for (let j = 0; j < slotsPerKeyboard; j++) {
            if (allSlots[i + j]) {
              row.push({
                text: allSlots[i + j].end,
                callback_data: `booking_timeEnd_${start_time}_${allSlots[i + j].end}_${day}_${monthNumber}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}`,
          },
        ]);
      }
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.selectEndTime', { lang }),
        {
          inline_keyboard: button,
        },
      );
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }

  
  async bookingScheduleFinish(
    ctx: MyContext,
    start_time: string,
    end_time: string,
    day: string,
    monthNumber: string,
    lang: string,
  ) {
    ctx.reply(`finish ${start_time}, ${end_time}, ${day}, ${monthNumber}`);
  }
}
