import { Injectable, OnModuleInit } from '@nestjs/common';
import { Booking_status, Pay_method, Payments } from '@prisma/client';
import { InlineKeyboardMarkup } from '@telegraf/types';
import { format, toZonedTime } from 'date-fns-tz';
import { I18nService } from 'nestjs-i18n';
import { InjectBot } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import {
  back_owner_Keyboard,
  back_user_Keyboard,
  helpMenuKeyboard_Owner,
  helpMenuKeyboard_Users,
} from 'src/helpers/Inline_keybort';
import { IBooking } from 'src/helpers/interface';
import { getPaymentUrl } from 'src/helpers/url';
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
      await ctx.editMessageText(
        text,
        back_owner_Keyboard(this.i18n, String(lang)),
      );
    } catch (e) {
      await ctx.reply(text, back_owner_Keyboard(this.i18n, String(lang)));
    }
  }
  async safeEditHelpReplyUser(ctx: MyContext, text: string) {
    const lang = await this.langs(ctx);
    try {
      await ctx.editMessageText(
        text,
        back_user_Keyboard(this.i18n, String(lang)),
      );
    } catch (e) {
      await ctx.reply(text, back_user_Keyboard(this.i18n, String(lang)));
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
          url: getPaymentUrl(price, { id: Number(transaction_id) }),
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

  ownerBooking(booking: IBooking, page: number, lang: string) {
    const button: InlineKeyboardButton[][] = [];
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
      callback_data: `bookingChild_detail_${booking.id}_${page}`,
    };

    const checkInBtn = {
      text: this.i18n.translate('owner_booking.buttons.check_in', { lang }),
      callback_data: `bookingChild_checkin_${booking.id}_${page}`,
    };

    const cancelBtn = {
      text: this.i18n.translate('owner_booking.buttons.cancel', { lang }),
      callback_data: `bookingChild_cancel_${booking.id}_${page}`,
    };

    if (booking.status === 'PAID') {
      if (!booking.check_in && totalMinutes <= 60 && endMinutes > 0) {
        button.push([detailBtn, checkInBtn]);
      } else {
        button.push([detailBtn]);
      }
    }

    else if (booking.status === 'CONFIRMED') {
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
    }
    else if (booking.status === 'PENDING') {
      button.push([detailBtn, cancelBtn]);
    }

    button.push([
      {
        text: this.i18n.translate('schedule.back', { lang }),
        callback_data: 'back_owner_7',
      },
    ]);

    return button;
  }
  ownerBooking_today(booking: IBooking, page: number, lang: string) {
    const button: InlineKeyboardButton[][] = [];
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
      callback_data: `bookingChild_detailToday_${booking.id}_${page}`,
    };

    const checkInBtn = {
      text: this.i18n.translate('owner_booking.buttons.check_in', { lang }),
      callback_data: `bookingChild_checkinToday_${booking.id}_${page}`,
    };

    const cancelBtn = {
      text: this.i18n.translate('owner_booking.buttons.cancel', { lang }),
      callback_data: `bookingChild_cancelToday_${booking.id}_${page}`,
    };

    if (booking.status === 'PAID') {
      if (!booking.check_in && totalMinutes <= 60 && endMinutes > 0) {
        button.push([detailBtn, checkInBtn]);
      } else {
        button.push([detailBtn]);
      }
    }

    else if (booking.status === 'CONFIRMED') {
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
    }
    else if (booking.status === 'PENDING') {
      button.push([detailBtn, cancelBtn]);
    }
    else if (booking.status === "COMPLETED" || booking.status === "NO_SHOW"){
            button.push([detailBtn])
    }

    button.push([
      {
        text: this.i18n.translate('schedule.back', { lang }),
        callback_data: 'back_owner_7',
      },
    ]);

    return button;
  }
}
