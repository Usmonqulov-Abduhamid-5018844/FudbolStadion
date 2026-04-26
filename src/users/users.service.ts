import { Injectable } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { BotService } from 'src/bot/bot.service';
import { MyContext } from 'src/helpers/bot.sesion';
import { IStadion } from 'src/helpers/interface';
import { getDistance, stadionTypeLabel } from 'src/helpers/lokationSeorch';
import { getPaymentText } from 'src/helpers/peyments_type';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';
import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { toZonedTime, format } from 'date-fns-tz';
import { Decimal } from '@prisma/client/runtime/library';
import { QrService } from 'src/qr/qr.service';
import { getLocation, getPaymentUrl } from 'src/helpers/url';
import { getStadionIds } from 'src/helpers/stadions';
import { statusMap } from 'src/helpers/bookingStatus';
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly botService: BotService,
    private readonly utils: UtilisService,
    private readonly qrservice: QrService,
  ) {}

  async registor(ctx: MyContext, lang: string) {
    ctx.session = ctx.session || {};
    ctx.session.step = 'user_registor';

    ctx.session.user_registor.step = 'full_name';
    ctx.reply(this.i18n.translate('registor.name', { lang }));
  }

  async registor_step(ctx: MyContext, lang: string) {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.user_registor.step === 'full_name') {
        ctx.session.user_registor.full_name = ctx.message.text;
        ctx.session.user_registor.step = 'phone';
        await ctx.reply(this.i18n.translate('registor.phone', { lang }), {
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

          await ctx.reply(
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
          await this.utils.errorFunction(ctx);
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
        case '5':
          {
            if (ctx.session.bookingBrones?.length) {
              try {
                await ctx.deleteMessages(ctx.session.bookingBrones);
                ctx.session.bookingBrones = [];
              } catch (error) {}
              ctx.session.bookingBrones = [];
            } else {
              return this.userBooking(ctx, lang);
            }
          }
          break;
        case '6': {
          if (ctx.session.stadionMessages?.length) {
            try {
              await ctx.deleteMessages(ctx.session.stadionMessages);
              ctx.session.stadionMessages = [];
            } catch (error) {
              ctx.session.stadionMessages = [];
            }
          }
          return await this.userSwitch(ctx, 'stadionSearch', lang);
        }
        case 'help': {
          try {
            await this.utils.safeEditHelpMenuReply_User(
              ctx,
              this.i18n.translate('user_help.menu.title', { lang }),
            );
          } catch (error) {
            await this.utils.errorFunction(ctx);
          }
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
            try {
              const limit = 2;
              const user = await this.prisma.users.findUnique({
                where: { chatID: String(ctx.from?.id) },
              });
              if (!user) {
                await this.utils.errorFunction(ctx);
                return;
              }
              const [bookings, total] = await Promise.all([
                this.prisma.booking.findMany({
                  where: {
                    user_id: user.id,
                    status: {
                      in: ['CONFIRMED', 'PAID', 'PENDING'],
                    },
                  },
                  orderBy: {
                    updatedAt: 'desc',
                  },
                  include: {
                    stadion: {
                      select: {
                        id: true,
                        name: true,
                        latitude: true,
                        longitude: true,
                        payments_type: true,
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
                    },
                    tranzaktions: {
                      select: {
                        id: true,
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
                      in: ['CONFIRMED', 'PAID', 'PENDING'],
                    },
                  },
                }),
              ]);

              if (!total) {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.no_active_bookings', {
                    lang,
                  }),
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
              try {
                await ctx.answerCbQuery(
                  this.i18n.translate('loading.loading', { lang }),
                );
              } catch (error) {}

              const Time = (
                data: Date,
                start_time: string,
                end_time: string,
                lang: string,
              ) => {
                const { timeLeftText, totalMinutes } =
                  this.utils.bookingTimeCalculate(data, start_time, lang);
                const { totalMinutes: endMinutes } =
                  this.utils.bookingTimeCalculate(data, end_time, lang);

                if (totalMinutes <= 0 && endMinutes > 0) {
                  return this.i18n.translate('booking.game_started', { lang });
                } else if (totalMinutes <= 0) {
                  return this.i18n.translate('bookingHistory.time_expired', {
                    lang,
                  });
                }

                return timeLeftText;
              };

              const formatPrice = (price?: number | string | Decimal) => {
                if (!price) return '❌';
                return new Intl.NumberFormat('uz-UZ').format(Number(price));
              };

              if (!ctx.session.bookingBrones) {
                ctx.session.bookingBrones = [];
              }

              for (const item of bookings) {
                const locationText = getLocation(
                  item.stadion.latitude,
                  item.stadion.longitude,
                  item.stadion.region.name,
                  item.stadion.region_items.name,
                );

                const message = `${this.i18n.translate('bookingHistory.booking.id', { lang })}: ${item.id}

${this.i18n.translate('bookingHistory.booking.stadion', { lang })}: ${item.stadion.name}

${this.i18n.translate('bookingHistory.booking.date', { lang })}: ${format(item.date, 'dd.MM.yyyy')}

${this.i18n.translate('bookingHistory.booking.time', { lang })}: ${item.start_time} - ${item.end_time}

${this.i18n.translate('bookingHistory.booking.remaining_time', { lang })}: ${Time(item.date, item.start_time, item.end_time, lang)}

${this.i18n.translate('bookingHistory.booking.price', { lang })}: ${formatPrice(item.total_price)} ${this.i18n.translate('bookingHistory.booking.price_title', { lang })}

${this.i18n.translate('bookingHistory.booking.payment_type', { lang })}: ${getPaymentText(item.payment_method, this.i18n.translate('peyments', { lang }))}

${this.i18n.translate('bookingHistory.booking.status', { lang })}: ${statusMap(item.status, this.i18n, lang)}

${item.check_in ? this.i18n.translate('bookingHistory.booking.check_in', { lang }) + '\n\n' : ''}${this.i18n.translate('bookingHistory.booking.location', { lang })}: ${locationText}
`;

                const buttons = this.utils.booking_status_handler(
                  item.status,
                  item.id,
                  item.payment_method,
                  item.stadion.payments_type,
                  item.date,
                  item.start_time,
                  item.end_time,
                  Number(item.total_price),
                  item.tranzaktions?.id,
                  page,
                  limit,
                  total,
                  item.check_in,
                  lang,
                );

                const send = await ctx.reply(message, {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: buttons,
                  },
                });
                ctx.session.bookingBrones.push(send.message_id);
              }

              const buttons: InlineKeyboardButton[] = [];
              const totalPages = Math.ceil(total / limit);

              if (!(page === 1 && totalPages === 1)) {
                if (page > 1) {
                  buttons.push({
                    text: this.i18n.translate('stadions.Previous', { lang }),
                    callback_data: `booking_region_page_stadionBron_${page - 1}`,
                  });
                }

                buttons.push({
                  text: `${page} / ${totalPages}`,
                  callback_data: 'ignore',
                });

                if (page < totalPages) {
                  buttons.push({
                    text: this.i18n.translate('stadions.Next', { lang }),
                    callback_data: `booking_region_page_stadionBron_${page + 1}`,
                  });
                }

                const send = await ctx.reply(
                  this.i18n.translate('stadions.Select', { lang }),
                  {
                    reply_markup: {
                      inline_keyboard: [
                        buttons,
                        [
                          {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: 'back_user_5',
                          },
                        ],
                      ],
                    },
                  },
                );
                ctx.session.bookingBrones.push(send.message_id);
              }
            } catch (error) {
              await this.utils.errorFunction(ctx);
            }
          }

          break;
        case 'stadionBronHistory':
          {
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
                      in: ['COMPLETED', 'NOSHOW', 'CANCELED', 'REFUNDED'],
                    },
                  },
                  orderBy: {
                    updatedAt: 'desc',
                  },
                  include: {
                    stadion: {
                      select: {
                        id: true,
                        name: true,
                        longitude: true,
                        latitude: true,
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
                    },
                  },
                  skip: (page - 1) * limit,
                  take: limit,
                }),
                this.prisma.booking.count({
                  where: {
                    user_id: user.id,
                    status: {
                      in: ['COMPLETED', 'NOSHOW', 'CANCELED', 'REFUNDED'],
                    },
                  },
                }),
              ]);
              if (!total) {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.booking_history_empty', {
                    lang,
                  }),
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
              try {
                await ctx.answerCbQuery(
                  this.i18n.translate('loading.loading', { lang }),
                );
              } catch (error) {}
              let message = `${this.i18n.translate('bookingHistory.booking.history_title', { lang })}\n\n`;

              const formatPrice = (price?: number | string | Decimal) => {
                if (!price) return '❌';
                return new Intl.NumberFormat('uz-UZ').format(Number(price));
              };
              for (const item of booking) {
                let locationText = getLocation(
                  item.stadion.latitude,
                  item.stadion.longitude,
                  item.stadion.region.name,
                  item.stadion.region_items.name,
                );

                message += `${this.i18n.translate('bookingHistory.booking.id', { lang })}: ${item.id}

${this.i18n.translate('bookingHistory.booking.stadion', { lang })}: ${item.stadion.name}

${this.i18n.translate('bookingHistory.booking.date', { lang })}: ${format(item.date, 'dd.MM.yyyy')}

${this.i18n.translate('bookingHistory.booking.time', { lang })}: ${item.start_time} - ${item.end_time}

${this.i18n.translate('bookingHistory.booking.price', { lang })}: ${formatPrice(item.total_price)} ${this.i18n.translate('bookingHistory.booking.price_title', { lang })}

${this.i18n.translate('bookingHistory.booking.payment_type', { lang })}: ${getPaymentText(item.payment_method, this.i18n.translate('peyments', { lang }))}

${this.i18n.translate('bookingHistory.booking.status', { lang })}: ${statusMap(item.status, this.i18n, lang)}

${this.i18n.translate('bookingHistory.booking.location', { lang })}: ${locationText}

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

              await ctx.editMessageText(message, {
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
            const limit = 4;
            const [favorites, total] = await Promise.all([
              this.prisma.myFavoriteStadium.findMany({
                where: { chat_id: String(ctx.from?.id) },
                orderBy: {
                  createdAt: 'desc',
                },
                include: {
                  stadion: {
                    include: {
                      region: true,
                      region_items: true,
                    },
                  },
                },
                skip: (page - 1) * limit,
                take: limit,
              }),
              this.prisma.myFavoriteStadium.count({
                where: { chat_id: String(ctx.from?.id) },
              }),
            ]);
            if (!favorites.length) {
              await ctx.answerCbQuery(
                this.i18n.translate('booking.stadion.noFavorites', { lang }),
                {
                  show_alert: true,
                },
              );
              return;
            }
            try {
              await ctx.answerCbQuery(
                this.i18n.translate('loading.loading', { lang }),
              );
            } catch (error) {}
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
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('booking.stadion.search', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('booking.stadions.nearby', {
                        lang,
                      }),
                      callback_data: 'user_location',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('booking.stadions.by_time', {
                        lang,
                      }),
                      callback_data: 'user_working',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('booking.stadions.by_name', {
                        lang,
                      }),
                      callback_data: 'user_nameSearch',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('booking.stadions.cheap', {
                        lang,
                      }),
                      callback_data: 'user_cheapPrice',
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'back_user_3',
                    },
                  ],
                ],
              },
            );
          }
          break;
        case 'location':
          {
            if (ctx.callbackQuery) {
              try {
                await ctx.answerCbQuery();
              } catch (error) {}
            }
            await ctx.reply(
              this.i18n.translate('stadions.location_else', { lang }),
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
            ctx.session.booking_step = 'user_location_send';
          }
          break;
        case 'working':
          {
            try {
              try {
                if (ctx.callbackQuery) {
                  await ctx.answerCbQuery();
                }
              } catch (error) {}

              const tz = 'Asia/Tashkent';
              const now = toZonedTime(new Date(), tz);

              const todayStr = format(now, 'yyyy-MM-dd');
              const tomorrowStr = format(
                new Date(now.getTime() + 86400000),
                'yyyy-MM-dd',
              );

              const buttons: any[] = [];

              for (let i = 0; i < 7; i++) {
                const date = new Date(now);
                date.setDate(now.getDate() + i);

                const dateStr = format(date, 'yyyy-MM-dd');

                const day = format(date, 'd');
                const monthNumber = date.getMonth() + 1;

                const weekDay = date.getDay() === 0 ? 7 : date.getDay();

                const monthText = this.i18n.translate(
                  `schedule.months.${monthNumber}`,
                  { lang },
                );

                const weekDayText = this.i18n.translate(
                  `schedule.week_days.${weekDay}`,
                  { lang },
                );

                let dateLabel = `${day} - ${monthText}. ${weekDayText}`;

                if (dateStr === todayStr) {
                  dateLabel = `${this.i18n.translate('schedule.today', { lang })}. ${weekDayText}`;
                }

                if (dateStr === tomorrowStr) {
                  dateLabel = `${this.i18n.translate('schedule.tomorrow', { lang })}. ${weekDayText}`;
                }

                buttons.push([
                  {
                    text: `${dateLabel}`,
                    callback_data: `working_date_${dateStr}`,
                  },
                ]);
              }
              buttons.push([
                {
                  text: this.i18n.translate('schedule.back', { lang }),
                  callback_data: 'back_user_6',
                },
              ]);

              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('booking.working_time', { lang }),
                {
                  inline_keyboard: buttons,
                },
              );
            } catch (error) {}
          }
          break;
        case 'nameSearch':
          {
            try {
              try {
                if (ctx.callbackQuery) {
                  await ctx.answerCbQuery();
                }
                await ctx.deleteMessage();
              } catch (error) {}

              await ctx.reply(
                this.i18n.translate('booking.stadions.enter_name', { lang }),
              );
              ctx.session.stadion.name = 'SeorchName';
            } catch (error) {}
          }
          break;
        case 'cheapPrice':
          {
            try {
              try {
                if (ctx.callbackQuery) {
                  await ctx.answerCbQuery();
                }
                await ctx.deleteMessage();
              } catch (error) {}
              const max_price = 500000;
              const limit = 4;
              const [stadions, total] = await Promise.all([
                this.prisma.stadion.findMany({
                  where: {
                    working_status: true,
                    price: {
                      lte: max_price,
                    },
                    OR: [
                      {
                        stadionChedules: { some: {} },
                      },
                      {
                        parent: {
                          stadionChedules: { some: {} },
                        },
                      },
                    ],
                  },
                  include: {
                    region: true,
                    region_items: true,
                  },
                  orderBy: {
                    price: 'asc',
                  },
                  skip: (page - 1) * limit,
                  take: limit,
                }),
                this.prisma.stadion.count({
                  where: {
                    working_status: true,
                    price: { lte: max_price },
                    OR: [
                      {
                        stadionChedules: { some: {} },
                      },
                      {
                        parent: {
                          stadionChedules: { some: {} },
                        },
                      },
                    ],
                  },
                }),
              ]);
              if (!stadions.length) {
                await ctx.reply(this.i18n.translate('error.error', { lang }));
                return;
              }
              for (const stadion of stadions) {
                await this.stadionAll_data(ctx, lang, stadion, '', true);
              }

              const totalPages = Math.ceil(total / limit);

              if (page === 1 && totalPages === 1) {
                return;
              }

              const row: InlineKeyboardButton[] = [];

              if (page > 1) {
                row.push({
                  text: this.i18n.translate('stadions.Previous', { lang }),
                  callback_data: `booking_region_page_cheapPrice_${page - 1}`,
                });
              }

              row.push({
                text: `${page} / ${totalPages}`,
                callback_data: 'ignore',
              });

              if (page < totalPages) {
                row.push({
                  text: this.i18n.translate('stadions.Next', { lang }),
                  callback_data: `booking_region_page_cheapPrice_${page + 1}`,
                });
              }
              const send = await ctx.reply(
                this.i18n.translate('stadions.Select', { lang }),
                {
                  reply_markup: { inline_keyboard: [row] },
                },
              );
              if (!ctx.session.stadionMessages) {
                ctx.session.stadionMessages = [];
              }
              ctx.session.stadionMessages.push(send.message_id);
            } catch (error) {}
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
            where: {
              working_status: true,
              OR: [
                {
                  stadionChedules: { some: {} },
                },
                {
                  parent: {
                    stadionChedules: { some: {} },
                  },
                },
              ],
            },
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
      console.log(error);
      await this.utils.errorFunction(ctx);
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
          where: {
            region_item_id: itemId,
            working_status: true,
            OR: [
              {
                stadionChedules: { some: {} },
              },
              {
                parent: {
                  stadionChedules: { some: {} },
                },
              },
            ],
          },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            region: true,
            region_items: true,
          },
        }),
        this.prisma.stadion.count({
          where: {
            region_item_id: itemId,
            working_status: true,
            OR: [
              {
                stadionChedules: { some: {} },
              },
              {
                parent: {
                  stadionChedules: { some: {} },
                },
              },
            ],
          },
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
      await ctx.reply(this.i18n.translate('stadions.Select', { lang }), {
        reply_markup: { inline_keyboard: [row] },
      });
    } catch (error) {
      console.log(error);
      await this.utils.errorFunction(ctx);
    }
  }

  async userBookingFanc(ctx: MyContext, lang: string) {
    try {
      const stadions = await this.prisma.stadion.findMany({
        where: {
          working_status: true,
          OR: [
            {
              stadionChedules: { some: {} },
            },
            {
              parent: {
                stadionChedules: { some: {} },
              },
            },
          ],
        },
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
          parent: true,
        },
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

  async stadionAll_data(
    ctx: MyContext,
    lang: string,
    stadion: IStadion,
    distanceKm?: string,
    isSeorch = false,
  ) {
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
${distanceKm ? this.i18n.translate('view.distance', { lang }) : ''} ${distanceKm ? distanceKm + ' km\n' : ''}${stadionTypeLabel(stadion.mini, stadion.stadion_mini, lang, this.i18n)}
${this.i18n.translate('view.count', { lang })} <b>${stadion.max_count || this.i18n.translate('view.not', { lang })}</b>
${this.i18n.translate('view.size', { lang })} <b>${stadion.length || '❌'} x ${stadion.width || '❌'}</b>
${this.i18n.translate('view.price', { lang })} <b>${formatPrice(stadion.price) || '❌'}</b>
${this.i18n.translate('view.peyments', { lang })} ${getPaymentText(stadion.payments_type, this.i18n.translate('peyments', { lang }))}
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
                isSeorch
                  ? {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'back_user_6',
                    }
                  : {
                      text: this.i18n.translate('schedule.back', { lang }),
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
                    text: this.i18n.translate('booking.stadion.book', {
                      lang,
                    }),
                    callback_data: `booking_stadion_${stadion.id}`,
                  },
                  isSeorch
                    ? {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'back_user_6',
                      }
                    : {
                        text: this.i18n.translate('schedule.back', { lang }),
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
        await ctx.answerCbQuery(
          this.i18n.translate('booking.stadion.removedFromFavorites', { lang }),
        );
      } else {
        await this.prisma.myFavoriteStadium.create({
          data: { stadion_id: stadionId, chat_id: String(ctx.from?.id) },
        });
        await ctx.answerCbQuery(
          this.i18n.translate('booking.stadion.addedToFavorites', { lang }),
        );
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  async handleLocation(
    ctx: MyContext,
    lang: string,
    latitude: number,
    longitude: number,
  ) {
    ctx.session.booking_step = null;
    try {
      const send = await ctx.reply('location', {
        reply_markup: { remove_keyboard: true },
      });
      try {
        await ctx.deleteMessage(send.message_id);
      } catch (error) {}
      const stadiums = await this.prisma.stadion.findMany({
        where: {
          working_status: true,
          OR: [
            {
              stadionChedules: { some: {} },
            },
            {
              parent: {
                stadionChedules: { some: {} },
              },
            },
          ],
        },
        include: {
          region: true,
          region_items: true,
        },
      });

      const nearby = stadiums
        .map((s) => {
          if (!s.latitude || !s.longitude) return null;
          const distance = getDistance(
            latitude,
            longitude,
            s.latitude,
            s.longitude,
          );
          return { ...s, distance };
        })
        .filter(Boolean)
        .filter((s) => s!.distance <= 3000)
        .sort((a, b) => a!.distance - b!.distance)
        .slice(0, 5);

      if (!nearby.length) {
        await ctx.reply(
          this.i18n.translate('stadions.stadions_not_found', { lang }),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: 'back_user_6',
                  },
                ],
              ],
            },
          },
        );
        return;
      }

      for (const s of nearby) {
        const distanceKm = (s!.distance / 1000).toFixed(2);
        await this.stadionAll_data(ctx, lang, s!, distanceKm, true);
      }
    } catch (error) {
      console.error(error);
      await this.utils.errorFunction(ctx);
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
        include: { parent: true },
      });

      if (!stadion) {
        return this.utils.errorFunction(ctx);
      }
      const targetStadionId = stadion.parent_id ?? stadion.id;
      const [schedule, offDays, specialDays] = await Promise.all([
        this.prisma.stadion_chedule.findMany({
          where: { stadion_id: targetStadionId },
        }),
        this.prisma.stadion_off_days.findMany({
          where: { stadion_id: targetStadionId },
        }),
        this.prisma.stadion_special_schedule.findMany({
          where: { stadion_id: targetStadionId },
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
              callback_data: `booking_specials_${special.id}_${stadion.id}`,
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
            callback_data: `booking_schedule_${date.getFullYear()}_${day}_${monthNumber}_${s.id}_${stadion.id}`,
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
  async special(
    ctx: MyContext,
    lang: string,
    specialId: number,
    stadionId: number,
  ) {
    try {
      const [special, stadion] = await Promise.all([
        this.prisma.stadion_special_schedule.findUnique({
          where: { id: specialId },
        }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!special || !stadion) {
        this.utils.errorFunction(ctx);
        return;
      }

      const stadionIds = getStadionIds(stadion);

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

      const bookings = await this.prisma.booking.findMany({
        where: {
          stadion_id: { in: stadionIds },
          date: startOfDay,
          status: {
            in: ['CONFIRMED', 'PAID', 'PENDING'],
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
                  callback_data: `booking_special_${freeSlots[i + j].start}_${special.id}_${stadionId}`,
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
                        callback_data: `booking_back_${stadionId}`,
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
                callback_data: `booking_special_${allSlots[i + j].start}_${special.id}_${stadionId}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_back_${stadionId}`,
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
    specialId: number,
    stadionId: number,
    start_time: string,
  ) {
    try {
      const [special, stadion] = await Promise.all([
        this.prisma.stadion_special_schedule.findUnique({
          where: { id: specialId },
        }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);

      if (!special || !stadion) {
        await this.utils.errorFunction(ctx);
        return;
      }
      const stadionsIds = getStadionIds(stadion);
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

      const booking = await this.prisma.booking.findMany({
        where: {
          stadion_id: { in: stadionsIds },
          date: startOfDay,
          status: {
            in: ['CONFIRMED', 'PAID', 'PENDING'],
          },
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
                  callback_data: `booking_specialEnd_${start_time}_${freeSlots[i + j].end}_${stadionId}_${special.date.getFullYear()}_${special.date.getMonth() + 1}_${special.date.getDate()}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `booking_specialBack_${special.id}_${stadionId}`,
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
                        callback_data: `booking_specialBack_${special.id}_${stadionId}`,
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
                callback_data: `booking_specialEnd_${start_time}_${allSlots[i + j].end}_${stadionId}_${special.date.getFullYear()}_${special.date.getMonth() + 1}_${special.date.getDate()}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_specialBack_${special.id}_${stadionId}`,
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
    stadionId: number,
    lang: string,
  ) {
    try {
      const [scheduleDate, stadion] = await Promise.all([
        this.prisma.stadion_chedule.findUnique({
          where: { id: scheduleId },
        }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);

      if (!scheduleDate || !stadion) {
        this.utils.errorFunction(ctx);
        return;
      }
      const stadionsIds = getStadionIds(stadion);
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
          stadion_id: { in: stadionsIds },
          date: startOfDay,
          status: {
            in: ['CONFIRMED', 'PAID', 'PENDING'],
          },
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
                  callback_data: `booking_timeStart_${freeSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `booking_back_${stadionId}`,
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
                        callback_data: `booking_back_${stadionId}`,
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
                callback_data: `booking_timeStart_${allSlots[i + j].start}_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_back_${stadionId}`,
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
    stadionId: number,
    lang: string,
  ) {
    try {
      const [scheduleDate, stadion] = await Promise.all([
        this.prisma.stadion_chedule.findUnique({
          where: { id: scheduleId },
        }),
        this.prisma.stadion.findUnique({
          where: { id: stadionId },
          include: { parent: true, children: true },
        }),
      ]);
      if (!scheduleDate || !stadion) {
        this.utils.errorFunction(ctx);
        return;
      }
      const stadionIds = getStadionIds(stadion);
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
          stadion_id: { in: stadionIds },
          date: startOfDay,
          status: {
            in: ['CONFIRMED', 'PAID', 'PENDING'],
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
                  callback_data: `booking_timeEnd_${start_time}_${freeSlots[i + j].end}_${day}_${monthNumber}_${stadionId}_${years}`,
                });
              }
            }
            button.push(row);
          }
          button.push([
            {
              text: this.i18n.translate('schedule.back', { lang }),
              callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
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
                        callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
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
                callback_data: `booking_timeEnd_${start_time}_${allSlots[i + j].end}_${day}_${monthNumber}_${stadionId}_${years}`,
              });
            }
          }
          button.push(row);
        }
        button.push([
          {
            text: this.i18n.translate('schedule.back', { lang }),
            callback_data: `booking_scheduleBack_${scheduleId}_${day}_${monthNumber}_${years}_${stadionId}`,
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
      const startAt = new Date(
        `${format(date, 'yyyy-MM-dd')}T${start_time}:00`,
      );
      const endAt = new Date(`${format(date, 'yyyy-MM-dd')}T${end_time}:00`);
      const stadion = await this.prisma.stadion.findUnique({
        where: { id: stadionId },
        include: {
          owner: {
            include: {
              ownerCard: true,
            },
          },
          children: true,
          parent: true,
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
        where: {
          user_id: user.id,
          stadion_id: stadion.id,
          status: { in: ['NOSHOW', 'REFUNDED'] },
        },
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
            startAt,
            endAt,
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

        const clickUrl = getPaymentUrl(total, transaction);

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
            startAt,
            endAt,
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
              startAt,
              endAt,
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

          const clickUrl = getPaymentUrl(total, transaction);
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
              startAt,
              endAt,
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
          } else if (noshowCount >= 2) {
            warning = this.i18n.translate('booking.penalty', { lang });
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
              startAt,
              endAt,
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

          await this.utils.safeEditOrReply(
            ctx,
            this.i18n.translate('booking.select_payment_method', { lang }),
            {
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
          );
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
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
      const startAt = new Date(
        `${format(date, 'yyyy-MM-dd')}T${start_time}:00`,
      );
      const endAt = new Date(`${format(date, 'yyyy-MM-dd')}T${end_time}:00`);
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
            } else if (noshowCount >= 2) {
              warning = this.i18n.translate('booking.penalty', { lang });
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
                startAt,
                endAt,
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
                startAt,
                endAt,
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
                owner_card_id: cardId,
                amount_received: 0,
              },
            });
            const paymentMethodText = paymentTextMap['CARD'] || 'CARD';
            let warning = '';

            if (noshowCount == 1) {
              warning = this.i18n.translate('booking.booking_warning.warning', {
                lang,
              });
            } else if (noshowCount >= 2) {
              warning = this.i18n.translate('booking.penalty', { lang });
            }

            const message = this.i18n.translate('booking.booking_details', {
              lang,
              args: {
                warning: warning,
                date: dayss,
                start_time,
                end_time,
                hours: hors,
                total: total.toLocaleString(),
                payment_method: paymentMethodText,
              },
            });

            const clickUrl = getPaymentUrl(total, transaction);

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
            if (!ctx.session.booking_step) {
              ctx.session.booking_step = '';
            }
            ctx.session.booking_step = 'pay_later';
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

  async searchWorkingStadions(
    ctx: MyContext,
    date: string,
    start_time: string,
    end_time: string,
    lang: string,
    page: number = 1,
  ) {
    try {
      const limit = 4;
      const [stadion, total] = await Promise.all([
        this.prisma.stadion.findMany({
          where: {
            bookings: {
              none: {
                date: new Date(date),
                start_time: start_time,
                end_time: end_time,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            region: true,
            region_items: true,
          },
        }),
        this.prisma.stadion.count({
          where: {
            bookings: {
              none: {
                date: new Date(date),
                start_time: start_time,
                end_time: end_time,
              },
            },
          },
        }),
      ]);
      if (!stadion.length) {
        try {
          await ctx.answerCbQuery(
            this.i18n.translate('booking.no_free_slots', { lang }),
            { show_alert: true },
          );
        } catch (error) {}
        return;
      }
      try {
        await ctx.deleteMessage();
        if (ctx.session.stadionMessages?.length) {
          await ctx.deleteMessages(ctx.session.stadionMessages);
        }
      } catch (error) {}
      for (let s of stadion) {
        await this.stadionAll_data(ctx, lang, s, '', true);
      }
      const totalPages = Math.ceil(total / limit);
      if (totalPages == 1) {
        return;
      }
      const paginationButtons: InlineKeyboardButton[] = [];
      if (page > 1) {
        paginationButtons.push({
          text: this.i18n.translate('stadions.Previous', { lang }),
          callback_data: `search_stadionsPage_${date}_${start_time}_${end_time}_${lang}_${page - 1}`,
        });
      }
      paginationButtons.push({
        text: `${page} / ${totalPages}`,
        callback_data: 'ignore',
      });
      if (page < totalPages) {
        paginationButtons.push({
          text: this.i18n.translate('stadions.Next', { lang }),
          callback_data: `search_stadionsPage_${date}_${start_time}_${end_time}_${lang}_${page + 1}`,
        });
      }
      ctx.reply(this.i18n.translate('booking.Select', { lang }), {
        reply_markup: { inline_keyboard: [paginationButtons] },
      });
    } catch (error) {
      await this.utils.errorFunction(ctx);
    } finally {
      await ctx.answerCbQuery().catch(() => {});
    }
  }
}
