import { I18nService } from 'nestjs-i18n';
import { BotService } from './bot.service';
import { Action, Ctx, Hears, On, Start, Update } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { OwnersService } from 'src/owners/owners.service';
import { UsersService } from 'src/users/users.service';
import { InlineKeyboardButton } from 'telegraf/types';
import { Markup } from 'telegraf';
import { Payments } from '@prisma/client';

@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly ownerService: OwnersService,
    private readonly userService: UsersService,
  ) {}

  @Start()
  onStart(@Ctx() ctx: MyContext) {
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
    return this.botService.start(ctx);
  }
  @Action(/lang_(.+)/)
  async language(@Ctx() ctx: MyContext) {
    ctx.answerCbQuery();
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      ctx.session = ctx.session || {};
      ctx.session.lang = (ctx.callbackQuery?.data).split('_')[1];
    }
    return this.botService.checket(ctx);
  }
  @Action(/back_owner_(.+)/)
  async backup(@Ctx() ctx: MyContext) {
    ctx.answerCbQuery();
    const lang = ctx.session.lang || ctx.from?.language_code;
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const back_type = ctx.callbackQuery.data.split('_')[2];
      switch (back_type) {
        case '1':
          {
            ctx.reply(
              `${this.i18n.translate('menyu_buttons.menu', { lang })}`,
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
                  `${this.i18n.translate('stadions.stadion', { lang })}`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: `${this.i18n.translate('stadions.add', { lang })}`,
                            callback_data: 'add_stadion',
                          },
                        ],
                        [
                          {
                            text: `${this.i18n.translate('stadions.back', { lang })}`,
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
                    text: `${this.i18n.translate('stadions.add', { lang })}`,
                    callback_data: 'add_stadion',
                  },
                ],
                [
                  {
                    text: `${this.i18n.translate('stadions.back', { lang })}`,
                    callback_data: 'back_owner_1',
                  },
                ],
              );
              await ctx.reply(
                `${this.i18n.translate('stadions.select', { lang })}`,
                {
                  reply_markup: { inline_keyboard: button },
                },
              );
            } catch (error) {
              ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
            }
          }
          break;
        case '3':
          {
            ctx.answerCbQuery();
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
                  text: `${this.i18n.translate('stadions.back', { lang })}`,
                  callback_data: 'back_owner_2',
                },
              ]);

              await ctx.reply(
                `${this.i18n.translate('stadions.stadion_region', { lang })}`,
                {
                  reply_markup: { inline_keyboard: button },
                },
              );
            } catch (error) {
              ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
            }
          }
          break;
        case '4':
          {
            ctx.session.stadion.price = 'price';
            ctx.session.stadion.step = 7;
            ctx.reply(`${this.i18n.translate('stadions.price', { lang })}`, {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('stadions.back', { lang })}`,
                    },
                  ],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            });
          }
          break;
        default: {
          break;
        }
      }
    }
  }
  @Action(/add_stadion/)
  async add_stadion(@Ctx() ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;
    ctx.answerCbQuery();
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
          text: `${this.i18n.translate('stadions.back', { lang })}`,
          callback_data: 'back_owner_2',
        },
      ]);

      await ctx.reply(
        `${this.i18n.translate('stadions.stadion_region', { lang })}`,
        {
          reply_markup: { inline_keyboard: button },
        },
      );
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  @Action(/region_(.+)/)
  async region_items(@Ctx() ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
      ctx.answerCbQuery();
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const regionId: number = parseInt(
        ctx.callbackQuery.data.split('_')[1],
        10,
      );
      if (isNaN(regionId)) {
        ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
        return;
      }
      const region_items = await this.prisma.region_item.findMany({
        where: {
          region_id: regionId,
        },
      });

      if (!region_items.length) {
        ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
        return;
      }
      ctx.session.stadion.region_id = regionId;
      ctx.session.stadion.step = 1;
      const button: InlineKeyboardButton[][] = region_items.map((item) => [
        { text: item.name, callback_data: `regions_item_${item.id}` },
      ]);
      button.push([
        {
          text: `${this.i18n.translate('stadions.back')}`,
          callback_data: 'back_owner_3',
        },
      ]);
      ctx.reply(`${this.i18n.translate('stadions.region_items', { lang })}`, {
        reply_markup: { inline_keyboard: button },
      });
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }

  @Action(/regions_item_(.+)/)
  async onStadions(@Ctx() ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
      ctx.answerCbQuery();

      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const region_item_id: number = parseInt(
        ctx.callbackQuery.data.split('_')[2],
        10,
      );

      if (isNaN(region_item_id)) {
        ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
        return;
      }
      ctx.session.stadion.region_item_id = region_item_id;
      ctx.session.stadion.step = 2;
      await ctx.reply(`${this.i18n.translate('stadions.name', { lang })}`);
      ctx.session.stadion_step = 'stadion';
      ctx.session.stadion.name = 'N';
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }

  @Action(/payments_(.+)/)
  async onPayments(@Ctx() ctx: MyContext) {
    ctx.answerCbQuery();
    const lang = ctx.session.lang || ctx.from?.language_code;
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
      ctx.reply(`${this.i18n.translate('stadions.image', { lang })}`, {
        reply_markup: {
          keyboard: [
            [{ text: `${this.i18n.translate('stadions.back', { lang })}` }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      ctx.session.stadion.payments = null;
      return;
    } else {
      ctx.reply(`${this.i18n.translate('error.sesion', { lang })}`);
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
    const lang = ctx.session.lang || ctx.from?.language_code;
    if (ctx.session.stadion_step === 'stadion') {
      if (ctx.session.stadion.lockation === 'L') {
        if (ctx.message && 'location' in ctx.message) {
          const { latitude, longitude } = ctx.message.location;
          ctx.session.stadion.latitude = latitude;
          ctx.session.stadion.longitude = longitude;
          ctx.session.stadion.lockation = null;
          ctx.session.stadion.step = 4;
          await ctx.reply(
            `${this.i18n.translate('stadions.location_text', { lang })}`,
            {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('stadions.back', { lang })}`,
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
          `${this.i18n.translate('stadions.location_else', { lang })}`,
        );
        return;
      }
    } else {
      ctx.reply(`${this.i18n.translate('error.warning_locate', { lang })}`);
    }
  }
  @On('photo')
  async onPhoto(@Ctx() ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;
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
    } else {
      ctx.reply(`${this.i18n.translate('error.warning_image', { lang })}`);
    }
  }

  @On('message')
  async Message(@Ctx() ctx: MyContext) {
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
    };
    const lang = ctx.session.lang || ctx.from?.language_code;
    try {
      if (ctx.message && 'text' in ctx.message) {
        if (ctx.session.step === 'menyu') {
          await ctx.reply(
            `${this.i18n.translate('common.WELCOME', {
              lang: ctx.session.lang || ctx.from?.language_code,
            })}`,
            Markup.keyboard([
              [
                `${this.i18n.translate('menyu_buttons.stadion', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                `${this.i18n.translate('menyu_buttons.bron', { lang: ctx.session.lang || ctx.from?.language_code })}`,
              ],
              [
                `${this.i18n.translate('menyu_buttons.settings', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                `${this.i18n.translate('menyu_buttons.help', { lang: ctx.session.lang || ctx.from?.language_code })}`,
              ],
            ])
              .resize()
              .oneTime(),
          );
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
          return
        }
        if (
          ctx.message.text ===
          `${this.i18n.translate('stadions.back', { lang })}`
        ) {
          switch (ctx.session.stadion.step) {
            case 4: {
              await ctx.reply(
                `${this.i18n.translate('stadions.location', {
                  lang,
                })}`,
                {
                  reply_markup: {
                    keyboard: [
                      [
                        {
                          text: `${this.i18n.translate(
                            'stadions.send_location',
                            {
                              lang,
                            },
                          )}`,
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
                `${this.i18n.translate('stadions.location_back', { lang })}`,
              );
              ctx.session.stadion.max_count = 0;
              return;
            }

            case 6: {
              ctx.session.stadion.length = 'length';
              ctx.session.stadion.step = 5;
              ctx.reply(`${this.i18n.translate('stadions.length', { lang })}`, {
                reply_markup: {
                  keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.back', { lang })}`,
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
              ctx.reply(`${this.i18n.translate('stadions.width', { lang })}`, {
                reply_markup: {
                  keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.back', { lang })}`,
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
              ctx.reply(
                `${this.i18n.translate('stadions.paymenst_type', { lang })}`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: `${this.i18n.translate('stadions.card', { lang })}`,
                          callback_data: `payments_${Payments.CARD}`,
                        },
                      ],
                      [
                        {
                          text: `${this.i18n.translate('stadions.cash', { lang })}`,
                          callback_data: `payments_${Payments.CASH}`,
                        },
                      ],
                      [
                        {
                          text: `${this.i18n.translate('stadions.both', { lang })}`,
                          callback_data: `payments_${Payments.GIBRID}`,
                        },
                      ],
                      [
                        {
                          text: `${this.i18n.translate('stadions.back', { lang })}`,
                          callback_data: 'back_owner_4',
                        },
                      ],
                    ],
                  },
                },
              );
              return;
            }

            default: {
              break;
            }
          }
        }

        if (ctx.session.step == 'registor') {
          if (
            ctx.message.text ===
            `💼 ${this.i18n.translate('registor.button.0', { lang })}`
          ) {
            return this.ownerService.registor(ctx);
          } else if (
            ctx.message.text ===
            `🏃🏼 ${this.i18n.translate('registor.button.1', {
              lang,
            })}`
          ) {
            return this.userService.registor(ctx);
          } else {
            ctx.reply(`${this.i18n.translate('error.worning', { lang })}`);
          }
          return;
        }
        if (ctx.session.step == 'owner_registor') {
          return this.ownerService.registor_step(ctx);
        }
        if (ctx.session.step == 'user_registor') {
          return this.userService.registor_step(ctx);
        }

        if (
          ctx.message.text ==
          `${this.i18n.translate('menyu_buttons.stadion', { lang })}`
        ) {
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
              `${this.i18n.translate('stadions.stadion', { lang })}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.add', { lang })}`,
                        callback_data: 'add_stadion',
                      },
                    ],
                    [
                      {
                        text: `${this.i18n.translate('stadions.back', { lang })}`,
                        callback_data: 'back_owner_1',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          } else {
            const button: InlineKeyboardButton[][] = [];

            stadion.forEach((s) => {
              button.push([
                {
                  text: `🏟 ${s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name}`,
                  callback_data: `stadion_${s.id}`,
                },
              ]);
            });

            button.push(
              [
                {
                  text: `${this.i18n.translate('stadions.add', { lang })}`,
                  callback_data: 'add_stadion',
                },
              ],
              [
                {
                  text: `${this.i18n.translate('stadions.back', { lang })}`,
                  callback_data: 'back_owner_1',
                },
              ],
            );
            await ctx.reply(
              `${this.i18n.translate('stadions.select', { lang })}`,
              {
                reply_markup: { inline_keyboard: button },
              },
            );
            return;
          }
        }

        if (ctx.session.stadion_step === 'stadion') {
          if (ctx.session.stadion.name === 'N') {
            ctx.session.stadion.name = ctx.message.text;
            ctx.session.stadion.step = 3;

            await ctx.reply(
              `${this.i18n.translate('stadions.location', {
                lang,
              })}`,
              {
                reply_markup: {
                  keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.send_location', {
                          lang,
                        })}`,
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
            const count = parseInt(ctx.message.text);
            if (isNaN(count)) {
              ctx.reply(
                `${this.i18n.translate('error.number_error', { lang })}`,
              );
              return;
            }
            ctx.session.stadion.max_count = count;
            ctx.session.stadion.length = 'length';
            ctx.session.stadion.step = 5;
            ctx.reply(`${this.i18n.translate('stadions.length', { lang })}`, {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('stadions.back', { lang })}`,
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
            const length = parseInt(ctx.message.text);
            if (isNaN(length)) {
              ctx.reply(
                `${this.i18n.translate('error.number_error', { lang })}`,
              );
              return;
            }
            ctx.session.stadion.length = length;
            ctx.session.stadion.width = 'width';
            ctx.session.stadion.step = 6;
            ctx.reply(`${this.i18n.translate('stadions.width', { lang })}`, {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('stadions.back', { lang })}`,
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
            const width = parseInt(ctx.message.text);
            if (isNaN(width)) {
              ctx.reply(
                `${this.i18n.translate('error.number_error', { lang })}`,
              );
              return;
            }
            ctx.session.stadion.width = width;
            ctx.session.stadion.price = 'price';
            ctx.session.stadion.step = 7;
            ctx.reply(`${this.i18n.translate('stadions.price', { lang })}`, {
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: `${this.i18n.translate('stadions.back', { lang })}`,
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
            const price = parseInt(ctx.message.text);
            if (isNaN(price)) {
              ctx.reply(
                `${this.i18n.translate('error.number_error', { lang })}`,
              );
              return;
            }
            ctx.session.stadion.price = price;
            ctx.session.stadion.payments = 'payments';
            ctx.session.stadion.step = 8;
            ctx.reply(
              `${this.i18n.translate('stadions.paymenst_type', { lang })}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.card', { lang })}`,
                        callback_data: `payments_${Payments.CARD}`,
                      },
                    ],
                    [
                      {
                        text: `${this.i18n.translate('stadions.cash', { lang })}`,
                        callback_data: `payments_${Payments.CASH}`,
                      },
                    ],
                    [
                      {
                        text: `${this.i18n.translate('stadions.both', { lang })}`,
                        callback_data: `payments_${Payments.GIBRID}`,
                      },
                    ],
                    [
                      {
                        text: `${this.i18n.translate('stadions.back', { lang })}`,
                        callback_data: 'back_owner_4',
                      },
                    ],
                  ],
                },
              },
            );
            return;
          }
        } else {
          ctx.reply(
            `${this.i18n.translate('error.else', { lang, args: { text: ctx.message.text } })}`,
          );
        }
      }
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
}
