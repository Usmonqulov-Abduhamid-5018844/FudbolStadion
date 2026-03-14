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
import { toZonedTime, format } from 'date-fns-tz';
import { Decimal } from '@prisma/client/runtime/library';
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

  async userSwitch(
    ctx: MyContext,
    data: string,
    lang: string,
    page: number = 1,
  ) {
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
            if (ctx.callbackQuery) {
              try {
                ctx.answerCbQuery();
              } catch (error) {}
            }
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
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
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
            if (ctx.callbackQuery) {
              try {
                ctx.answerCbQuery();
              } catch (error) {}
            }
            ctx.session.user_registor.phone = 'phone';
            ctx.reply(this.i18n.translate('registor.phone', { lang }));
          }
          break;
        case 'stadionNewBron': {
          return this.userBookingFanc(ctx, lang);
        }
        case 'stadionBron':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            ctx.reply('Tez Kunda Foal bronlar');
          }
          break;
        case 'stadionBronHistory':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            try {
              const user = await this.prisma.users.findUnique({
                where: { chatID: String(ctx.from?.id) },
              });
              if (!user) {
                await this.utils.errorFunction(ctx);
                return;
              }
              const limit = 4;
              const [booking, total] = await Promise.all([
                this.prisma.booking.findMany({
                  where: {
                    user_id: user.id,
                    status: {
                      in: ['COMPLETED', 'NO_SHOW', 'CANCELED', 'REFUNDED'],
                    },
                  },
                  include: {
                    stadion: {
                      select: {
                        id: true,
                        name: true,
                        longitude: true,
                        latitude: true,
                      },
                    },
                  },
                  skip: (page - 1) * limit,
                  take: limit,
                }),
                this.prisma.booking.count({
                  where: {
                    user_id: user.id,
                    status: {
                      in: ['COMPLETED', 'NO_SHOW', 'CANCELED', 'REFUNDED'],
                    },
                  },
                }),
              ]);
              if (!total) {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate("stadions.booking_history_empty",{lang}),
                  {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_3',
                        },
                      ],
                    ],
                  },
                );
                return;
              }
              let message = `📜 Bronlar tarixi:\n\n`;

              const statusMap = {
                COMPLETED: '✅ COMPLETED',
                NO_SHOW: '🚫 NO_SHOW',
                CANCELED: '❌ CANCELED',
                REFUNDED: '💸 REFUNDED',
              };
              const formatPrice = (price?: number | string | Decimal) => {
                if (!price) return '❌';
                return new Intl.NumberFormat('uz-UZ').format(Number(price));
              };
              for (const item of booking) {
                let locationText = `<a href="https://www.google.com/maps/search/?api=1&query=${item.stadion.latitude},${item.stadion.longitude}">Ko'rish</a>`;
                message += `🆔 Bron ID: ${item.id}\n
⚽ Stadion: ${item.stadion.name}\n
📅 Sana: ${format(item.date, 'dd.MM.yyyy')}\n
⏰ Vaqt: ${item.start_time} - ${item.end_time.toLocaleString()}\n
💰 Narx: ${formatPrice(item.total_price)} so‘m\n
📊 Status: ${statusMap[item.status]}\n
📍 Manzil: ${locationText}

━━━━━━━━━━━━━━━━━━━━

`;
              }
              const buuton: InlineKeyboardButton[] = [];
              const totalPages = Math.ceil(total / limit);
              if (page === 1 && totalPages === 1) {
              } else {
                if (page > 1) {
                  buuton.push({
                    text: this.i18n.translate('stadions.Previous', { lang }),
                    callback_data: `booking_region_page_stadionBronHistory_${page - 1}`,
                  });
                }
                buuton.push({
                  text: `${page} / ${totalPages}`,
                  callback_data: 'ignore',
                });
                if (page < totalPages) {
                  buuton.push({
                    text: this.i18n.translate('stadions.Next', { lang }),
                    callback_data: `booking_region_page_stadionBronHistory_${page + 1}`,
                  });
                }
              }

              const send = await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    buuton,
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_user_3',
                      },
                    ],
                  ],
                },
              });
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }
          break;
        case 'stadionFavorite':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            const limit = 4;
            const [favorites, total] = await Promise.all([
              this.prisma.myFavoriteStadium.findMany({
                where: { chat_id: String(ctx.from?.id) },
                include: {
                  stadion: true,
                },
                skip: (page - 1) * limit,
                take: limit,
              }),
              this.prisma.myFavoriteStadium.count({
                where: { chat_id: String(ctx.from?.id) },
              }),
            ]);
            if (!favorites.length) {
              await ctx.reply(
                this.i18n.translate('booking.stadion.noFavorites', { lang }),
              );
              return;
            }
            for (const favorite of favorites) {
              await this.stadionFavorite(ctx, lang, favorite.stadion);
            }
            const totalPages = Math.ceil(total / limit);
            if (page === 1 && totalPages === 1) {
              return;
            }
            const row: InlineKeyboardButton[] = [];
            if (page > 1) {
              row.push({
                text: this.i18n.translate('stadions.Previous', { lang }),
                callback_data: `booking_region_page_favorit_${page - 1}`,
              });
            }
            row.push({
              text: `${page} / ${totalPages}`,
              callback_data: 'ignore',
            });
            if (page < totalPages) {
              row.push({
                text: this.i18n.translate('stadions.Next', { lang }),
                callback_data: `booking_region_page_favorit_${page + 1}`,
              });
            }
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('stadions.Select', { lang }),
              {
                inline_keyboard: [row],
              },
            );
          }
          break;
        case 'stadionSearch':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            ctx.reply('Tez kunda Seorch');
          }
          break;
        default: {
          break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  async userHelp(ctx: MyContext, lang: string) {
    ctx.reply('Help');
  }
  async userBooking(ctx: MyContext, lang: string) {
    try {
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.menuTitle', { lang }),
        {
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
                text: this.i18n.translate('booking.stadion.history', {
                  lang,
                }),
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
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
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
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('booking.stadion.selectRegion', { lang }),
        { inline_keyboard: button },
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }
  async userbookingRegionItems(
    ctx: MyContext,
    lang: string,
    itemId: number,
    page: number = 1,
  ) {
    try {
      const limit = 4;
      const [stadions, total] = await Promise.all([
        this.prisma.stadion.findMany({
          where: { region_item_id: itemId, working_status: true },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.stadion.count({
          where: { region_item_id: itemId, working_status: true },
        }),
      ]);

      if (!stadions.length) {
        await ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      for (const stadion of stadions) {
        await this.stadionAll_data(ctx, lang, stadion);
      }

      const totalPages = Math.ceil(total / limit);

      if (page === 1 && totalPages === 1) {
        return;
      }

      const row: InlineKeyboardButton[] = [];

      if (page > 1) {
        row.push({
          text: this.i18n.translate('stadions.Previous', { lang }),
          callback_data: `booking_region_page_${itemId}_${page - 1}`,
        });
      }

      row.push({
        text: `${page} / ${totalPages}`,
        callback_data: 'ignore',
      });

      if (page < totalPages) {
        row.push({
          text: this.i18n.translate('stadions.Next', { lang }),
          callback_data: `booking_region_page_${itemId}_${page + 1}`,
        });
      }
      await this.utils.safeEditOrReply(
        ctx,
        this.i18n.translate('stadions.Select', { lang }),
        {
          inline_keyboard: [row],
        },
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
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
${this.i18n.translate('view.count', { lang })} <b>${stadion.max_count || this.i18n.translate('view.not', { lang })}</b>
${this.i18n.translate('view.size', { lang })} <b>${stadion.length || '❌'} x ${stadion.width || '❌'}</b>
${this.i18n.translate('view.price', { lang })} <b>${formatPrice(stadion.price) || '❌'}</b>
${this.i18n.translate('view.peyments', { lang })} ${getPaymentText(stadion.payments_type, String(lang), this.i18n.translate('peyments', { lang }))}
${this.i18n.translate('view.phone', { lang })} ${owner?.phone}
${this.i18n.translate('view.premium', { lang })} <b>${stadion.is_premium ? this.i18n.translate('view.yes', { lang }) : this.i18n.translate('view.no', { lang })}</b>
${(this, this.i18n.translate('view.status', { lang }))} <b>${statusText}</b>
${this.i18n.translate('view.creted', { lang })} <b>${createdAt}</b>
${this.i18n.translate('view.update', { lang })} <b>${updatedAt}</b>
`;

      const sendText = async () => {
        const send = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.stadion.favorite', {
                    lang,
                  }),
                  callback_data: `booking_save_${stadion.id}`,
                },
              ],
              [
                {
                  text: this.i18n.translate('booking.stadion.book', { lang }),
                  callback_data: `booking_stadion_${stadion.id}`,
                },
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
        if (!ctx.session.stadionMessages) {
          ctx.session.stadionMessages = [];
        }
        ctx.session.stadionMessages.push(send.message_id);
      };

      if (stadion.image) {
        try {
          const send = await ctx.replyWithPhoto(stadion.image, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.stadion.favorite', {
                      lang,
                    }),
                    callback_data: `booking_save_${stadion.id}`,
                  },
                ],
                [
                  {
                    text: this.i18n.translate('booking.stadion.book', { lang }),
                    callback_data: `booking_stadion_${stadion.id}`,
                  },
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
          if (!ctx.session.stadionMessages) {
            ctx.session.stadionMessages = [];
          }
          ctx.session.stadionMessages.push(send.message_id);
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
      this.utils.errorFunction(ctx);
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
        const send = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.stadion.delete_favorite', {
                    lang,
                  }),
                  callback_data: `delete_stadion_fovorite_${stadion.id}`,
                },
              ],
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
        if (!ctx.session.stadionFavoritMessages) {
          ctx.session.stadionFavoritMessages = [];
        }
        ctx.session.stadionFavoritMessages.push(send.message_id);
      };

      if (stadion.image) {
        try {
          const send = await ctx.replyWithPhoto(stadion.image, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate(
                      'booking.stadion.delete_favorite',
                      {
                        lang,
                      },
                    ),
                    callback_data: `delete_stadion_fovorite_${stadion.id}`,
                  },
                ],
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
          if (!ctx.session.stadionFavoritMessages) {
            ctx.session.stadionFavoritMessages = [];
          }
          ctx.session.stadionFavoritMessages.push(send.message_id);
        } catch (err) {
          await sendText();
        }
      } else {
        await sendText();
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  async userbookingStadion(ctx: MyContext, lang: string, stadionId: number) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
      });

      if (!stadion) {
        return this.utils.errorFunction(ctx);
      }

      const [schedule, offDays, specialDays] = await Promise.all([
        this.prisma.stadion_chedule.findMany({
          where: { stadion_id: stadionId },
        }),
        this.prisma.stadion_off_days.findMany({
          where: { stadion_id: stadionId },
        }),
        this.prisma.stadion_special_schedule.findMany({
          where: { stadion_id: stadionId },
        }),
      ]);

      if (!schedule.length) {
        ctx.reply(
          this.i18n.translate('booking.stadion.noWorkingHours', { lang }),
        );
        return;
      }

      const tz = 'Asia/Tashkent';
      const now = toZonedTime(new Date(), tz);

      const todayStr = format(now, 'yyyy-MM-dd');
      const tomorrowStr = format(
        new Date(now.getTime() + 86400000),
        'yyyy-MM-dd',
      );

      const offSet = new Set(
        offDays.map((d) =>
          format(toZonedTime(new Date(d.date), tz), 'yyyy-MM-dd'),
        ),
      );

      const specialMap = new Map(
        specialDays.map((d) => [
          format(toZonedTime(new Date(d.date), tz), 'yyyy-MM-dd'),
          d,
        ]),
      );

      const buttons = schedule.map((s) => {
        const dayOfWeek = s.day_of_week;
        const currentDay = now.getDay() === 0 ? 7 : now.getDay();

        let diff = dayOfWeek - currentDay;
        if (diff < 0) diff += 7;

        const date = new Date(now);
        date.setDate(now.getDate() + diff);

        const dateStr = format(date, 'yyyy-MM-dd');

        const day = format(date, 'd');
        const monthNumber = date.getMonth() + 1;

        const monthText = this.i18n.translate(
          `schedule.months.${monthNumber}`,
          { lang },
        );

        const weekDayText = this.i18n.translate(
          `schedule.week_days.${dayOfWeek}`,
          { lang },
        );

        let dateLabel = `${day} - ${monthText}. ${weekDayText}`;

        if (dateStr === todayStr) {
          dateLabel = `${this.i18n.translate('schedule.today', { lang })}. ${weekDayText}`;
        }

        if (dateStr === tomorrowStr) {
          dateLabel = `${this.i18n.translate('schedule.tomorrow', { lang })}. ${weekDayText}`;
        }

        const special = specialMap.get(dateStr);

        if (special) {
          return [
            {
              text: `⭐ ${dateLabel} || ${special.start_time} - ${special.end_time}`,
              callback_data: `booking_special_${special.id}`,
            },
          ];
        }

        if (offSet.has(dateStr)) {
          return [
            {
              text: `🔒 ${dateLabel} || ${s.start_time} - ${s.end_time}`,
              callback_data: `user_offday`,
            },
          ];
        }

        return [
          {
            text: `📅 ${dateLabel} || ${s.start_time} - ${s.end_time}`,
            callback_data: `booking_schedule_${date.getFullYear()}_${day}_${monthNumber}_${s.id}`,
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
        { inline_keyboard: buttons },
      );
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }
  async special(ctx: MyContext, lang: string, specialId: number) {
    try {
      const special = await this.prisma.stadion_special_schedule.findUnique({
        where: { id: specialId },
      });
      if (!special) {
        this.utils.errorFunction(ctx);
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;

      const tzOffset = 5 * 60;
      const now = new Date();
      const tzNow = new Date(
        now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000,
      );
      let scheduleStart = special.start_time;
      const time = this.utils.roundUpToNextHour(tzNow);
      const currentTime = time.toTimeString().slice(0, 5);

      if (
        special.date.getFullYear() === tzNow.getFullYear() &&
        special.date.getMonth() === tzNow.getMonth() &&
        special.date.getDate() === tzNow.getDate()
      ) {
        if (currentTime > scheduleStart) {
          scheduleStart = currentTime;
        }
      }
      const allSlots = await this.utils.generateSlots(
        scheduleStart,
        special.end_time,
      );
      const startOfDay = new Date(
        special.date.getFullYear(),
        special.date.getMonth() + 1,
        special.date.getDate(),
      );
      console.log(startOfDay);

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: special.stadion_id,
          date: startOfDay,
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
                  callback_data: `booking_special_${freeSlots[i + j].start}_${special.id}`,
                });
              }
            }
            button.push(row);
          }
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
            return;
          } catch (error) {
            await ctx.reply(
              this.i18n.translate('booking.no_free_slots', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `booking_back_${special.stadion_id}`,
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
                callback_data: `booking_special_${allSlots[i + j].start}_${special.id}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_back_${special.stadion_id}`,
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
      await this.utils.errorFunction(ctx);
    }
  }
  async userbookingSpecialEnd(
    ctx: MyContext,
    lang: string,
    specilId: number,
    start_time: string,
  ) {
    try {
      const special = await this.prisma.stadion_special_schedule.findUnique({
        where: { id: specilId },
      });
      if (!special) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;
      const allSlots = await this.utils.generateSlots(
        start_time,
        special.end_time,
      );
      const startOfDay = new Date(
        special.date.getFullYear(),
        special.date.getMonth() + 1,
        special.date.getDate(),
      );
      console.log(startOfDay);

      const booking = await this.prisma.booking.findMany({
        where: {
          stadion_id: special.stadion_id,
          date: startOfDay,
        },
      });
      if (booking.length) {
        const freeSlots = allSlots.filter((slot) =>
          this.utils.isSlotFree(slot, booking),
        );
        if (freeSlots.length) {
          for (let i = 0; i < freeSlots.length; i += slotsPerKeyboard) {
            const row: InlineKeyboardButton[] = [];
            for (let j = 0; j < slotsPerKeyboard; j++) {
              if (freeSlots[i + j]) {
                row.push({
                  text: freeSlots[i + j].end,
                  callback_data: `booking_specialEnd_${start_time}_${freeSlots[i + j].end}_${special.stadion_id}_${special.date.getFullYear()}_${special.date.getMonth() + 1}_${special.date.getDate()}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `booking_specialBack_${special.id}`,
            },
          ]);
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
            return;
          } catch (error) {
            await ctx.reply(
              this.i18n.translate('booking.no_free_slots', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `booking_specialBack_${special.id}`,
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
                callback_data: `booking_specialEnd_${start_time}_${allSlots[i + j].end}_${special.stadion_id}_${special.date.getFullYear()}_${special.date.getMonth() + 1}_${special.date.getDate()}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_specialBack_${special.id}`,
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
      await this.utils.errorFunction(ctx);
    }
  }

  async bookingSchedule_start(
    ctx: MyContext,
    years: string,
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
        this.utils.errorFunction(ctx);
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;

      const tz = 'Asia/Tashkent';
      const year = new Date().getFullYear();
      const tzOffset = 5 * 60;

      const startOfDay = new Date(
        Date.UTC(year, Number(monthNumber) - 1, Number(day)),
      );

      const now = new Date();
      const tzNow = new Date(
        now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000,
      );

      let scheduleStart = scheduleDate.start_time;

      const time = this.utils.roundUpToNextHour(tzNow);
      const currentTime = time.toTimeString().slice(0, 5);

      if (
        startOfDay.getFullYear() === tzNow.getFullYear() &&
        startOfDay.getMonth() === tzNow.getMonth() &&
        startOfDay.getDate() === tzNow.getDate()
      ) {
        if (currentTime > scheduleStart) {
          scheduleStart = currentTime;
        }
      }

      const allSlots = await this.utils.generateSlots(
        scheduleStart,
        scheduleDate.end_time,
      );

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: scheduleDate.stadion_id,
          date: startOfDay,
        },
      });

      if (bookings.length) {
        const freeSlots = allSlots.filter((slot) => {
          return this.utils.isSlotFree(slot, bookings);
        });

        if (freeSlots.length) {
          for (let i = 0; i < freeSlots.length; i += slotsPerKeyboard) {
            const row: InlineKeyboardButton[] = [];
            for (let j = 0; j < slotsPerKeyboard; j++) {
              if (freeSlots[i + j]) {
                row.push({
                  text: freeSlots[i + j].start,
                  callback_data: `booking_timeStart_${freeSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}_${years}`,
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
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
            return;
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
                callback_data: `booking_timeStart_${allSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}_${years}`,
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
      this.utils.errorFunction(ctx);
      console.log(error);
    }
  }

  async bookingSchedule_end(
    ctx: MyContext,
    years: string,
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
        this.utils.errorFunction(ctx);
        return;
      }
      const button: InlineKeyboardButton[][] = [];
      const slotsPerKeyboard = 2;

      const tz = 'Asia/Tashkent';
      const year = new Date().getFullYear();

      const startOfDay = new Date(
        Date.UTC(year, Number(monthNumber) - 1, Number(day)),
      );

      const allSlots = await this.utils.generateSlots(
        start_time,
        scheduleDate.end_time,
      );

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: scheduleDate.stadion_id,
          date: startOfDay,
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
                  callback_data: `booking_timeEnd_${start_time}_${freeSlots[i + j].end}_${day}_${monthNumber}_${scheduleDate.stadion_id}_${years}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}`,
            },
          ]);
        } else {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.no_free_slots', { lang }),
              { show_alert: true },
            );
            return;
          } catch (error) {
            await ctx.reply(
              this.i18n.translate('booking.no_free_slots', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}`,
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
                callback_data: `booking_timeEnd_${start_time}_${allSlots[i + j].end}_${day}_${monthNumber}_${scheduleDate.stadion_id}_${years}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}`,
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
      this.utils.errorFunction(ctx);
    }
  }

  async bookingScheduleFinish(
    ctx: MyContext,
    start_time: string,
    end_time: string,
    date: Date,
    lang: string,
    stadionId: number,
  ) {
    try {
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: {
            include: {
              ownerCard: { select: { id: true } },
            },
          },
        },
      });
      if (!stadion) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const cardId = stadion?.owner?.ownerCard?.id;
      const hasCard = !!cardId;

      const user = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!user) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const noshowCount = await this.prisma.booking.count({
        where: { user_id: user?.id, stadion_id: stadion.id, status: 'NO_SHOW' },
      });

      if (stadion.payments_type === 'CARD') {
        if (!hasCard) {
          await this.utils.errorFunction(ctx);
          return;
        }
        const { penalty, total, hors } = this.utils.calculateTotalPrice(
          start_time,
          end_time,
          stadion.price,
          noshowCount,
        );
        let warning = '';
        if (noshowCount === 1) {
          warning = this.i18n.translate('booking.no_show_warning', { lang });
        } else if (noshowCount >= 2) {
          warning = this.i18n.translate('booking.penalty', { lang });
        }
        const booking = await this.prisma.booking.create({
          data: {
            stadion_id: stadion.id,
            user_id: user.id,
            date: date,
            start_time,
            end_time,
            total_price: total,
            payment_method: 'CARD',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        const transaction = await this.prisma.tranzaktion.create({
          data: {
            user_id: booking.user_id,
            booking_id: booking.id,
            systeam_fee: 0,
            owner_amount: total,
            provider: 'Click',
            provider_transactionId: '',
            status: 'PENDING',
            owner_card_id: cardId,
            amount_received: 0,
          },
        });
        const days = format(date, 'dd.MM.yyyy');

        const paymentTextMap = {
          CARD: this.i18n.translate('peyments.card', { lang }),
          CASH: this.i18n.translate('peyments.cash', { lang }),
        };
        const paymentMethodText = paymentTextMap['CARD'] || 'CARD';

        const clickUrl = `https://my.click.uz/pay?merchant_id=${process.env.CLICK_MERCHANT_ID}&amount=${total}&transaction_id=${transaction.id}&callback_url=${encodeURIComponent('https://your-server.com/click-webhook')}`;

        const message = this.i18n.translate('booking.message_template', {
          lang,
          args: {
            warning,
            date: days,
            start_time,
            end_time,
            hours: hors,
            total: total.toLocaleString(),
            payment_method: paymentMethodText,
            penalty_block:
              penalty > 0
                ? this.i18n.translate('booking.penalty_block', {
                    lang,
                    args: { penalty: penalty.toLocaleString() },
                  })
                : '',
          },
        });
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.pay_by_card', { lang }),
                  url: clickUrl,
                },
              ],
              [
                {
                  text: this.i18n.translate('booking.cancel', { lang }),
                  callback_data: `booking_confirm_no_${booking.id}`,
                },
              ],
            ],
          },
        });
      } else if (stadion.payments_type === 'CASH') {
        const { price, penalty, total, hors } = this.utils.calculateTotalPrice(
          start_time,
          end_time,
          stadion.price,
          noshowCount,
        );

        const days = format(date, 'dd.MM.yyyy');
        const paymentTextMap = {
          CARD: this.i18n.translate('peyments.card', { lang }),
          CASH: this.i18n.translate('peyments.cash', { lang }),
        };

        const paymentMethodText = paymentTextMap['CASH'] || 'CASH';

        let warning = '';

        if (noshowCount === 1) {
          warning = this.i18n.translate('booking.no_show_warning', { lang });
        } else if (noshowCount >= 2) {
          warning = this.i18n.translate('booking.penalty', { lang });
        }

        const message = this.i18n.translate('booking.booking_confirm', {
          lang,
          args: {
            warning,
            date: days,
            start_time,
            end_time,
            hours: hors,
            total: total.toLocaleString(),
            payment_method: paymentMethodText,
            penalty_block:
              penalty > 0
                ? this.i18n.translate('booking.penalty_block', {
                    lang,
                    args: { penalty: penalty.toLocaleString() },
                  })
                : '',
          },
        });
        const booking = await this.prisma.booking.create({
          data: {
            stadion_id: stadion.id,
            user_id: user.id,
            date: date,
            start_time,
            end_time,
            total_price: total,
            payment_method: 'CASH',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: this.i18n.translate('booking.confirm', { lang }),
                  callback_data: `booking_confirm_yes_${booking.id}`,
                },
                {
                  text: this.i18n.translate('booking.cancel', { lang }),
                  callback_data: `booking_confirm_no_${booking.id}`,
                },
              ],
            ],
          },
        });
      } else if (stadion.payments_type === 'GIBRID') {
        const { price, penalty, hors, total } = this.utils.calculateTotalPrice(
          start_time,
          end_time,
          stadion.price,
          noshowCount,
        );
        const paymentTextMap = {
          CARD: this.i18n.translate('peyments.card', { lang }),
          CASH: this.i18n.translate('peyments.cash', { lang }),
        };
        const days = format(date, 'dd.MM.yyyy');
        if (noshowCount >= 2 && hasCard) {
          const booking = await this.prisma.booking.create({
            data: {
              stadion_id: stadion.id,
              user_id: user.id,
              date: date,
              start_time,
              end_time,
              total_price: total,
              payment_method: 'CARD',
              expires_at: new Date(Date.now() + 15 * 60 * 1000),
            },
          });
          const transaction = await this.prisma.tranzaktion.create({
            data: {
              user_id: booking.user_id,
              booking_id: booking.id,
              systeam_fee: 0,
              owner_amount: total,
              provider: 'Click',
              provider_transactionId: '',
              status: 'PENDING',
              owner_card_id: cardId,
              amount_received: 0,
            },
          });
          const paymentMethodText = paymentTextMap['CARD'] || 'CARD';

          const clickUrl = `https://my.click.uz/pay?merchant_id=${process.env.CLICK_MERCHANT_ID}&amount=${total}&transaction_id=${transaction.id}&callback_url=${encodeURIComponent('https://your-server.com/click-webhook')}`;
          const warning = this.i18n.translate('booking.warning', { lang });

          const message = this.i18n.translate('booking.message_template', {
            lang,
            args: {
              warning,
              date: days,
              start_time,
              end_time,
              hours: hors,
              total: total.toLocaleString(),
              payment_method: paymentMethodText,
              penalty_block:
                penalty > 0
                  ? this.i18n.translate('booking.penalty_block', {
                      lang,
                      args: { penalty: penalty.toLocaleString() },
                    })
                  : '',
            },
          });
          await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.pay_by_card', { lang }),
                    url: clickUrl,
                  },
                ],
                [
                  {
                    text: this.i18n.translate('booking.cancel', { lang }),
                    callback_data: `booking_confirm_no_${booking.id}`,
                  },
                ],
              ],
            },
          });
        } else if (noshowCount >= 2) {
          const paymentMethodText = paymentTextMap['CASH'] || 'CASH';

          const warning = this.i18n.translate(
            'booking.booking_penalty_notice.warning',
            { lang },
          );

          const message = this.i18n.translate(
            'booking.booking_penalty_notice.message_template',
            {
              lang,
              args: {
                warning,
                date: days,
                start_time,
                end_time,
                hours: hors,
                total: total.toLocaleString(),
                payment_method: paymentMethodText,
                penalty_block:
                  penalty > 0
                    ? this.i18n.translate('booking.penalty_block', {
                        lang,
                        args: { penalty: penalty.toLocaleString() },
                      })
                    : '',
              },
            },
          );

          const booking = await this.prisma.booking.create({
            data: {
              stadion_id: stadion.id,
              user_id: user.id,
              date: date,
              start_time,
              end_time,
              total_price: total,
              payment_method: 'CASH',
              expires_at: new Date(Date.now() + 15 * 60 * 1000),
            },
          });

          await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.confirm', { lang }),
                    callback_data: `booking_confirm_yes_${booking.id}`,
                  },
                  {
                    text: this.i18n.translate('booking.cancel', { lang }),
                    callback_data: `booking_confirm_no_${booking.id}`,
                  },
                ],
              ],
            },
          });
        } else if (!hasCard) {
          const paymentMethodText = paymentTextMap['CASH'] || 'CASH';

          let warning = '';
          if (noshowCount == 1) {
            warning = this.i18n.translate('booking.booking_warning.warning', {
              lang,
            });
          }

          const message = this.i18n.translate(
            'booking.booking_warning.message_template',
            {
              lang,
              args: {
                warning,
                date: days,
                start_time,
                end_time,
                hours: hors,
                total: total.toLocaleString(),
                payment_method: paymentMethodText,
              },
            },
          );
          const booking = await this.prisma.booking.create({
            data: {
              stadion_id: stadionId,
              user_id: user.id,
              date: date,
              start_time,
              end_time,
              total_price: total,
              payment_method: 'CASH',
              expires_at: new Date(Date.now() + 15 * 60 * 1000),
            },
          });

          await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('booking.confirm', { lang }),
                    callback_data: `booking_confirm_yes_${booking.id}`,
                  },
                  {
                    text: this.i18n.translate('booking.cancel', { lang }),
                    callback_data: `booking_confirm_no_${booking.id}`,
                  },
                ],
              ],
            },
          });
        } else {
          const shortDate = date.toISOString().split('T')[0];

          await ctx.editMessageText(
            this.i18n.translate('booking.select_payment_method', { lang }),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('peyments.cash', { lang }),
                      callback_data: `booking_peyments_cash_${start_time}_${end_time}_${shortDate}_${stadionId}_${Number(stadion.price)}_${noshowCount}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('peyments.card', { lang }),
                      callback_data: `booking_peyments_card_${start_time}_${end_time}_${shortDate}_${stadionId}_${Number(stadion.price)}_${noshowCount}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: `booking_back_${stadionId}`,
                    },
                  ],
                ],
              },
            },
          );
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
      console.log(error);
    }
  }

  async bookingPayments(
    ctx: MyContext,
    type: string,
    days: string,
    start_time: string,
    end_time: string,
    stadionId: number,
    pricePerHur: number,
    noshowCount: number,
    lang: string,
  ) {
    try {
      const { total, penalty, price, hors } = this.utils.calculateTotalPrice(
        start_time,
        end_time,
        pricePerHur,
        noshowCount,
      );
      const [year, month, day] = days.split('-');
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        5,
        0,
        0,
        0,
      );
      const dayss = format(date, 'dd.MM.yyyy');
      const user = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!user) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: {
            include: {
              ownerCard: { select: { id: true } },
            },
          },
        },
      });
      if (!stadion) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const cardId = stadion?.owner?.ownerCard?.id;
      const hasCard = !!cardId;
      if (!hasCard) {
        await this.utils.errorFunction(ctx);
        return;
      }

      const paymentTextMap = {
        CARD: this.i18n.translate('peyments.card', { lang }),
        CASH: this.i18n.translate('peyments.cash', { lang }),
      };
      switch (type) {
        case 'cash':
          {
            const paymentMethodText = paymentTextMap['CASH'] || 'CASH';

            let warning = '';
            if (noshowCount == 1) {
              warning = this.i18n.translate('booking.booking_warning.warning', {
                lang,
              });
            }

            const message = this.i18n.translate(
              'booking.booking_warning.message_template',
              {
                lang,
                args: {
                  warning,
                  date: days,
                  start_time,
                  end_time,
                  hours: hors,
                  total: total.toLocaleString(),
                  payment_method: paymentMethodText,
                },
              },
            );

            const booking = await this.prisma.booking.create({
              data: {
                stadion_id: stadionId,
                user_id: user.id,
                date: date,
                start_time,
                end_time,
                total_price: total,
                payment_method: 'CASH',
                expires_at: new Date(Date.now() + 15 * 60 * 1000),
              },
            });

            await ctx.editMessageText(message, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('booking.confirm', { lang }),
                      callback_data: `booking_confirm_yes_${booking.id}`,
                    },
                    {
                      text: this.i18n.translate('booking.cancel', { lang }),
                      callback_data: `booking_confirm_no_${booking.id}`,
                    },
                  ],
                ],
              },
            });
          }
          break;
        case 'card':
          {
            const booking = await this.prisma.booking.create({
              data: {
                stadion_id: stadionId,
                user_id: user.id,
                date: date,
                start_time,
                end_time,
                total_price: total,
                payment_method: 'CARD',
                expires_at: new Date(Date.now() + 15 * 60 * 1000),
              },
            });
            const transaction = await this.prisma.tranzaktion.create({
              data: {
                user_id: booking.user_id,
                booking_id: booking.id,
                systeam_fee: 0,
                owner_amount: total,
                provider: 'Click',
                provider_transactionId: '',
                status: 'PENDING',
                owner_card_id: cardId,
                amount_received: 0,
              },
            });
            const paymentMethodText = paymentTextMap['CARD'] || 'CARD';

            const message = this.i18n.translate('booking.booking_details', {
              lang,
              args: {
                date: dayss,
                start_time,
                end_time,
                hours: hors,
                total: total.toLocaleString(),
                payment_method: paymentMethodText,
              },
            });

            const clickUrl = `https://my.click.uz/pay?merchant_id=${process.env.CLICK_MERCHANT_ID}&amount=${total}&transaction_id=${transaction.id}&callback_url=${encodeURIComponent('https://your-server.com/click-webhook')}`;

            await ctx.editMessageText(message, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate(
                        'booking.payment_options.prepay',
                        { lang },
                      ),
                      url: clickUrl,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'booking.payment_options.pay_later',
                        { lang },
                      ),
                      callback_data: `booking_confirm_pending_${booking.id}`,
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('booking.cancel', { lang }),
                      callback_data: `booking_confirm_no_${booking.id}`,
                    },
                  ],
                ],
              },
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
}
