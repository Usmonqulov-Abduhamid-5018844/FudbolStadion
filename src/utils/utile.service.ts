import { Injectable, OnModuleInit } from '@nestjs/common';
import { InlineKeyboardMarkup } from '@telegraf/types';
import { format, toZonedTime } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { backKeyboard, helpMenuKeyboard } from 'src/helpers/Inline_keybort';
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

  async safeEditHelpMenyuReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery().catch(() => {});
      }

      await ctx.editMessageText(
        text,
        helpMenuKeyboard(this.i18n, String(lang)),
      );
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
        await ctx.reply(text, helpMenuKeyboard(this.i18n, String(lang)));
        return;
      }
      throw e;
    }
  }

  async generateSlots(start: string, end: string, intervalMinutes = 60) {
    const slots: { start: string; end: string }[] = [];

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let current = startH * 60 + startM;
    const finish = endH * 60 + endM;

    while (current + intervalMinutes <= finish) {
      const fromH = Math.floor(current / 60);
      const fromM = current % 60;

      const to = current + intervalMinutes;
      const toH = Math.floor(to / 60);
      const toM = to % 60;

      slots.push({
        start: `${fromH.toString().padStart(2, '0')}:${fromM
          .toString()
          .padStart(2, '0')}`,
        end: `${toH.toString().padStart(2, '0')}:${toM
          .toString()
          .padStart(2, '0')}`,
      });

      current += intervalMinutes;
    }

    return slots;
  }

  async isSlotFree(slot: { start: string; end: string }, bookings: any[]) {
    const slotStart = this.toMinutes(slot.start);
    const slotEnd = this.toMinutes(slot.end);

    const tz = 'Asia/Tashkent';

    return bookings.some((b: any) => {
      const bookedStart = this.toMinutes(
        format(toZonedTime(b.start_time, tz), 'HH:mm', { timeZone: tz }),
      );
      const bookedEnd = this.toMinutes(
        format(toZonedTime(b.end_time, tz), 'HH:mm', { timeZone: tz }),
      );

      return bookedStart < slotEnd && bookedEnd > slotStart;
    });
  }

  async toMinutes(time: string) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}
