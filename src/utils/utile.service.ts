import { Injectable, OnModuleInit } from '@nestjs/common';
import { Booking_status, Pay_method, Payments } from '@prisma/client';
import { subDays } from 'date-fns';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import {
  back_owner_Keyboard,
  back_user_Keyboard,
  helpMenuKeyboard_Owner,
  helpMenuKeyboard_Users,
} from 'src/helpers/Inline_keybort';
import {
  CURRENCY_LABELS,
  IBooking,
  PREMIUM_PLANS,
} from 'src/helpers/interface';
import { getPaymentClickUrl } from 'src/helpers/url_click';
import { PrismaService } from 'src/prisma/prisma.service';
import { Telegraf } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';

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
      await this.errorFunction(ctx);
      return String(ctx.from?.language_code);
    }
  }

  async safeEditOrReply(ctx: MyContext, text: string, keyboard: any) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } catch (e) {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }
  }

  async safeEditHelpReplyOwner(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...back_owner_Keyboard(this.i18n, String(lang)),
      });
    } catch {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...back_owner_Keyboard(this.i18n, String(lang)),
      });
    }
  }
  async safeEditHelpReplyUser(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...back_user_Keyboard(this.i18n, String(lang)),
      });
    } catch {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...back_user_Keyboard(this.i18n, String(lang)),
      });
    }
  }

  async safeEditHelpMenuReply(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        helpMenuKeyboard_Owner(this.i18n, String(lang)),
      );
    } catch (e) {
      await ctx.reply(text, helpMenuKeyboard_Owner(this.i18n, String(lang)));
    }
  }
  async safeEditHelpMenuReply_User(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        helpMenuKeyboard_Users(this.i18n, String(lang)),
      );
    } catch (e) {
      await ctx.reply(text, helpMenuKeyboard_Users(this.i18n, String(lang)));
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
    await ctx.reply(this.i18n.translate('error.error', { lang }), {
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
    if (ctx.callbackQuery) {
      await ctx
        .answerCbQuery()
        .then(() => {})
        .catch();
    }

    console.log('Error occurred');
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
  bookingTimeCalculate(date: Date, start_time: string, lang: string = 'ru') {
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
  premium_End_time(end_time: Date, lang: string = 'ru') {
    const entTime = new Date(end_time);

    const now = new Date();
    const diffMs = entTime.getTime() - now.getTime();

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

    return { timeLeftText };
  }

  booking_status_handler(
    status: Booking_status,
    id: number,
    booking_peyments: Pay_method,
    stadion_peyments: Payments,
    data: Date,
    start_time: string,
    end_time: string,
    price: number,
    transaction_id: number | undefined,
    page: number,
    limit: number,
    total: number,
    check_in: boolean,
    lang: string,
  ) {
    const buttons: InlineKeyboardButton[][] = [];
    const isSinglePage = page === 1 && Math.ceil(total / limit) === 1;

    const { totalMinutes, timeLeftText } = this.bookingTimeCalculate(
      data,
      start_time,
      lang,
    );
    const { totalMinutes: endMinutes } = this.bookingTimeCalculate(
      data,
      end_time,
      lang,
    );

    const backBtn = {
      text: this.i18n.translate('schedule.back', { lang }),
      callback_data: 'back_user_5',
    };

    const cancelBtn = {
      text: this.i18n.translate('booking.cancel', { lang }),
      callback_data: `booking_confirm_cancel_${id}`,
    };

    const confirmBtn = {
      text: this.i18n.translate('booking.confirm', { lang }),
      callback_data: `booking_confirm_confirm_${id}`,
    };

    const changePaymentBtn = {
      text: this.i18n.translate('booking.change_payment_method', { lang }),
      callback_data: `booking_confirm_selectPeyments_${id}`,
    };

    const qrBtn = {
      text: this.i18n.translate('booking.qr_button', { lang }),
      callback_data: `booking_confirm_QR_${id}`,
    };

    const payBtn = transaction_id
      ? {
          text: this.i18n.translate('booking.pay_by_card', { lang }),
          url: getPaymentClickUrl(price, Number(transaction_id)),
        }
      : null;

    if (status === 'PENDING') {
      if (booking_peyments === 'CASH') {
        if (stadion_peyments === 'GIBRID') {
          buttons.push([changePaymentBtn]);
        }
        buttons.push([confirmBtn, cancelBtn]);
      }

      if (booking_peyments === 'CARD' && payBtn) {
        buttons.push([payBtn, cancelBtn]);
      }
    }

    if (['CONFIRMED', 'PAID'].includes(status)) {
      if (check_in) {
        if (isSinglePage) buttons.push([backBtn]);
        return buttons;
      }

      if (totalMinutes > 60) {
        if (booking_peyments === 'CASH' && stadion_peyments === 'GIBRID') {
          buttons.push([changePaymentBtn]);
        }

        if (status !== 'PAID' && booking_peyments === 'CARD' && payBtn) {
          buttons.push([payBtn]);
        }

        buttons.push([cancelBtn]);
      } else if (totalMinutes > 0) {
        buttons.push([
          {
            text: this.i18n.translate(timeLeftText, { lang }),
            callback_data: `booking_confirm_alert_${id}`,
          },
          qrBtn,
        ]);
      } else if (endMinutes >= 0) {
        buttons.push([qrBtn]);
      }
    }

    if (isSinglePage) {
      buttons.push([backBtn]);
    }

    return buttons;
  }

  buildOwnerBookingButtons(
    booking: IBooking,
    page: number,
    lang: string,
    type: string,
    callback_data: string,
  ) {
    const button: InlineKeyboardButton[][] = [];
    const makeCb = (action: string) =>
      `bookingChild_${action}_${booking.id}_${page}_${type}_${callback_data}`;

    const { totalMinutes } = this.bookingTimeCalculate(
      booking.date,
      booking.start_time,
      lang,
    );

    const { totalMinutes: endMinutes } = this.bookingTimeCalculate(
      booking.date,
      booking.end_time,
      lang,
    );

    const detailBtn = {
      text: this.i18n.translate('owner_booking.buttons.detail', { lang }),
      callback_data: makeCb('detail'),
    };

    const checkInBtn = {
      text: this.i18n.translate('owner_booking.buttons.check_in', { lang }),
      callback_data: makeCb('checkin'),
    };

    const cancelBtn = {
      text: this.i18n.translate('owner_booking.buttons.cancel', { lang }),
      callback_data: makeCb('cancel'),
    };

    switch (booking.status) {
      case 'PAID':
        if (!booking.check_in && totalMinutes <= 60 && endMinutes > 0) {
          button.push([detailBtn, checkInBtn]);
        } else {
          button.push([detailBtn]);
        }
        break;

      case 'CONFIRMED':
        if (!booking.check_in) {
          if (totalMinutes > 60) {
            button.push([detailBtn, cancelBtn]);
          } else if (totalMinutes >= 0) {
            button.push([detailBtn, cancelBtn]);
            button.push([checkInBtn]);
          } else if (endMinutes > 0) {
            button.push([detailBtn, checkInBtn]);
          } else {
            button.push([detailBtn]);
          }
        } else {
          button.push([detailBtn]);
        }
        break;

      case 'PENDING':
        button.push([detailBtn, cancelBtn]);
        break;

      case 'COMPLETED':
      case 'NOSHOW':
      case 'CANCELED':
      case 'REFUNDED':
        button.push([detailBtn]);
        break;
    }

    button.push([
      {
        text: this.i18n.translate('schedule.back', { lang }),
        callback_data: 'back_owner_7',
      },
    ]);

    return button;
  }

  async clearSessionMessages(ctx: MyContext) {
    if (ctx.session.ownerActiveBooking?.length) {
      try {
        await ctx.deleteMessages(ctx.session.ownerActiveBooking);
      } catch {}
      ctx.session.ownerActiveBooking = [];
    }
  }

  async sendPagination(
    ctx: MyContext,
    page: number,
    total: number,
    limit: number,
    lang: string,
    callback: string,
  ) {
    const totalPages = Math.ceil(total / limit);
    if (page === 1 && totalPages === 1) return;

    const buttons: InlineKeyboardButton[] = [];

    if (page > 1) {
      buttons.push({
        text: this.i18n.translate('stadions.Previous', { lang }),
        callback_data: `${callback}_${page - 1}`,
      });
    }

    buttons.push({
      text: `${page} / ${totalPages}`,
      callback_data: 'ignore',
    });

    if (page < totalPages) {
      buttons.push({
        text: this.i18n.translate('stadions.Next', { lang }),
        callback_data: `${callback}_${page + 1}`,
      });
    }

    const send = await ctx.reply(
      this.i18n.translate('stadions.Select', { lang }),
      {
        reply_markup: { inline_keyboard: [buttons] },
      },
    );

    ctx.session.ownerActiveBooking ??= [];
    ctx.session.ownerActiveBooking.push(send.message_id);
  }

  async growthBooking(ctx: MyContext, ownerId: number, lang: string) {
    try {
      const now = new Date();
      const base = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const current = await this.prisma.booking.count({
        where: {
          status: 'COMPLETED',
          stadion: { owner_id: ownerId },
          date: {
            gte: subDays(base, 7),
            lt: base,
          },
        },
      });
      const previous = await this.prisma.booking.count({
        where: {
          status: 'COMPLETED',
          stadion: { owner_id: ownerId },
          date: {
            gte: subDays(base, 14),
            lt: subDays(base, 7),
          },
        },
      });
      let growth = 0;

      if (previous === 0) {
        growth = current > 0 ? 100 : 0;
      } else {
        growth = ((current - previous) / previous) * 100;
      }
      const text =
        growth > 0
          ? this.i18n.translate('owner_booking.growth_increase', {
              args: { value: growth.toFixed(1) },
              lang,
            })
          : growth < 0
            ? this.i18n.translate('owner_booking.growth_decrease', {
                args: { value: growth.toFixed(1) },
                lang,
              })
            : this.i18n.translate('owner_booking.growth_no_change', { lang });

      return text;
    } catch (error) {
      await this.errorFunction(ctx);
    }
  }

  groupByDay(bookings: { date: Date }[], lang: string) {
    const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
    const map: Record<string, number> = {};

    bookings.forEach((b) => {
      const day = b.date.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
      });

      map[day] = (map[day] || 0) + 1;
    });

    return Object.entries(map).map(([label, value]) => ({
      label,
      value,
    }));
  }

  fillLast7Days(data: { label: string; value: number }[], lang: string) {
    const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
    const days: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      const label = d.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
      });

      days.push(label);
    }

    const map = Object.fromEntries(data.map((d) => [d.label, d.value]));

    return days.map((day) => ({
      label: day,
      value: map[day] || 0,
    }));
  }

  progressChart(data: { label: string; value: number }[], lang: string) {
    const max = Math.max(...data.map((d) => d.value));

    const unit = this.i18n.translate('owner_booking.unit_count', { lang });

    return data
      .map((d) => {
        const percent = Math.round((d.value / max) * 100);
        const len = Math.round(percent / 10);
        return `${d.label} [ ${'▰'.repeat(len)}${'▱'.repeat(10 - len)} ] ${d.value} ${d.value > 0 ? unit : ''}`;
      })
      .join('\n');
  }

  detectSearchType(input?: string) {
    if (!input) {
      return {
        type: 'invalid',
        value: '',
        error: 'EMPTY_INPUT',
      };
    }

    const value = input.trim();

    if (!value) {
      return {
        type: 'invalid',
        value: '',
        error: 'EMPTY_INPUT',
      };
    }

    const digits = value.replace(/\D/g, '');

    let phone: string | null = null;

    if (digits.length === 9) {
      phone = '+998' + digits;
    } else if (digits.length === 12 && digits.startsWith('998')) {
      phone = '+' + digits;
    }

    if (phone) {
      return { type: 'phone', value: phone };
    }

    if (/^\d{1,15}$/.test(value)) {
      return { type: 'id', value: Number(value) };
    }

    return { type: 'name', value };
  }

  addDays(plan: string) {
    const date = new Date();

    if (plan === 'MONTH_1') date.setDate(date.getDate() + 30);
    if (plan === 'MONTH_3') date.setDate(date.getDate() + 90);
    if (plan === 'YEAR_1') date.setDate(date.getDate() + 365);

    return date;
  }

  formatPrice = (plan: keyof typeof PREMIUM_PLANS, lang: string) => {
    const p = PREMIUM_PLANS[plan];
    const currency = CURRENCY_LABELS[lang];
    if (p.discount) {
      return `${p.price.toLocaleString()} ${currency}\n\n❌ <s>${p.discount.toLocaleString()} ${currency}</s>`;
    }

    return `${p.price.toLocaleString()} ${currency}`;
  };
}
