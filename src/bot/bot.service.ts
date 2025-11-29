import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isCkecked } from 'src/helpers/isChecked_firstName';
import { PrismaService } from 'src/prisma/prisma.service';
import { Context, Markup } from 'telegraf';

@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async start(ctx: MyContext) {
    ctx.session = ctx.session || {};
    ctx.reply(
      `${this.i18n.translate('common.START', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
        [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
        [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
      ]),
    );
  }

  async checket(ctx: MyContext) {
    const owners = await this.prisma.owners.findUnique({
      where: { chatID: String(ctx.from?.id) },
    });
    if (!owners) {
      const users = await this.prisma.users.findUnique({
        where: { chatID: String(ctx.from?.id) },
      });
      if (!users) {
        ctx.session.step = 'registor';
        ctx.reply(
          `${this.i18n.translate('registor.title', { lang: ctx.session.lang || ctx.from?.language_code })}`,
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
        return;
      }
      const welcomeMessage = this.i18n.translate('common.HELLO', {
        lang: ctx.session.lang || ctx.from?.language_code,
        args: {
          name: isCkecked(ctx.from?.first_name)
            ? ctx.from?.first_name
            : `${this.i18n.translate('common.firstName', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        },
      });
      await ctx.reply(
        `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
          lang: ctx.session.lang || ctx.from?.language_code,
        })}`,
        Markup.keyboard([
          ['test', 'test'],
          ['⚙️ Sozlamalar', '❓ Yordam'],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }
    const welcomeMessage = this.i18n.translate('common.HELLO', {
      lang: ctx.session.lang || ctx.from?.language_code,
      args: {
        name: isCkecked(ctx.from?.first_name)
          ? ctx.from?.first_name
          : `${this.i18n.translate('common.firstName', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      },
    });
    await ctx.reply(
      `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
        lang: ctx.session.lang || ctx.from?.language_code,
      })}`,
      Markup.keyboard([
        [
          `${this.i18n.translate('menyu_buttons.stadion', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          `${this.i18n.translate('menyu_buttons.bron', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        ],
        [
          `${this.i18n.translate('menyu_buttons.settings', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          `${this.i18n.translate('menyu.buttons.help', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        ],
      ])
        .resize()
        .oneTime(),
    );
  }
}
