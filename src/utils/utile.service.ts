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

  async safeEditOrReply(
    ctx: MyContext,
    text: string,
    keyboard: any,
  ) {
    try {
      await ctx.editMessageText(text, {
        reply_markup: keyboard,
      });
    } catch (e) {
      await ctx.reply(text, {
        reply_markup: keyboard,
      });
    }
  }

  async safeEditHelpReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(text, backKeyboard(this.i18n, String(lang)));
    } catch (e) {
      await ctx.reply(text, backKeyboard(this.i18n, String(lang)));
    }
  }

  async safeEditHelpMenyuReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        helpMenuKeyboard(this.i18n, String(lang)),
      );
    } catch (e) {
      await ctx.reply(text, helpMenuKeyboard(this.i18n, String(lang)));
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

  isSlotFree(slot: { start: string; end: string }, bookings: any[]) {
    const slotStart = this.toMinutes(slot.start);
    const slotEnd = this.toMinutes(slot.end);

    for (const b of bookings) {
      const bookingStart = this.toMinutes(b.start_time);
      const bookingEnd = this.toMinutes(b.end_time);

      if (bookingStart < slotEnd && bookingEnd > slotStart) {
        return false;
      }
    }
    return true;
  }

  toMinutes(time: string) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  async errorFunction(ctx: MyContext) {
    const lang = await this.langs(ctx);
    ctx.reply(this.i18n.translate('error.error', { lang }), {
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
  }

  roundUpToNextHour(date: Date) {
    const rounded = new Date(date);
    if (
      rounded.getMinutes() > 0 ||
      rounded.getSeconds() > 0 ||
      rounded.getMilliseconds() > 0
    ) {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0, 0, 0);
    }

    return rounded;
  }

  calculateTotalPrice(
    start: string,
    end: string,
    pricePerHour: number,
    noshowCount: number,
  ) {
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;

    const durationHours = (endTotalMinutes - startTotalMinutes) / 60;
    let penalty = 0;
    let total = 0;
    if (noshowCount >= 2) {
      penalty = (noshowCount - 1) * 20000;
      total = durationHours * pricePerHour + penalty;
    } else {
      total = durationHours * pricePerHour;
    }

    return {
      total,
      penalty,
      price: durationHours * pricePerHour,
      hors: durationHours,
    };
  }
  bookingTimeCalculate(date: Date, start_time: string, lang: string) {
    const bookingDate = new Date(date);
    const [hours, minutes] = start_time.split(':').map(Number);

    bookingDate.setHours(hours, minutes, 0, 0);
    const now = new Date();
    const diffMs = bookingDate.getTime() - now.getTime();

    const totalMinutes = Math.floor(diffMs / 60000);

    const daysLeft = Math.floor(totalMinutes / 1440);
    const hoursLeft = Math.floor((totalMinutes % 1440) / 60);
    const minutesLeft = totalMinutes % 60;

    let timeLeftText = '';

    if (daysLeft > 0) {
      timeLeftText = this.i18n.translate(
        'booking.time_left.days_hours_minutes',
        {
          lang,
          args: {
            days: daysLeft,
            hours: hoursLeft,
            minutes: minutesLeft,
          },
        },
      );
    } else if (hoursLeft > 0) {
      timeLeftText = this.i18n.translate('booking.time_left.hours_minutes', {
        lang,
        args: {
          hours: hoursLeft,
          minutes: minutesLeft,
        },
      });
    } else {
      timeLeftText = this.i18n.translate('booking.time_left.minutes_only', {
        lang,
        args: {
          minutes: minutesLeft,
        },
      });
    }

    return { timeLeftText, totalMinutes, daysLeft, hoursLeft, minutesLeft };
  }
}
