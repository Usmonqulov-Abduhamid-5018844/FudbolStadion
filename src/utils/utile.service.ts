import { Injectable, OnModuleInit } from '@nestjs/common';
import { InlineKeyboardMarkup } from '@telegraf/types';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { backKeyboard } from 'src/helpers/Inline_keybort';
import { PrismaService } from 'src/prisma/prisma.service';
import { Telegraf } from 'telegraf';

@Injectable()
export class UtilisService implements OnModuleInit {
  constructor(
    @InjectBot() private readonly Bot: Telegraf,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}
  async onModuleInit() {
    await this.Bot.telegram.setMyCommands([
      {
        command: '/start',
        description: 'start',
      },
    ]);
  }
  async isChecket(chatID: string, ctx: MyContext) {
    const lang = await this.langs(ctx);
    try {
      const owner = await this.prisma.owners.findUnique({ where: { chatID } });
      if (owner) {
        return true;
      }
      const user = await this.prisma.users.findUnique({ where: { chatID } });
      if (user) {
        return false;
      }
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }
  async langs(ctx: MyContext) {
    try {
      const data = await this.prisma.sesion.findUnique({
        where: { chat_id: String(ctx.from?.id) },
      });
      if (data) {
        return String(data.lang);
      } else {
        return String(ctx.from?.language_code);
      }
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
      return String(ctx.from?.language_code);
    }
  }

  async safeEditOrReply(ctx: MyContext, text: string, keyboard: any) {
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery().catch(() => {});
      }

      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    } catch (e) {
      const description = e?.response?.description ?? '';

      const safeErrors = [
        'message is not modified',
        'message to edit not found',
        "message can't be edited",
        'query is too old',
      ];

      const canReply = safeErrors.some((err) => description.includes(err));

      if (canReply) {
        await ctx.reply(text, {
          reply_markup: keyboard,
        });
        return;
      }
      throw e;
    }
  }

  async safeEditHelpReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery().catch(() => {});
      }

      await ctx.editMessageText(text, backKeyboard(this.i18n, String(lang)));
    } catch (e) {
      const description = e?.response?.description ?? '';

      const safeErrors = [
        'message is not modified',
        'message to edit not found',
        "message can't be edited",
        'query is too old',
      ];

      const canReply = safeErrors.some((err) => description.includes(err));

      if (canReply) {
        await ctx.reply(text, backKeyboard(this.i18n, String(lang)));
        return;
      }
      throw e;
    }
  }
}
