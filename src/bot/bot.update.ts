import { I18nService } from 'nestjs-i18n';
import { BotService } from './bot.service';
import { Action, Ctx, Start, Update } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { isCkecked } from 'src/helpers/isChecked_firstName';

@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
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

      const welcomeMessage = this.i18n.translate('common.HELLO', {
        lang: ctx.session.lang,
        args: {
          name: isCkecked(ctx.from?.first_name)
            ? ctx.from?.first_name
            : `${this.i18n.translate('common.firstName', { lang: ctx.session.lang })}`,
        },
      });
      await ctx.reply(
        `${welcomeMessage}  ${this.i18n.translate('common.WELCOME', {
          lang: ctx.session.lang,
        })}`,
      );
    }
    return this.botService.checket(ctx);
  }
}
