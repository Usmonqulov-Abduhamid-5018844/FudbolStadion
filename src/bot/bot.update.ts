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

@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly ownerService: OwnersService,
    private readonly userService: UsersService,
    private readonly utils: UtilisService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: MyContext) {
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
    if (ctx.session.step === 'language') {
      const lang = await this.utils.langs(ctx);
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
    } else {
      return this.botService.checket(ctx);
    }
  }
  @Action(/back_owner_(.+)/)
  async backup(@Ctx() ctx: MyContext) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch {}
    }
    const lang = await this.utils.langs(ctx);
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const back_type = ctx.callbackQuery.data.split('_')[2];
      switch (back_type) {
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
                where: { owner_id: owner.id },
              });
              if (!stadion.length) {
                await ctx.reply(
                  this.i18n.translate('stadions.stadion', { lang }),
                  {
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
                  { text: `🏟 ${s.name}`, callback_data: `stadion_${s.id}` },
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
              ctx.reply(this.i18n.translate('error.error', { lang }));
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
              ctx.reply(this.i18n.translate('error.error', { lang }));
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
              await this.utils.safeEditHelpMenyuReply(
                ctx,
                this.i18n.translate('help.help.title', { lang }),
              );
            } catch (error) {
              ctx.reply(this.i18n.translate('error.error', { lang }));
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
          }
          break;
        case '6': {
          return this.ownerService.registor(ctx);
        }
        default: {
          break;
        }
      }
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
        ctx.reply(this.i18n.translate('error.error', { lang }));
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
      ctx.reply(this.i18n.translate('error.error', { lang }));
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
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      const region_items = await this.prisma.region_item.findMany({
        where: {
          region_id: regionId,
        },
      });

      if (!region_items.length) {
        ctx.reply(this.i18n.translate('error.error', { lang }));
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
      ctx.reply(this.i18n.translate('error.error', { lang }));
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
        ctx.reply(this.i18n.translate('error.error', { lang }));
        return;
      }
      ctx.session.stadion.region_item_id = region_item_id;
      ctx.session.stadion.step = 2;
      await ctx.reply(this.i18n.translate('stadions.name', { lang }));
      ctx.session.stadion_step = 'stadion';
      ctx.session.stadion.name = 'N';
    } catch (error) {
      ctx.reply(this.i18n.translate('error.error', { lang }));
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

  //Test Actioin
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
      ctx.reply(
        this.i18n.translate('error.error', {
          lang,
        }),
      );
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
      case 'HELP_ABOUT':
        {
          try {
            await this.utils.safeEditHelpReply(
              ctx,
              this.i18n.translate('help.help.about', { lang }),
            );
          } catch (error) {
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
              ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
                ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
          ctx.reply(this.i18n.translate('error.error', { lang }));
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
            ctx.reply(this.i18n.translate('error.error', { lang }));
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
    if (ctx.session.step == 'owner_registor') {
      return this.ownerService.registor_step(ctx);
    }
    if (ctx.session.step == 'user_registor') {
      return this.userService.registor_step(ctx);
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
          ctx.reply(this.i18n.translate('error.error', { lang }));
        }
      }
    } else {
      ctx.reply(this.i18n.translate('error.warning_locate', { lang }));
    }
  }
  @On('photo')
  async onPhoto(@Ctx() ctx: MyContext) {
    const lang = await this.utils.langs(ctx);
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
        try {
          const stadion = await this.prisma.stadion.update({
            where: { id: Number(ctx.session.stadion.id) },
            data: { image },
          });
          ctx.reply(
            this.i18n.translate('stadions.menyu.image_update', { lang }),
          );
          ctx.session.step = null;
          return this.botService.stadion_image(ctx, stadion.id);
        } catch (error) {
          ctx.session.step = null;
          ctx.reply(this.i18n.translate('error.error', { lang }));
        }
      }
    } else {
      ctx.reply(this.i18n.translate('error.warning_image', { lang }));
    }
  }

  // @On('message')
  // async Message(@Ctx() ctx: MyContext) {
  //   const lang = await this.utils.langs(ctx);
  //   ctx.session.stadion = ctx.session.stadion || {
  //     image: null,
  //     length: null,
  //     lockation: null,
  //     name: null,
  //     owner_id: null,
  //     max_count: null,
  //     payments_type: null,
  //     latitude: null,
  //     longitude: null,
  //     price: null,
  //     region_id: null,
  //     region_item_id: null,
  //     width: null,
  //   };
  //   if (!ctx.session.owner_registor)
  //     ctx.session.owner_registor = {
  //       email: null,
  //       full_name: null,
  //       id: 0,
  //       phone: null,
  //       step: null,
  //     };

  //   try {
  //     if (ctx.message && 'text' in ctx.message) {
  //       if (ctx.session.step === 'menyu') {
  //         await ctx.reply(
  //           this.i18n.translate('common.WELCOME', {
  //             lang,
  //           }),
  //           Markup.keyboard([
  //             [
  //               this.i18n.translate('menyu_buttons.stadion', { lang }),
  //               this.i18n.translate('menyu_buttons.bron', { lang }),
  //             ],
  //             [
  //               this.i18n.translate('menyu_buttons.settings', { lang }),
  //               this.i18n.translate('menyu_buttons.help', { lang }),
  //             ],
  //             [this.i18n.translate('menyu_buttons.card', { lang })],
  //           ])
  //             .resize()
  //             .oneTime(),
  //         );
  //         ctx.session.step = null;
  //         ctx.session.stadion_step = null;
  //         ctx.session.stadion || {
  //           image: null,
  //           length: null,
  //           lockation: null,
  //           name: null,
  //           owner_id: null,
  //           max_count: null,
  //           payments_type: null,
  //           latitude: null,
  //           longitude: null,
  //           price: null,
  //           region_id: null,
  //           region_item_id: null,
  //           width: null,
  //           id: null,
  //           schedule_day: null,
  //         };
  //         return;
  //       }
  //       if (
  //         ctx.message.text === this.i18n.translate('stadions.back', { lang })
  //       ) {
  //         switch (ctx.session.stadion.step) {
  //           case 4: {
  //             await ctx.reply(
  //               this.i18n.translate('stadions.location', {
  //                 lang,
  //               }),
  //               {
  //                 reply_markup: {
  //                   keyboard: [
  //                     [
  //                       {
  //                         text: this.i18n.translate('stadions.send_location', {
  //                           lang,
  //                         }),
  //                         request_location: true,
  //                       },
  //                     ],
  //                   ],
  //                   resize_keyboard: true,
  //                   one_time_keyboard: true,
  //                 },
  //               },
  //             );

  //             ctx.session.stadion.lockation = 'L';
  //             return;
  //           }

  //           case 5: {
  //             await ctx.reply(
  //               this.i18n.translate('stadions.location_back', { lang }),
  //             );
  //             ctx.session.stadion.max_count = 0;
  //             return;
  //           }

  //           case 6: {
  //             ctx.session.stadion.length = 'length';
  //             ctx.session.stadion.step = 5;
  //             ctx.reply(this.i18n.translate('stadions.length', { lang }), {
  //               reply_markup: {
  //                 keyboard: [
  //                   [
  //                     {
  //                       text: this.i18n.translate('stadions.back', { lang }),
  //                     },
  //                   ],
  //                 ],
  //                 resize_keyboard: true,
  //                 one_time_keyboard: true,
  //               },
  //             });
  //             return;
  //           }
  //           case 7: {
  //             ctx.session.stadion.width = 'width';
  //             ctx.session.stadion.step = 6;
  //             ctx.reply(this.i18n.translate('stadions.width', { lang }), {
  //               reply_markup: {
  //                 keyboard: [
  //                   [
  //                     {
  //                       text: this.i18n.translate('stadions.back', { lang }),
  //                     },
  //                   ],
  //                 ],
  //                 resize_keyboard: true,
  //                 one_time_keyboard: true,
  //               },
  //             });
  //             return;
  //           }
  //           case 9: {
  //             ctx.session.stadion.payments = 'payments';
  //             ctx.session.stadion.step = 8;
  //             ctx.reply(
  //               this.i18n.translate('stadions.paymenst_type', { lang }),
  //               {
  //                 reply_markup: {
  //                   inline_keyboard: [
  //                     [
  //                       {
  //                         text: this.i18n.translate('stadions.card', { lang }),
  //                         callback_data: `payments_${Payments.CARD}`,
  //                       },
  //                     ],
  //                     [
  //                       {
  //                         text: this.i18n.translate('stadions.cash', { lang }),
  //                         callback_data: `payments_${Payments.CASH}`,
  //                       },
  //                     ],
  //                     [
  //                       {
  //                         text: this.i18n.translate('stadions.both', { lang }),
  //                         callback_data: `payments_${Payments.GIBRID}`,
  //                       },
  //                     ],
  //                     [
  //                       {
  //                         text: this.i18n.translate('stadions.back', { lang }),
  //                         callback_data: 'back_owner_4',
  //                       },
  //                     ],
  //                   ],
  //                 },
  //               },
  //             );
  //             return;
  //           }

  //           default: {
  //             break;
  //           }
  //         }
  //       }

  //       if (ctx.session.step == 'registor') {
  //         if (
  //           ctx.message.text ===
  //           `💼 ${this.i18n.translate('registor.button.0', { lang })}`
  //         ) {
  //           return this.ownerService.registor(ctx);
  //         } else if (
  //           ctx.message.text ===
  //           `🏃🏼 ${this.i18n.translate('registor.button.1', {
  //             lang,
  //           })}`
  //         ) {
  //           return this.userService.registor(ctx);
  //         } else {
  //           ctx.reply(this.i18n.translate('error.worning', { lang }));
  //         }
  //         return;
  //       }
  //       if (
  //         ctx.session.owner_registor.step === 'phone' &&
  //         ctx.message.text === this.i18n.translate('schedule.back', { lang })
  //       ) {
  //         ctx.session.owner_registor.step = 'email';
  //         ctx.reply(this.i18n.translate('registor.email', { lang }), {
  //           reply_markup: {
  //             inline_keyboard: [
  //               [
  //                 {
  //                   text: this.i18n.translate('schedule.back', { lang }),
  //                   callback_data: 'back_owner_6',
  //                 },
  //               ],
  //             ],
  //           },
  //         });
  //         return;
  //       }
  //       if (ctx.session.step == 'owner_registor') {
  //         return this.ownerService.registor_step(ctx);
  //       }
  //       if (ctx.session.step == 'user_registor') {
  //         return this.userService.registor_step(ctx);
  //       }

  //       if (
  //         ctx.message.text ===
  //         this.i18n.translate('menyu_buttons.stadion', { lang })
  //       ) {
  //         const owner = await this.prisma.owners.findUnique({
  //           where: { chatID: String(ctx.from?.id) },
  //         });
  //         if (!owner) {
  //           throw new Error();
  //         }
  //         const stadion = await this.prisma.stadion.findMany({
  //           where: { owner_id: owner.id },
  //           orderBy: { updatedAt: 'desc' },
  //         });
  //         if (!stadion.length) {
  //           await ctx.reply(this.i18n.translate('stadions.stadion', { lang }), {
  //             reply_markup: {
  //               inline_keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.add', { lang }),
  //                     callback_data: 'add_stadion',
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.back', { lang }),
  //                     callback_data: 'back_owner_1',
  //                   },
  //                 ],
  //               ],
  //             },
  //           });
  //           return;
  //         } else {
  //           const button: InlineKeyboardButton[][] = [];

  //           stadion.forEach((s) => {
  //             button.push([
  //               {
  //                 text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
  //                 callback_data: JSON.stringify({
  //                   type: 'stadion',
  //                   id: s.id,
  //                 }),
  //               },
  //             ]);
  //           });

  //           button.push(
  //             [
  //               {
  //                 text: this.i18n.translate('stadions.add', { lang }),
  //                 callback_data: 'add_stadion',
  //               },
  //             ],
  //             [
  //               {
  //                 text: this.i18n.translate('stadions.back', { lang }),
  //                 callback_data: 'back_owner_1',
  //               },
  //             ],
  //           );
  //           await ctx.reply(this.i18n.translate('stadions.select', { lang }), {
  //             reply_markup: { inline_keyboard: button },
  //           });
  //           return;
  //         }
  //       }

  //       if (ctx.session.stadion_step === 'stadion') {
  //         if (ctx.session.stadion.name === 'N') {
  //           ctx.session.stadion.name = ctx.message.text;
  //           ctx.session.stadion.step = 3;

  //           await ctx.reply(
  //             this.i18n.translate('stadions.location', {
  //               lang,
  //             }),
  //             {
  //               reply_markup: {
  //                 keyboard: [
  //                   [
  //                     {
  //                       text: this.i18n.translate('stadions.send_location', {
  //                         lang,
  //                       }),
  //                       request_location: true,
  //                     },
  //                   ],
  //                 ],
  //                 resize_keyboard: true,
  //                 one_time_keyboard: true,
  //               },
  //             },
  //           );

  //           ctx.session.stadion.lockation = 'L';
  //           return;
  //         }
  //         if (ctx.session.stadion.max_count === 0) {
  //           const input = ctx.message.text.trim();
  //           const count = Number(input);
  //           if (!/^\d+$/.test(input)) {
  //             await ctx.reply(
  //               this.i18n.translate('error.number_error', { lang }),
  //             );
  //             return;
  //           }

  //           if (count <= 0) {
  //             await ctx.reply(
  //               this.i18n.translate('error.positive_number', { lang }),
  //             );
  //             return;
  //           }
  //           ctx.session.stadion.max_count = count;
  //           ctx.session.stadion.length = 'length';
  //           ctx.session.stadion.step = 5;
  //           ctx.reply(this.i18n.translate('stadions.length', { lang }), {
  //             reply_markup: {
  //               keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.back', { lang }),
  //                   },
  //                 ],
  //               ],
  //               resize_keyboard: true,
  //               one_time_keyboard: true,
  //             },
  //           });
  //           return;
  //         }
  //         if (ctx.session.stadion.length === 'length') {
  //           const input = ctx.message.text.trim();
  //           const length = Number(input);
  //           if (!/^\d+$/.test(input)) {
  //             await ctx.reply(
  //               this.i18n.translate('error.number_error', { lang }),
  //             );
  //             return;
  //           }

  //           if (length <= 0) {
  //             await ctx.reply(
  //               this.i18n.translate('error.positive_number', { lang }),
  //             );
  //             return;
  //           }
  //           ctx.session.stadion.length = length;
  //           ctx.session.stadion.width = 'width';
  //           ctx.session.stadion.step = 6;
  //           ctx.reply(this.i18n.translate('stadions.width', { lang }), {
  //             reply_markup: {
  //               keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.back', { lang }),
  //                   },
  //                 ],
  //               ],
  //               resize_keyboard: true,
  //               one_time_keyboard: true,
  //             },
  //           });
  //           return;
  //         }
  //         if (ctx.session.stadion.width === 'width') {
  //           const input = ctx.message.text.trim();
  //           const width = Number(input);
  //           if (!/^\d+$/.test(input)) {
  //             await ctx.reply(
  //               this.i18n.translate('error.number_error', { lang }),
  //             );
  //             return;
  //           }

  //           if (width <= 0) {
  //             await ctx.reply(
  //               this.i18n.translate('error.positive_number', { lang }),
  //             );
  //             return;
  //           }
  //           ctx.session.stadion.width = width;
  //           ctx.session.stadion.price = 'price';
  //           ctx.session.stadion.step = 7;
  //           ctx.reply(this.i18n.translate('stadions.price', { lang }), {
  //             reply_markup: {
  //               keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.back', { lang }),
  //                   },
  //                 ],
  //               ],
  //               resize_keyboard: true,
  //               one_time_keyboard: true,
  //             },
  //           });
  //           return;
  //         }
  //         if (ctx.session.stadion.price === 'price') {
  //           const input = ctx.message.text.trim();
  //           const price = Number(input);

  //           if (!/^\d+$/.test(input)) {
  //             await ctx.reply(
  //               this.i18n.translate('error.number_error', { lang }),
  //             );
  //             return;
  //           }

  //           if (price <= 0) {
  //             await ctx.reply(
  //               this.i18n.translate('error.positive_number', { lang }),
  //             );
  //             return;
  //           }

  //           if (price > 1500000) {
  //             await ctx.reply(this.i18n.translate('error.too_large', { lang }));
  //             return;
  //           }

  //           ctx.session.stadion.price = price;
  //           ctx.session.stadion.payments = 'payments';
  //           ctx.session.stadion.step = 8;
  //           ctx.reply(this.i18n.translate('stadions.paymenst_type', { lang }), {
  //             reply_markup: {
  //               inline_keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.card', { lang }),
  //                     callback_data: `payments_${Payments.CARD}`,
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.cash', { lang }),
  //                     callback_data: `payments_${Payments.CASH}`,
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.both', { lang }),
  //                     callback_data: `payments_${Payments.GIBRID}`,
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('stadions.back', { lang }),
  //                     callback_data: 'back_owner_4',
  //                   },
  //                 ],
  //               ],
  //             },
  //           });
  //           return;
  //         }
  //       }
  //       if (
  //         ctx.session.step === 'enter_schedule_time' ||
  //         ctx.session.step === 'edit_schedule_time' ||
  //         ctx.session.step === 'special_time' ||
  //         ctx.session.step === 'special_time_edit'
  //       ) {
  //         const text = ctx.message.text?.trim();

  //         const timePattern =
  //           /^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)$/;
  //         const match = text.match(timePattern);

  //         if (!match) {
  //           ctx.reply(
  //             this.i18n.translate('schedule.schedules.format', { lang }),
  //           );
  //           return;
  //         }

  //         const startTime = `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
  //         const endTime = `${match[3].padStart(2, '0')}:${match[4].padStart(2, '0')}`;

  //         const toMinutes = (t: string) => {
  //           const [h, m] = t.split(':').map(Number);
  //           return h * 60 + m;
  //         };

  //         if (toMinutes(startTime) >= toMinutes(endTime)) {
  //           ctx.reply(
  //             this.i18n.translate('schedule.schedules.error', { lang }),
  //           );
  //           return;
  //         }

  //         try {
  //           if (ctx.session.step === 'special_time') {
  //             await this.prisma.stadion_special_schedule.create({
  //               data: {
  //                 date: new Date(ctx.session.stadion.special),
  //                 start_time: startTime,
  //                 end_time: endTime,
  //                 stadion_id: Number(ctx.session.stadion.id),
  //               },
  //             });
  //             await ctx.reply(
  //               this.i18n.translate('schedule.off_day.succses', { lang }),
  //             );
  //             ctx.session.step = null;
  //             return this.botService.stadion_special(
  //               ctx,
  //               Number(ctx.session.stadion.id),
  //             );
  //           }
  //           if (ctx.session.step === 'special_time_edit') {
  //             await this.prisma.stadion_special_schedule.update({
  //               where: {
  //                 id: Number(ctx.session.stadion.schedule_id),
  //               },
  //               data: {
  //                 stadion_id: Number(ctx.session.stadion.id),
  //                 start_time: startTime,
  //                 end_time: endTime,
  //                 date: ctx.session.stadion.special,
  //               },
  //             });
  //             await ctx.reply(
  //               this.i18n.translate('schedule.off_day.update', { lang }),
  //             );
  //             ctx.session.step = null;
  //             return this.botService.stadion_special(
  //               ctx,
  //               Number(ctx.session.stadion.id),
  //             );
  //           }
  //           if (ctx.session.step === 'edit_schedule_time') {
  //             await this.prisma.stadion_chedule.update({
  //               where: { id: Number(ctx.session.stadion.schedule_id) },
  //               data: { start_time: startTime, end_time: endTime },
  //             });

  //             await ctx.reply(
  //               this.i18n.translate('schedule.schedules.updated', { lang }),
  //             );
  //           } else {
  //             await this.prisma.stadion_chedule.create({
  //               data: {
  //                 stadion_id: Number(ctx.session.stadion.id),
  //                 day_of_week: Number(ctx.session.stadion.schedule_day),
  //                 start_time: startTime,
  //                 end_time: endTime,
  //               },
  //             });

  //             await ctx.reply(
  //               this.i18n.translate('schedule.schedules.creat', { lang }),
  //             );
  //           }
  //         } catch (error) {
  //           ctx.reply(
  //             this.i18n.translate('schedule.schedules.creat_error', { lang }),
  //           );
  //           return;
  //         }

  //         ctx.session.step = null;
  //         ctx.session.stadion.schedule_day = null;

  //         return this.botService.renderScheduleMenu(
  //           ctx,
  //           Number(ctx.session.stadion.id),
  //         );
  //       }
  //       if (
  //         ctx.session.step === 'add_off_stadion_week' ||
  //         ctx.session.step === 'add_special' ||
  //         ctx.session.step === 'week_edit' ||
  //         ctx.session.step === 'edit_specile'
  //       ) {
  //         const dateStr = ctx.message.text.trim();

  //         const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  //         if (!isValidFormat) {
  //           await ctx.reply(
  //             this.i18n.translate('schedule.off_day.format', { lang }),
  //           );
  //           return;
  //         }

  //         const [year, month, day] = dateStr.split('-').map(Number);
  //         const date = new Date(dateStr);

  //         const isRealDate =
  //           date.getFullYear() === year &&
  //           date.getMonth() + 1 === month &&
  //           date.getDate() === day;

  //         if (!isRealDate) {
  //           await ctx.reply(
  //             this.i18n.translate('schedule.off_day.not_fount_day', { lang }),
  //           );
  //           return;
  //         }
  //         if (ctx.session.step === 'add_special') {
  //           await ctx.reply(
  //             this.i18n.translate('schedule.time_specile', { lang }),
  //           );
  //           ctx.session.stadion.special = date;
  //           ctx.session.step = 'special_time';
  //           return;
  //         }
  //         if (ctx.session.step === 'edit_specile') {
  //           await ctx.reply(
  //             this.i18n.translate('schedule.update_time', { lang }),
  //           );
  //           ctx.session.stadion.special = date;
  //           ctx.session.step = 'special_time_edit';
  //           return;
  //         }

  //         try {
  //           if (ctx.session.step === 'week_edit') {
  //             await this.prisma.stadion_off_days.update({
  //               where: { id: Number(ctx.session.stadion.off) },
  //               data: { date },
  //             });
  //             await ctx.reply(
  //               this.i18n.translate('schedule.off_day.update', { lang }),
  //             );
  //             ctx.session.step = null;
  //             return this.botService.stadion_off_days(
  //               ctx,
  //               Number(ctx.session.stadion.id),
  //             );
  //           }

  //           await this.prisma.stadion_off_days.create({
  //             data: {
  //               stadion_id: Number(ctx.session.stadion.id),
  //               date: date,
  //             },
  //           });

  //           await ctx.reply(
  //             this.i18n.translate('schedule.off_day.succses', { lang }),
  //           );
  //           ctx.session.step = null;
  //           return this.botService.stadion_off_days(
  //             ctx,
  //             Number(ctx.session.stadion.id),
  //           );
  //         } catch (e) {
  //           await ctx.reply(
  //             this.i18n.translate('schedule.off_day.error', { lang }),
  //           );
  //         }

  //         return;
  //       }
  //       if (ctx.session.step === 'price') {
  //         const input = ctx.message.text.trim();
  //         const price = Number(input);

  //         if (!/^\d+$/.test(input)) {
  //           await ctx.reply(
  //             this.i18n.translate('error.number_error', { lang }),
  //           );
  //           return;
  //         }

  //         if (price <= 0) {
  //           await ctx.reply(
  //             this.i18n.translate('error.positive_number', { lang }),
  //           );
  //           return;
  //         }

  //         if (price > 1500000) {
  //           await ctx.reply(this.i18n.translate('error.too_large', { lang }));
  //           return;
  //         }
  //         try {
  //           const stadion = await this.prisma.stadion.update({
  //             where: { id: Number(ctx.session.stadion.id) },
  //             data: { price },
  //           });
  //           return this.botService.stadion_price(ctx, stadion.id);
  //         } catch (error) {
  //           ctx.reply(this.i18n.translate('error.error', { lang }));
  //         }
  //       }
  //       if (
  //         ctx.message.text ===
  //           this.i18n.translate('menyu_buttons.settings', { lang }) &&
  //         (await this.utils.isChecket(String(ctx.from?.id), ctx))
  //       ) {
  //         try {
  //           const owner = await this.prisma.owners.findUnique({
  //             where: { chatID: String(ctx.from?.id) },
  //           });
  //           if (!owner) {
  //             ctx.reply(this.i18n.translate('error.error', { lang }));
  //             return;
  //           }

  //           ctx.reply(this.i18n.translate('settings.title', { lang }), {
  //             reply_markup: {
  //               inline_keyboard: [
  //                 [
  //                   {
  //                     text: this.i18n.translate('settings.language', { lang }),
  //                     callback_data: JSON.stringify({
  //                       id: owner.id,
  //                       type: 'language',
  //                     }),
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('settings.notification', {
  //                       lang,
  //                     }),
  //                     callback_data: JSON.stringify({
  //                       id: owner.id,
  //                       type: 'notification',
  //                     }),
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('settings.phone', { lang }),
  //                     callback_data: JSON.stringify({
  //                       id: owner.id,
  //                       type: 'phone',
  //                     }),
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('settings.account', { lang }),
  //                     callback_data: JSON.stringify({
  //                       id: owner.id,
  //                       type: 'account',
  //                     }),
  //                   },
  //                 ],
  //                 [
  //                   {
  //                     text: this.i18n.translate('schedule.back', { lang }),
  //                     callback_data: 'back_owner_1',
  //                   },
  //                 ],
  //               ],
  //             },
  //           });
  //           return;
  //         } catch (error) {
  //           ctx.reply(this.i18n.translate('error.error', { lang }));
  //         }
  //       }
  //       if (ctx.session.owner_registor.phone === 'update_phone') {
  //         try {
  //           const phone = ctx.message.text?.trim();

  //           const phoneRegex = /^(?:\+998|998)?[0-9]{9}$/;

  //           if (!phone || !phoneRegex.test(phone)) {
  //             ctx.reply(this.i18n.translate('error.phone_invalid', { lang }));
  //             return;
  //           }

  //           let normalizedPhone = phone;

  //           if (phone.length === 9) {
  //             normalizedPhone = `+998${phone}`;
  //           } else if (phone.startsWith('998')) {
  //             normalizedPhone = `+${phone}`;
  //           }

  //           ctx.session.owner_registor.phone = null;
  //           const id = Number(ctx.session.owner_registor.id);

  //           await this.prisma.owners.update({
  //             where: { id },
  //             data: { phone: normalizedPhone },
  //           });
  //           ctx.reply(this.i18n.translate('success.phone_updated', { lang }));
  //           return this.ownerService.ownerContakt(ctx, id);
  //         } catch (error) {
  //           ctx.reply(this.i18n.translate('error.error', { lang }));
  //         }
  //       }
  //       if (
  //         ctx.message.text ===
  //           this.i18n.translate('menyu_buttons.help', { lang }) &&
  //         (await this.utils.isChecket(String(ctx.from?.id), ctx))
  //       ) {
  //         ctx.reply(
  //           this.i18n.translate('help.help.title', { lang }),
  //           helpMenuKeyboard(this.i18n, String(lang)),
  //         );
  //       }
  //       if (ctx.message.text === this.i18n.translate('menyu_buttons.bron')) {
  //         return this.ownerService.owner_Bron(ctx, lang);
  //       }
  //       if (
  //         ctx.message.text ===
  //         this.i18n.translate('menyu_buttons.card', { lang })
  //       ) {
  //         return this.ownerService.owner_card(ctx, lang);
  //       } else {
  //         ctx.reply(
  //           this.i18n.translate('error.else', {
  //             lang,
  //             args: { text: ctx.message.text },
  //           }),
  //         );
  //       }
  //     }
  //   } catch (error) {
  //     ctx.reply(this.i18n.translate('error.error', { lang }));
  //   }
  // }


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

    try {
      if (!ctx.message || !('text' in ctx.message)) return;

      const text = ctx.message.text.trim();

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
          return this.ownerService.registor(ctx);
        } else if (
          text === `🏃🏼 ${this.i18n.translate('registor.button.1', { lang })}`
        ) {
          return this.userService.registor(ctx);
        } else {
           ctx.reply(this.i18n.translate('error.worning', { lang }));
           return
        }
      }

      if (ctx.session.step === 'owner_registor') {
        return this.ownerService.registor_step(ctx);
      }
      if (ctx.session.step === 'user_registor') {
        return this.userService.registor_step(ctx);
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
          }
          break;

        case this.i18n.translate('menyu_buttons.help', { lang }):
          if (await this.utils.isChecket(String(ctx.from?.id), ctx)) {
             ctx.reply(
              this.i18n.translate('help.help.title', { lang }),
              helpMenuKeyboard(this.i18n, lang),
            );
            return
          }
          break;
      }

      if (ctx.session.owner_registor.phone === 'update_phone') {
        return this.ownerService.updatePhone(ctx, lang, text);
      }

      if (ctx.session.stadion_step === 'stadion') {
        return this.ownerService.handleStadionSteps(ctx, lang, text);
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

      if (
        ctx.message.text === this.i18n.translate('stadions.back', { lang }) &&
        ctx.session.stadion.step
      ) {
        return this.ownerService.handleStadionBack(ctx, lang);
      }

       ctx.reply(
        this.i18n.translate('error.else', { lang, args: { text } }),
      );
    } catch (error) {
      console.error(error);
      return ctx.reply(this.i18n.translate('error.error', { lang }));
    }
  }
}
