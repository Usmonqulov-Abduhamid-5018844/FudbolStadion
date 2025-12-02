import { I18nService } from 'nestjs-i18n';
import { BotService } from './bot.service';
import { Action, Ctx, Hears, On, Start, Update } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { OwnersService } from 'src/owners/owners.service';
import { UsersService } from 'src/users/users.service';
import { InlineKeyboardButton } from 'telegraf/types';
import { Markup } from 'telegraf';

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
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const back_type = ctx.callbackQuery.data.split('_')[2];
      switch (back_type) {
        case '1':
          {
            ctx.reply(
              `${this.i18n.translate('menyu_buttons.menu', { lang: ctx.session.lang || ctx.from?.language_code })}`,
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
                  `${this.i18n.translate('stadions.stadion', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: `${this.i18n.translate('stadions.add', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                            callback_data: 'add_stadion',
                          },
                        ],
                        [
                          {
                            text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
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
                    text: `${this.i18n.translate('stadions.add', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                    callback_data: 'add_stadion',
                  },
                ],
                [
                  {
                    text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                    callback_data: 'back_owner_1',
                  },
                ],
              );
              await ctx.reply(
                `${this.i18n.translate('stadions.select', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                {
                  reply_markup: { inline_keyboard: button },
                },
              );
            } catch (error) {
              ctx.reply(
                `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
              );
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
                  text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                  callback_data: 'back_owner_2',
                },
              ]);

              await ctx.reply('Stadioningiz joylashgan Viloyatni tanlayng!', {
                reply_markup: { inline_keyboard: button },
              });
            } catch (error) {
              ctx.reply(
                `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
              );
            }
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
          text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          callback_data: 'back_owner_2',
        },
      ]);

      await ctx.reply(
        `${this.i18n.translate('stadions.stadion_region', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        {
          reply_markup: { inline_keyboard: button },
        },
      );
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
    }
  }
  @Action(/region_(.+)/)
  async region_items(@Ctx() ctx: MyContext) {
    try {
      ctx.answerCbQuery();
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const regionId: number = parseInt(
        ctx.callbackQuery.data.split('_')[1],
        10,
      );
      if (isNaN(regionId)) {
        ctx.reply(
          `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        );
        return;
      }
      const region_items = await this.prisma.region_item.findMany({
        where: {
          region_id: regionId,
        },
      });

      if (!region_items.length) {
        ctx.reply(
          `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        );
        return;
      }
      const button: InlineKeyboardButton[][] = region_items.map((item) => [
        { text: item.name, callback_data: `regions_item_${item.id}` },
      ]);
      button.push([
        {
          text: `${this.i18n.translate('stadions.back')}`,
          callback_data: 'back_owner_3',
        },
      ]);
      ctx.reply(
        `${this.i18n.translate('stadions.region_items', { lang: ctx.session.lang || ctx.from?.last_name })}`,
        {
          reply_markup: { inline_keyboard: button },
        },
      );
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
    }
  }

  @Action(/regions_item_(.+)/)
  async onStadions(@Ctx() ctx: MyContext) {
    try {
      ctx.answerCbQuery();

      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const region_item_id: number = parseInt(
        ctx.callbackQuery.data.split('_')[2],
        10,
      );
      if (isNaN(region_item_id)) {
        ctx.reply(
          `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        );
        return;
      }
      ctx.reply("Ok")
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
      console.log(error.message);
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

  @On('message')
  async Message(@Ctx() ctx: MyContext) {
    try {
      if (ctx.message && 'text' in ctx.message) {
        if (ctx.session.step == 'registor') {
          if (
            ctx.message.text ===
            `💼 ${this.i18n.translate('registor.button.0', {
              lang: ctx.session.lang || ctx.from?.language_code,
            })}`
          ) {
            return this.ownerService.registor(ctx);
          } else if (
            ctx.message.text ===
            `🏃🏼 ${this.i18n.translate('registor.button.1', {
              lang: ctx.session.lang || ctx.from?.language_code,
            })}`
          ) {
            return this.userService.registor(ctx);
          } else {
            ctx.reply(
              `${this.i18n.translate('error.worning', { lang: ctx.session.lang || ctx.from?.language_code })}`,
            );
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
          `${this.i18n.translate('menyu_buttons.stadion', { lang: ctx.session.lang || ctx.from?.language_code })}`
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
              `${this.i18n.translate('stadions.stadion', { lang: ctx.session.lang || ctx.from?.language_code })}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: `${this.i18n.translate('stadions.add', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                        callback_data: 'add_stadion',
                      },
                    ],
                    [
                      {
                        text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
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
                text: `${this.i18n.translate('stadions.add', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                callback_data: 'add_stadion',
              },
            ],
            [
              {
                text: `${this.i18n.translate('stadions.back', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                callback_data: 'back_owner_1',
              },
            ],
          );
          await ctx.reply(
            `${this.i18n.translate('stadions.select', { lang: ctx.session.lang || ctx.from?.language_code })}`,
            {
              reply_markup: { inline_keyboard: button },
            },
          );
        } else {
          ctx.reply(
            `${this.i18n.translate('error.else', { lang: ctx.session.lang || ctx.from?.language_code, args: { text: ctx.message.text } })}`,
          );
        }
      }
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
    }
  }
}
