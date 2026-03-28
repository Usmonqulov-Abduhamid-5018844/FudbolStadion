import { I18nService } from 'nestjs-i18n';
import { BotService } from './bot.service';
import {
  Action,
  Command,
  Ctx,
  Hears,
  On,
  Start,
  Update,
} from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { OwnersService } from 'src/owners/owners.service';
import { UsersService } from 'src/users/users.service';
import { InlineKeyboardButton } from 'telegraf/types';
import { Markup } from 'telegraf';
import { Payments } from '@prisma/client';
import { backKeyboard, helpMenuKeyboard } from 'src/helpers/Inline_keybort';
import { UtilisService } from 'src/utils/utile.service';
import { format } from 'date-fns';
import { QrService } from 'src/qr/qr.service';

@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly ownerService: OwnersService,
    private readonly userService: UsersService,
    private readonly utils: UtilisService,
    private readonly qrservice: QrService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: any) {
    ctx.session.step = null;
    ctx.session.stadion_step = null;
    ctx.session.stadion || {
      image: null,
      length: null,
      lockation: null,
      name: null,
      owner_id: null,
      max_count: null,
      payments_type: null,
      latitude: null,
      longitude: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
    };
    ctx.session.user_registor = {
      id: null,
      full_name: null,
      phone: null,
      step: null,
    };
    const data = await this.prisma.sesion.findUnique({
      where: { chat_id: String(ctx.from?.id) },
    });
    if (data) {
      ctx.session.lang = data.lang;
      return this.botService.checket(ctx);
    }
    return this.botService.start(ctx);
  }
  @Action(/lang_(.+)/)
  async language(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      ctx.session = ctx.session || {};
      const lang = (ctx.callbackQuery?.data).split('_')[1];
      const data = await this.prisma.sesion.findUnique({
        where: { chat_id: String(ctx.from?.id) },
      });
      if (!data) {
        await this.prisma.sesion.create({
          data: { chat_id: String(ctx.from?.id), lang },
        });
        ctx.session.lang = lang;
      } else {
        const updateLang = await this.prisma.sesion.update({
          where: { id: data.id },
          data: { lang },
        });
        ctx.session.lang = updateLang.lang;
      }
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.session.step === 'language') {
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
                  text: this.i18n.translate('settings.notification', { lang }),
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
    } else if (ctx.session.step === 'user_langs') {
      return this.userService.settings(ctx, lang);
    } else {
      return this.botService.checket(ctx);
    }
  }
  @Action(/errorBack_(.+)$/)
  async errorBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, errorId] = ctx.callbackQuery?.data.split('_');
      switch (errorId) {
        case '1': {
          return this.botService.checket(ctx);
        }
      }
    }
  }
  @Action(/delete_stadion_fovorite_(\d+)$/)
  async deletStadion(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, type, id] = ctx.callbackQuery.data.split('_');
        if (type === 'fovorite') {
          await this.prisma.myFavoriteStadium.delete({
            where: {
              chat_id_stadion_id: {
                chat_id: String(ctx.from?.id),
                stadion_id: Number(id),
              },
            },
          });
          await ctx.deleteMessage();
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }

  @Action(/^booking_confirm_(.+)_(\d+)$/)
  async confirment(@Ctx() ctx: MyContext) {
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, type, bookingId] = ctx.callbackQuery.data.split('_');
        switch (type) {
          case 'yes':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
                include: { stadion: true },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              await this.prisma.booking.update({
                where: { id: Number(booking.id) },
                data: { status: 'CONFIRMED' },
              });
              const days = format(booking.date, 'dd.MM.yyyy');

              const paymentTextMap = {
                CARD: this.i18n.translate('peyments.card', { lang }),
                CASH: this.i18n.translate('peyments.cash', { lang }),
              };

              const paymentMethodText =
                paymentTextMap[booking.payment_method] ||
                booking.payment_method;

              const message = this.i18n.translate('booking.booking_confirmed', {
                lang,
                args: {
                  stadion_name: booking.stadion.name,
                  date: days,
                  start_time: booking.start_time,
                  end_time: booking.end_time,
                  payment_method: paymentMethodText,
                  total: booking.total_price.toLocaleString(),
                },
              });
              try {
                await ctx.editMessageText(message, {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'errorBack_1',
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
          case 'no':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              const days = format(booking.date, 'dd.MM.yyyy');
              try {
                await ctx.editMessageText(
                  this.i18n.translate('booking.booking_cancelled_notice', {
                    lang,
                    args: {
                      date: days,
                      start_time: booking.start_time,
                      end_time: booking.end_time,
                    },
                  }),
                  {
                    parse_mode: 'Markdown',
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: this.i18n.translate('schedule.back', {
                              lang,
                            }),
                            callback_data: 'errorBack_1',
                          },
                        ],
                      ],
                    },
                  },
                );
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'pending':
            {
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
                include: { stadion: true },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              if (
                ctx.session.booking_step &&
                ctx.session.booking_step === 'pay_later'
              ) {
                await this.prisma.booking.update({
                  where: { id: Number(bookingId) },
                  data: { status_pay_later: true },
                });
              }
              const { timeLeftText, totalMinutes } =
                this.utils.bookingTimeCalculate(
                  booking.date,
                  booking.start_time,
                  lang,
                );

              if (totalMinutes < 60) {
                await ctx.answerCbQuery(
                  this.i18n.translate('booking.payment_time_alert', {
                    lang,
                    args: { time_left: timeLeftText },
                  }),
                  { show_alert: true },
                );
                return;
              }
              const days = format(booking.date, 'dd.MM.yyyy');

              const paymentTextMap = {
                CARD: this.i18n.translate('peyments.card', { lang }),
                CASH: this.i18n.translate('peyments.cash', { lang }),
              };

              const paymentMethodText =
                paymentTextMap[booking.payment_method] ||
                booking.payment_method;

              const message = this.i18n.translate(
                'booking.confirm_with_payment',
                {
                  lang,
                  args: {
                    stadion_name: booking.stadion.name,
                    date: days,
                    start_time: booking.start_time,
                    end_time: booking.end_time,
                    payment_method: paymentMethodText,
                    total: booking.total_price.toLocaleString(),
                    time_left: timeLeftText,
                  },
                },
              );
              try {
                await ctx.editMessageText(message, {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'errorBack_1',
                        },
                      ],
                    ],
                  },
                });
                ctx.session.booking_step = '';
              } catch (error) {}
            }
            break;
          case 'confirm':
            {
              try {
                if (ctx.callbackQuery) {
                  try {
                    await ctx.answerCbQuery();
                  } catch (error) {}
                }
                const booking = await this.prisma.booking.findUnique({
                  where: { id: Number(bookingId) },
                  include: { stadion: true },
                });
                if (!booking) {
                  await this.utils.errorFunction(ctx);
                  return;
                }
                await this.prisma.booking.update({
                  where: { id: booking.id },
                  data: { status: 'CONFIRMED' },
                });
                const days = format(booking.date, 'dd.MM.yyyy');

                const paymentTextMap = {
                  CARD: this.i18n.translate('peyments.card', { lang }),
                  CASH: this.i18n.translate('peyments.cash', { lang }),
                };

                const paymentMethodText =
                  paymentTextMap[booking.payment_method] ||
                  booking.payment_method;

                const message = this.i18n.translate(
                  'booking.booking_confirmed',
                  {
                    lang,
                    args: {
                      stadion_name: booking.stadion.name,
                      date: days,
                      start_time: booking.start_time,
                      end_time: booking.end_time,
                      payment_method: paymentMethodText,
                      total: booking.total_price.toLocaleString(),
                    },
                  },
                );
                const send = await ctx.reply(message, {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_5',
                        },
                      ],
                    ],
                  },
                });
                if (!ctx.session.bookingBrones) {
                  ctx.session.bookingBrones = [];
                }
                ctx.session.bookingBrones.push(send.message_id);
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'cancel':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const booking = await this.prisma.booking.findUnique({
                where: { id: Number(bookingId) },
              });
              if (!booking) {
                await this.utils.errorFunction(ctx);
                return;
              }
              await this.prisma.booking.update({
                where: { id: booking.id },
                data: { status: 'CANCELED' },
              });
              const days = format(booking.date, 'dd.MM.yyyy');

              const send = await ctx.reply(
                this.i18n.translate('booking.booking_cancelled', {
                  lang,
                  args: {
                    date: days,
                    start_time: booking.start_time,
                    end_time: booking.end_time,
                  },
                }),
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_5',
                        },
                      ],
                    ],
                  },
                },
              );
              if (!ctx.session.bookingBrones) {
                ctx.session.bookingBrones = [];
              }
              ctx.session.bookingBrones.push(send.message_id);
            }
            break;
          case 'selectPeyments':
            {
              try {
                const booking = await this.prisma.booking.findUnique({
                  where: { id: Number(bookingId) },
                  include: {
                    stadion: {
                      include: {
                        owner: {
                          include: {
                            ownerCard: {
                              select: {
                                id: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                });
                if (!booking) {
                  await this.utils.errorFunction(ctx);
                  return;
                }
                const cardId = booking?.stadion?.owner?.ownerCard?.id;
                const hasCard = !!cardId;
                if (!hasCard) {
                  await this.utils.errorFunction(ctx);
                  return;
                }
                const { totalMinutes } = this.utils.bookingTimeCalculate(
                  booking.date,
                  booking.start_time,
                  lang,
                );
                if (totalMinutes < 0) {
                  await ctx.answerCbQuery(
                    this.i18n.translate('booking.play_game', { lang }),
                    { show_alert: true },
                  );
                  return;
                }
                await Promise.all([
                  this.prisma.booking.update({
                    where: { id: booking.id },
                    data: {
                      payment_method: 'CARD',
                      status: 'PENDING',
                      status_pay_later: true,
                    },
                  }),

                  this.prisma.tranzaktion.create({
                    data: {
                      user_id: booking.user_id,
                      booking_id: booking.id,
                      systeam_fee: 0,
                      owner_amount: Number(booking.total_price),
                      provider: 'Click',
                      provider_transactionId: '',
                      owner_card_id: cardId,
                      amount_received: 0,
                    },
                  }),
                ]);
                const send = await ctx.reply(
                  this.i18n.translate('booking.payments', { lang }),
                  {
                    reply_markup: {
                      inline_keyboard: [
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
                if (!ctx.session.bookingBrones) {
                  ctx.session.bookingBrones = [];
                }
                ctx.session.bookingBrones.push(send.message_id);
              } catch (error) {
                await this.utils.errorFunction(ctx);
              }
            }
            break;
          case 'alerd':
            {
              await ctx.answerCbQuery(
                this.i18n.translate('booking.cancel_not_allowed', { lang }),
                { show_alert: true },
              );
            }
            break;
          case 'QR':
            {
              if (ctx.callbackQuery) {
                try {
                  await ctx.answerCbQuery();
                } catch (error) {}
              }
              const { qr } = await this.qrservice.generateQr(Number(bookingId));

              const send = await ctx.replyWithPhoto(
                { source: Buffer.from(qr.split(',')[1], 'base64') },
                {
                  caption: this.i18n.translate('booking.qr_caption', { lang }),
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: this.i18n.translate('schedule.back', { lang }),
                          callback_data: 'back_user_5',
                        },
                      ],
                    ],
                  },
                },
              );
              if (!ctx.session.bookingBrones) {
                ctx.session.bookingBrones = [];
              }
              ctx.session.bookingBrones.push(send.message_id);
            }
            break;
        }
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/^back_(owner|user)_(.+)$/)
  async brckAll(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, role, data] = ctx.callbackQuery.data.split('_');
      if (role === 'owner') {
        return this.ownerService.ownerBackSwitch(ctx, data, lang);
      } else if (role === 'user') {
        return this.userService.userBackSwitch(ctx, data, lang);
      }
    }
  }
  @Action(
    /^booking_peyments_(cash|card)_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d{4}-\d{1,2}-\d{1,2})_(\d+)_(\d+)_(\d+)/,
  )
  async bookingPeyments(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    try {
      const lang = await this.utils.langs(ctx);
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [
          _,
          __,
          type,
          start_time,
          end_time,
          days,
          stadionId,
          price,
          noshowCount,
        ] = ctx.callbackQuery.data.split('_');
        

        return this.userService.bookingPayments(
          ctx,
          type,
          days,
          start_time,
          end_time,
          Number(stadionId),
          Number(price),
          Number(noshowCount),
          lang,
        );
      }
    } catch (error) {
      await this.utils.errorFunction(ctx);
    }
  }
  @Action(/booking_(back|specialBack)_(\d+)$/)
  async bookingBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, type, id] = ctx.callbackQuery.data.split('_');
      if (type === 'back') {
        return this.userService.userbookingStadion(ctx, lang, Number(id));
      } else if (type === 'specialBack') {
        return this.userService.special(ctx, lang, Number(id));
      }
    }
  }
  @Action(/^booking_scheduleBack_(\d+)_(\d+)_(\d+)_(\d{4})$/)
  async bookingScheduleBack(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, scheduleId, day, monthNumber, years] =
        ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_start(
        ctx,
        years,
        day,
        monthNumber,
        Number(scheduleId),
        lang,
      );
    }
  }

  @Action(/^booking_timeStart_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})$/)
  async bookingTimeStart(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, start_time, scheduleId, day, monthNumber, years] =
        ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_end(
        ctx,
        years,
        start_time,
        Number(scheduleId),
        Number(day),
        Number(monthNumber),
        lang,
      );
    }
  }
  @Action(
    /^booking_timeEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d+)_(\d+)_(\d{4})$/,
  )
  async bookingTimeEnd(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, start_time, end_time, day, monthNumber, stadionId, years] =
        ctx.callbackQuery.data.split('_');
      const data = new Date(
        Number(years),
        Number(monthNumber) - 1,
        Number(day),
        5,
        0,
        0,
        0,
      );

      return this.userService.bookingScheduleFinish(
        ctx,
        start_time,
        end_time,
        data,
        lang,
        Number(stadionId),
      );
    }
  }
  @Action(/^booking_special_(\d{2}:\d{2})_(\d+)$/)
  async userBookingSpecial(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, start_time, id] = ctx.callbackQuery.data.split('_');
      return this.userService.userbookingSpecialEnd(
        ctx,
        lang,
        Number(id),
        start_time,
      );
    }
  }
  @Action(
    /^booking_specialEnd_(\d{2}:\d{2})_(\d{2}:\d{2})_(\d+)_(\d{4})_(\d+)_(\d+)$/,
  )
  async userBookingSpecialEnd(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    try {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const [_, __, start_time, end_time, id, year, month, day] =
          ctx.callbackQuery.data.split('_');
        const data = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          5,
          0,
          0,
          0,
        );

        return this.userService.bookingScheduleFinish(
          ctx,
          start_time,
          end_time,
          data,
          lang,
          Number(id),
        );
      }
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/^booking_schedule_(\d{4})_(\d+)_(\d+)_(\d+)$/)
  async userBookingSchedule(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, year, day, monthNumber, id] =
        ctx.callbackQuery.data.split('_');
      return this.userService.bookingSchedule_start(
        ctx,
        year,
        day,
        monthNumber,
        Number(id),
        lang,
      );
    }
  }
  @Action(/^ignore/)
  async ignore(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
  }
  @Action(/^booking_region_page_(.+)_(\d+)$/)
  async stadionPage(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (error) {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, __, ___, anonimus, page] = ctx.callbackQuery.data.split('_');
      if (anonimus === 'favorit') {
        if (ctx.session.stadionFavoritMessages?.length) {
          const messagesId = ctx.session.stadionFavoritMessages;
          try {
            await ctx.deleteMessages(messagesId);
          } catch (e) {}
          ctx.session.stadionFavoritMessages = [];
        }
        await ctx.deleteMessage();
        await this.userService.userSwitch(
          ctx,
          'stadionFavorite',
          lang,
          Number(page),
        );
      } else if (anonimus === 'stadionBronHistory') {
        await this.userService.userSwitch(ctx, anonimus, lang, Number(page));
      } else if (anonimus === 'stadionBron') {
        if (ctx.session.bookingBrones?.length) {
          try {
            await ctx.deleteMessages(ctx.session.bookingBrones);
          } catch (error) {}
          ctx.session.bookingBrones = [];
        }
        await this.userService.userSwitch(ctx, anonimus, lang, Number(page));
      } else {
        if (ctx.session.stadionMessages?.length) {
          const messagesId = ctx.session.stadionMessages;
          try {
            await ctx.deleteMessages(messagesId);
          } catch (e) {}
          ctx.session.stadionMessages = [];
        }
        await ctx.deleteMessage();
        await this.userService.userbookingRegionItems(
          ctx,
          lang,
          Number(anonimus),
          Number(page),
        );
      }
    }
  }
  @Action(/^booking_(region|regionItem|special|stadion|save)_(\d+)$/)
  async userBooking(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const [_, type, id] = ctx.callbackQuery.data.split('_');
      if (type === 'region') {
        return this.userService.userbookingRegion(ctx, lang, Number(id));
      } else if (type === 'regionItem') {
        return this.userService.userbookingRegionItems(ctx, lang, Number(id));
      } else if (type === 'stadion') {
        return this.userService.userbookingStadion(ctx, lang, Number(id));
      } else if (type === 'save') {
        return this.userService.userSaveFnc(ctx, lang, Number(id));
      } else if (type === 'special') {
        return this.userService.special(ctx, lang, Number(id));
      }
    }
  }

  @Action(/^user_(.+)$/)
  async userSetting(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data.split('_')[1];
      if (data === 'offday') {
        if (ctx.callbackQuery) {
          try {
            await ctx.answerCbQuery(
              this.i18n.translate('booking.stadion.alert', { lang }),
              {
                show_alert: true,
              },
            );
          } catch (error) {}
        }
      }
      return this.userService.userSwitch(ctx, data, lang);
    }
  }

  @Action(/add_stadion/)
  async add_stadion(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    try {
      const region = await this.prisma.region.findMany();

      if (!region.length) {
        this.utils.errorFunction(ctx);
        return;
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
      this.utils.errorFunction(ctx);
    }
  }
  @Action(/region_(.+)/)
  async region_items(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session.stadion = ctx.session.stadion || {
      image: null,
      length: null,
      step: 0,
      lockation: null,
      name: null,
      owner_id: null,
      payments: null,
      max_count: null,
      latitude: null,
      longitude: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
    };
    try {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch {}
      }
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const regionId: number = parseInt(
        ctx.callbackQuery.data.split('_')[1],
        10,
      );
      if (isNaN(regionId)) {
        this.utils.errorFunction(ctx);
        return;
      }
      const region_items = await this.prisma.region_item.findMany({
        where: {
          region_id: regionId,
        },
      });

      if (!region_items.length) {
        this.utils.errorFunction(ctx);
        return;
      }
      ctx.session.stadion.region_id = regionId;
      ctx.session.stadion.step = 1;
      const button: InlineKeyboardButton[][] = region_items.map((item) => [
        { text: item.name, callback_data: `regions_item_${item.id}` },
      ]);
      button.push([
        {
          text: this.i18n.translate('stadions.back'),
          callback_data: 'back_owner_3',
        },
      ]);
      ctx.reply(this.i18n.translate('stadions.region_items', { lang }), {
        reply_markup: { inline_keyboard: button },
      });
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/regions_item_(.+)/)
  async onStadions(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    ctx.session.stadion = ctx.session.stadion || {
      image: null,
      length: null,
      max_count: null,
      lockation: null,
      latitude: null,
      longitude: null,
      step: 0,
      name: null,
      owner_id: null,
      payments: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
    };
    ctx.session.stadion_step = ctx.session.stadion_step || null;
    try {
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery();
        } catch {}
      }

      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const region_item_id: number = parseInt(
        ctx.callbackQuery.data.split('_')[2],
        10,
      );

      if (isNaN(region_item_id)) {
        this.utils.errorFunction(ctx);
        return;
      }
      ctx.session.stadion.region_item_id = region_item_id;
      ctx.session.stadion.step = 2;
      await ctx.reply(this.i18n.translate('stadions.name', { lang }));
      ctx.session.stadion_step = 'stadion';
      ctx.session.stadion.name = 'N';
    } catch (error) {
      this.utils.errorFunction(ctx);
    }
  }

  @Action(/payments_(.+)/)
  async onPayments(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (
      ctx.session.stadion_step === 'stadion' &&
      ctx.session.stadion.payments === 'payments'
    ) {
      ctx.session.stadion.payments_type = ctx.callbackQuery.data.split(
        '_',
      )[1] as Payments;
      ctx.session.stadion.image = 'image';
      ctx.session.stadion.step = 9;
      ctx.reply(this.i18n.translate('stadions.image', { lang }), {
        reply_markup: {
          keyboard: [
            [{ text: this.i18n.translate('stadions.back', { lang }) }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      ctx.session.stadion.payments = null;
      return;
    } else {
      ctx.reply(this.i18n.translate('error.sesion', { lang }));
    }
  }

  @Action(/.+/)
  async parseAction(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    let data: {
      type: string;
      id: number;
      day: number;
      schedule_id: number;
      stadion_off: number;
      special_id: number;
      back: string;
    };
    const lang = await this.utils.langs(ctx);
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
      data = JSON.parse(ctx.callbackQuery.data);
    } catch (error) {
      this.utils.errorFunction(ctx);
      return;
    }
    switch (data.type) {
      case 'noob': {
        if (ctx.callbackQuery) {
          try {
            await ctx.answerCbQuery();
          } catch {}
        }
        return;
      }
      case 'Continue_back_stadion': {
        return this.userService.userbookingRegionItems(ctx, lang, data.id);
      }
      case 'user_back_regionItems': {
        return this.userService.userbookingRegion(ctx, lang, data.id);
      }
      case 'HELP_ABOUT':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.about', { lang }),
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;

      case 'HELP_START':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.start', { lang }),
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;

      case 'HELP_PAYMENT':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.payment', { lang }),
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;

      case 'HELP_CANCEL':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.cancel', { lang }),
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;

      case 'HELP_CONTACT':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.contact', { lang }),
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;

      case 'stadion':
        {
          try {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('schedule.name'),
              {
                inline_keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('schedule.working', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'schedule',
                        id: data.id,
                      }),
                    },
                    {
                      text: `${this.i18n.translate('schedule.price', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'price',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: `${this.i18n.translate('schedule.location', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'lokation',
                        id: data.id,
                      }),
                    },
                    {
                      text: `${this.i18n.translate('schedule.image', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'image',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: `${this.i18n.translate('stadions.menyu.all_data', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'all_data',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: `${this.i18n.translate('schedule.delete', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'delete',
                        id: data.id,
                      }),
                    },
                    {
                      text: `${this.i18n.translate('schedule.back', { lang })}`,
                      callback_data: JSON.stringify({
                        type: 'back_1',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'back_1':
        {
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
            try {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('stadions.stadion', { lang }),
                {
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
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
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
            try {
              await this.utils.safeEditOrReply(
                ctx,
                this.i18n.translate('stadions.select', { lang }),
                { inline_keyboard: button },
              );
            } catch (error) {
              this.utils.errorFunction(ctx);
            }
          }
        }
        break;
      case 'delete':
        {
          try {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('schedule.type.delet', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.type.yes', { lang }),
                      callback_data: JSON.stringify({
                        type: 'delete_yes',
                        id: data.id,
                      }),
                    },
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'back_2',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'delete_yes':
        {
          try {
            await this.prisma.stadion.delete({ where: { id: data.id } });
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
              try {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.stadion', { lang }),
                  {
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
                );
              } catch (error) {
                this.utils.errorFunction(ctx);
              }

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
              try {
                await this.utils.safeEditOrReply(
                  ctx,
                  this.i18n.translate('stadions.select', { lang }),
                  { inline_keyboard: button },
                );
              } catch (error) {
                ctx.reply(this.i18n.translate('error.error', { lang }));
              }
            }
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'back_2':
        {
          try {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('schedule.name'),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.working', { lang }),
                      callback_data: JSON.stringify({
                        type: 'schedule',
                        id: data.id,
                      }),
                    },
                    {
                      text: this.i18n.translate('schedule.price', { lang }),
                      callback_data: JSON.stringify({
                        type: 'price',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.location', { lang }),
                      callback_data: JSON.stringify({
                        type: 'lokation',
                        id: data.id,
                      }),
                    },
                    {
                      text: this.i18n.translate('schedule.image', { lang }),
                      callback_data: JSON.stringify({
                        type: 'image',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('stadions.menyu.all_data', {
                        lang,
                      }),
                      callback_data: JSON.stringify({
                        type: 'all_data',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.delete', { lang }),
                      callback_data: JSON.stringify({
                        type: 'delete',
                        id: data.id,
                      }),
                    },
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'back_1',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'schedule':
        {
          if (data.back === 'back') {
            ctx.session.step = null;
          }
          try {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('schedule.schedule.name', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.schedule.one_week', {
                        lang,
                      }),
                      callback_data: JSON.stringify({
                        type: 'week_schedule',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'schedule.schedule.dey_off_dey',
                        {
                          lang,
                        },
                      ),
                      callback_data: JSON.stringify({
                        type: 'day_off',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate(
                        'schedule.schedule.special_deys',
                        { lang },
                      ),
                      callback_data: JSON.stringify({
                        type: 'special_table',
                        id: data.id,
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: JSON.stringify({
                        type: 'back_2',
                        id: data.id,
                      }),
                    },
                  ],
                ],
              },
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'week_schedule': {
        return this.botService.renderScheduleMenu(ctx, data.id);
      }
      case 'add_schedule_day':
        {
          ctx.session.stadion.schedule_day = data.day;
          ctx.reply(
            this.i18n.translate('schedule.working_hours', {
              lang,
              args: {
                name: this.i18n.translate(`schedule.week_days.${data.day}`, {
                  lang,
                }),
              },
            }),
          );

          ctx.session.step = 'enter_schedule_time';
          ctx.session.stadion.id = data.id;
        }
        break;
      case 'add_schedule': {
        return this.botService.renderSchedule_week(ctx, data.id);
      }
      case 'view_schedule': {
        return this.botService.viewSchedule(ctx, data.id);
      }
      case 'delete_schedule_day':
        {
          try {
            await this.prisma.stadion_chedule.delete({
              where: { id: data.schedule_id },
            });
            ctx.session.step = null;
            ctx.session.stadion.id = null;
            ctx.session.stadion.schedule_id = null;
            return this.botService.viewSchedule(ctx, data.id);
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'edit_schedule':
        {
          ctx.session.stadion.schedule_day = data.day;
          ctx.reply(
            this.i18n.translate(`schedule.update_hours`, {
              lang,
              args: {
                day: this.i18n.translate(`schedule.week_days.${data.day}`, {
                  lang,
                }),
              },
            }),
          );
          ctx.session.step = 'edit_schedule_time';
          ctx.session.stadion.id = data.id;
          ctx.session.stadion.schedule_id = data.schedule_id;
        }
        break;
      case 'day_off': {
        return this.botService.stadion_off_days(ctx, data.id);
      }
      case 'off_stadion':
        {
          ctx.session.step = 'add_off_stadion_week';
          ctx.session.stadion.id = data.id;
          await ctx.reply(
            this.i18n.translate('schedule.off_day.add_day', { lang }),
          );
        }
        break;
      case 'week_edit':
        {
          ctx.session.step = 'week_edit';
          ctx.session.stadion.off = data.stadion_off;
          ctx.session.stadion.id = data.id;
          await ctx.reply(
            this.i18n.translate('schedule.off_day.add_day', { lang }),
          );
        }
        break;
      case 'delete_week':
        {
          try {
            await this.prisma.stadion_off_days.delete({
              where: { id: data.stadion_off },
            });
            return this.botService.stadion_off_days(ctx, data.id);
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'special_table': {
        return this.botService.stadion_special(ctx, data.id);
      }
      case 'add_special':
        {
          ctx.session.step = 'add_special';
          ctx.session.stadion.id = data.id;
          await ctx.reply(this.i18n.translate('schedule.specile', { lang }));
        }
        break;
      case 'special_edit':
        {
          ctx.session.step = 'edit_specile';
          ctx.session.stadion.id = data.id;
          ctx.session.stadion.schedule_id = data.special_id;
          await ctx.reply(this.i18n.translate('schedule.update', { lang }));
        }
        break;

      case 'special_delet': {
        try {
          await this.prisma.stadion_special_schedule.delete({
            where: { id: data.special_id },
          });
          return this.botService.stadion_special(ctx, data.id);
        } catch (error) {
          this.utils.errorFunction(ctx);
        }
      }
      case 'lokation': {
        return this.botService.location(ctx, data.id);
      }
      case 'update_location':
        {
          ctx.session.step = 'location';
          ctx.session.stadion.id = data.id;
          ctx.reply(this.i18n.translate('stadions.location', { lang }), {
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
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          });
        }
        break;
      case 'price': {
        return this.botService.stadion_price(ctx, data.id);
      }
      case 'Update_price':
        {
          ctx.session.step = 'price';
          ctx.session.stadion.id = data.id;
          ctx.reply(this.i18n.translate('stadions.price', { lang }));
        }
        break;
      case 'image': {
        return this.botService.stadion_image(ctx, data.id);
      }
      case 'update_image':
        {
          ((ctx.session.step = 'image'), (ctx.session.stadion.id = data.id));
          ctx.reply(this.i18n.translate('stadions.image', { lang }));
        }
        break;
      case 'all_data': {
        return this.botService.all_data(ctx, data.id);
      }
      case 'language':
        {
          ctx.reply(this.i18n.translate('common.START', { lang }), {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🇺🇿 O'zbekcha", callback_data: 'lang_uz' }],
                [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
                [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: JSON.stringify({
                      type: 'phone_back',
                      id: data.id,
                    }),
                  },
                ],
              ],
            },
          });
          ctx.session.step = 'language';
        }
        break;
      case 'phone': {
        return this.ownerService.ownerContakt(ctx, data.id);
      }
      case 'phone_back':
        {
          try {
            await this.utils.safeEditOrReply(
              ctx,
              this.i18n.translate('settings.title', { lang }),
              {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('settings.language', { lang }),
                      callback_data: JSON.stringify({
                        id: data.id,
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
                        id: data.id,
                        type: 'notification',
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('settings.phone', { lang }),
                      callback_data: JSON.stringify({
                        id: data.id,
                        type: 'phone',
                      }),
                    },
                  ],
                  [
                    {
                      text: this.i18n.translate('settings.account', { lang }),
                      callback_data: JSON.stringify({
                        id: data.id,
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
            );
          } catch (error) {
            this.utils.errorFunction(ctx);
          }
        }
        break;
      case 'phone_update':
        {
          if (!ctx.session.owner_registor) {
            ctx.session.owner_registor = {
              email: null,
              full_name: null,
              id: 0,
              phone: null,
              step: null,
            };
          }
          ctx.session.owner_registor.phone = 'update_phone';
          ctx.session.owner_registor.id = data.id;
          ctx.reply(this.i18n.translate('registor.phone', { lang }));
        }
        break;
      default: {
        return;
      }
    }
  }

  @On('contact')
  async onContact(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.session.step == 'owner_registor') {
      return this.ownerService.registor_step(ctx, lang);
    }
    if (ctx.session.step == 'user_registor') {
      return this.userService.registor_step(ctx, lang);
    }
  }
  @On('location')
  async onLocation(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    if (ctx.session.stadion_step === 'stadion') {
      if (ctx.session.stadion.lockation === 'L') {
        if (ctx.message && 'location' in ctx.message) {
          const { latitude, longitude } = ctx.message.location;
          ctx.session.stadion.latitude = latitude;
          ctx.session.stadion.longitude = longitude;
          ctx.session.stadion.lockation = null;
          ctx.session.stadion.step = 4;
          await ctx.reply(
            this.i18n.translate('stadions.location_text', { lang }),
            {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: this.i18n.translate('stadions.back', { lang }),
                    },
                  ],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            },
          );
          ctx.session.stadion.max_count = 0;
          return;
        }
        await ctx.reply(
          this.i18n.translate('stadions.location_else', { lang }),
        );
        return;
      }
    }
    if (ctx.session.step === 'location') {
      if (ctx.message && 'location' in ctx.message) {
        const { latitude, longitude } = ctx.message.location;
        try {
          await this.prisma.stadion.update({
            where: { id: Number(ctx.session.stadion.id) },
            data: { latitude, longitude },
          });
          await ctx.reply(
            this.i18n.translate('stadions.menyu.update', { lang }),
          );
          ctx.session.step = null;
          return this.botService.location(ctx, Number(ctx.session.stadion.id));
        } catch (error) {
          this.utils.errorFunction(ctx);
        }
      }
    } else {
      ctx.reply(this.i18n.translate('error.warning_locate', { lang }));
    }
  }
  @On('photo')
  async onPhoto(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
    try {
      if (
        ctx.session.stadion_step === 'stadion' &&
        ctx.session.stadion.image === 'image'
      ) {
        if (
          ctx.message &&
          'photo' in ctx.message &&
          ctx.message.photo.length > 0
        ) {
          const image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          ctx.session.stadion.image = image;
          ctx.session.stadion.step = 10;
          ctx.session.stadion_step = null;
          return this.botService.createStadion(ctx);
        }
      }
      if (ctx.session.step === 'image') {
        if (
          ctx.message &&
          'photo' in ctx.message &&
          ctx.message.photo.length > 0
        ) {
          const image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          const stadion = await this.prisma.stadion.update({
            where: { id: Number(ctx.session.stadion.id) },
            data: { image },
          });
          ctx.reply(
            this.i18n.translate('stadions.menyu.image_update', { lang }),
          );
          ctx.session.step = null;
          return this.botService.stadion_image(ctx, stadion.id);
        }
      } else {
        ctx.reply(this.i18n.translate('error.warning_image', { lang }));
      }
    } catch (error) {
      ctx.session.step = null;
      this.utils.errorFunction(ctx);
    }
  }
  @On('message')
  async Message(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);

    ctx.session.stadion = ctx.session.stadion || {
      image: null,
      length: null,
      lockation: null,
      name: null,
      owner_id: null,
      max_count: null,
      payments_type: null,
      latitude: null,
      longitude: null,
      price: null,
      region_id: null,
      region_item_id: null,
      width: null,
      id: null,
      schedule_day: null,
      step: null,
      special: null,
      schedule_id: null,
      off: null,
    };

    ctx.session.owner_registor = ctx.session.owner_registor || {
      email: null,
      full_name: null,
      id: 0,
      phone: null,
      step: null,
    };
    ctx.session.user_registor = ctx.session.user_registor || {
      phone: null,
      full_name: null,
      step: null,
      id: 0,
    };
    try {
      if (!ctx.message || !('text' in ctx.message)) return;

      const text = ctx.message.text.trim();

      if (text.startsWith('checkin_ADMIN_')) {
        const token = text.replace('checkin_ADMIN_', '');
        try {
          const data = this.qrservice.verifyQr(token);

          if (!data) {
            ctx.reply(this.i18n.translate('error.qr_error', { lang }), {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: this.i18n.translate('schedule.back', { lang }),
                      callback_data: 'errorBack_1',
                    },
                  ],
                ],
              },
            });
            return;
          }

          const booking = await this.prisma.booking.findUnique({
            where: { id: data.bookingId },
            include: {
              stadion: {
                include: {
                  owner: {
                    select: {
                      chatID: true,
                    },
                  },
                },
              },
            },
          });

          if (!booking) {
            ctx.reply(
              this.i18n.translate('error.booking_not_found', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }
          if (String(ctx.from?.id) !== booking.stadion.owner.chatID) {
            ctx.reply(
              this.i18n.translate('error.not_admin_for_stadion', { lang }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }

          if (
            (booking.payment_method === 'CARD' && booking.status !== 'PAID') ||
            (booking.payment_method === 'CASH' &&
              booking.status !== 'CONFIRMED')
          ) {
            ctx.reply(
              this.i18n.translate('error.payment_unpaid_or_unconfirmed', {
                lang,
              }),
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: this.i18n.translate('schedule.back', { lang }),
                        callback_data: 'errorBack_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }

          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { check_in: true },
          });

          ctx.reply(this.i18n.translate('success.user_checked_in', { lang }), {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: this.i18n.translate('schedule.back', { lang }),
                    callback_data: 'errorBack_1',
                  },
                ],
              ],
            },
          });
          return;
        } catch (error) {
          await this.utils.errorFunction(ctx);
        }
      }

      if (ctx.session.step === 'menyu') {
        await ctx.reply(
          this.i18n.translate('common.WELCOME', { lang }),
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
        ctx.session.step = null;
        ctx.session.stadion_step = null;
        return;
      }
      if (ctx.session.step === 'registor') {
        if (
          text === `💼 ${this.i18n.translate('registor.button.0', { lang })}`
        ) {
          return this.ownerService.registor(ctx, lang);
        } else if (
          text === `🏃🏼 ${this.i18n.translate('registor.button.1', { lang })}`
        ) {
          return this.userService.registor(ctx, lang);
        } else {
          ctx.reply(this.i18n.translate('error.worning', { lang }));
          return;
        }
      }

      if (ctx.session.step === 'owner_registor') {
        return this.ownerService.registor_step(ctx, lang);
      }
      if (ctx.session.step === 'user_registor') {
        return this.userService.registor_step(ctx, lang);
      }

      switch (text) {
        case this.i18n.translate('menyu_buttons.stadion', { lang }):
          return this.ownerService.handleStadionMenu(ctx, lang);

        case this.i18n.translate('menyu_buttons.bron', { lang }):
          return this.ownerService.owner_Bron(ctx, lang);

        case this.i18n.translate('menyu_buttons.card', { lang }):
          return this.ownerService.owner_card(ctx, lang);

        case this.i18n.translate('menyu_buttons.settings', { lang }):
          if (await this.utils.isChecket(String(ctx.from?.id), ctx)) {
            return this.ownerService.ownerSettings(ctx, lang);
          } else {
            return this.userService.settings(ctx, lang);
          }

        case this.i18n.translate('menyu_buttons.help', { lang }):
          if (await this.utils.isChecket(String(ctx.from?.id), ctx)) {
            ctx.reply(
              this.i18n.translate('help.help.title', { lang }),
              helpMenuKeyboard(this.i18n, lang),
            );
            return;
          } else {
            return this.userService.userHelp(ctx, lang);
          }
        case this.i18n.translate('menyu_buttons.user_stadion_booking', {
          lang,
        }):
          return this.userService.userBooking(ctx, lang);

        case this.i18n.translate('stadions.back', { lang }):
          if (ctx.session.stadion.step) {
            return this.ownerService.handleStadionBack(ctx, lang);
          } else {
            return this.botService.checket(ctx);
          }
      }

      if (ctx.session.owner_registor.phone === 'update_phone') {
        return this.ownerService.updatePhone(ctx, lang, text);
      }

      if (ctx.session.stadion_step === 'stadion') {
        return this.ownerService.handleStadionSteps(ctx, lang, text);
      }

      if (ctx.session.user_registor.phone === 'phone') {
        return this.userService.userUpdate_phone(ctx, lang, text);
      }

      if (
        ctx.session.step &&
        [
          'enter_schedule_time',
          'edit_schedule_time',
          'special_time',
          'special_time_edit',
        ].includes(ctx.session.step)
      ) {
        return this.ownerService.handleSchedule(ctx, lang, text);
      }

      if (
        ctx.session.step &&
        [
          'add_off_stadion_week',
          'add_special',
          'week_edit',
          'edit_specile',
        ].includes(ctx.session.step)
      ) {
        return this.ownerService.handleOffDays(ctx, lang, text);
      }

      if (ctx.session.step === 'price') {
        return this.ownerService.handlePrice(ctx, lang, text);
      }

      ctx.reply(this.i18n.translate('error.else', { lang, args: { text } }));
    } catch (error) {
      this.utils.errorFunction(ctx);
      console.log(error);
    }
  }
}
