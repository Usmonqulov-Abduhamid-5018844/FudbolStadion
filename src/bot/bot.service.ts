import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { Context, Markup } from 'telegraf';

@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async start(ctx: MyContext) {
    ctx.session = ctx.session || {}
    ctx.reply(
      `${this.i18n.translate('common.START', {lang: ctx.session.lang || "uz" })}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`🇺🇿 O'zbekcha`, `lang_uz`)],
        [Markup.button.callback(`🇷🇺 Русский`, `lang_ru`)],
        [Markup.button.callback(`🇬🇧 English`, `lang_en`)],
      ]),
    );
  }

  async checket(ctx: MyContext){
    const owners = await this.prisma.owners.findUnique({where:{chatID: String(ctx.from?.id)}})
    if(!owners){
      const users = await this.prisma.users.findUnique({where:{chatId: String(ctx.from?.id)}})
      if(!users){
        ctx.reply("Ro'yxat")
      }
    }
  }
}
