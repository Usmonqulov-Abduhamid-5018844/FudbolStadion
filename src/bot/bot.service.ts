import { Injectable } from '@nestjs/common';
import { Payments } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isCkecked } from 'src/helpers/isChecked_firstName';
import { PrismaService } from 'src/prisma/prisma.service';
import { Context, Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { string } from 'yaml/dist/schema/common/string';

@Injectable()
export class BotService {
  private ownerId: number;
  private userId: number;

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
      this.userId = users.id;
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
    this.ownerId = owners.id;
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
          `${this.i18n.translate('menyu_buttons.help', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        ],
      ])
        .resize()
        .oneTime(),
    );
  }

  async createStadion(ctx: MyContext) {
    const lang = ctx.session.lang || ctx.from?.language_code;

    await ctx.replyWithPhoto(String(ctx.session.stadion.image), {
      caption: 'Image',
    });
    ctx.reply(
      `Name: ${ctx.session.stadion.name}\nUzunligi:${ctx.session.stadion.length}\nEni: ${ctx.session.stadion.width}\nNarxi: ${ctx.session.stadion.price}\nJoylashuvi: https://www.google.com/maps?q=${ctx.session.stadion.latitude},${ctx.session.stadion.longitude}\nTo'lov turi: ${ctx.session.stadion.payments_type}\nOdamlar soni: ${ctx.session.stadion.max_count}\n region_id: ${ctx.session.stadion.region_id}\n Tuman_id: ${ctx.session.stadion.region_item_id}`,
    );

    try {
      const data = {
        name: String(ctx.session.stadion.name),
        latitude: Number(ctx.session.stadion.latitude),
        longitude: Number(ctx.session.stadion.longitude),
        image: String(ctx.session.stadion.image),
        region_id: Number(ctx.session.stadion.region_id),
        max_count: Number(ctx.session.stadion.max_count),
        price: Number(ctx.session.stadion.price),
        region_item_id: Number(ctx.session.stadion.region_item_id),
        owner_id: this.ownerId,
        length: Number(ctx.session.stadion.length),
        width: Number(ctx.session.stadion.width),
        payments_type: ctx.session.stadion.payments_type,
      };
      await this.prisma.stadion.create({ data });

      ctx.reply("🎉 Stadionni muvofiyaqatliy qo'shdingiz.", {
        reply_markup: {
          keyboard: [
            [{ text: `${this.i18n.translate('stadions.menu', { lang })}` }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      ctx.session.step = 'menyu';
    } catch (error) {
      ctx.reply(`${this.i18n.translate('error.error', { lang })}`);
    }
  }

  async  renderScheduleMenu(ctx: MyContext, stadion_id: number) {
  const lang = ctx.session.lang || ctx.from?.language_code;

  try {
    const existingSchedules = await this.prisma.stadion_chedule.findMany({
    where: { stadion_id },
    select: { day_of_week: true },
  });

  const existingDays = existingSchedules.map(s => s.day_of_week);

  const allDays = [1,2,3,4,5,6,7];
  const remainingDays = allDays.filter(day => !existingDays.includes(day));

  let inlineKeyboard: InlineKeyboardButton[][] = [];

  if (remainingDays.length) {
    inlineKeyboard = remainingDays.map(day => [{
      text: this.i18n.translate(`schedule.week_days.${day}`, { lang }),
      callback_data: JSON.stringify({
        type: 'add_schedule_day',
        day,
        id:stadion_id
      }),
    }]);
  }

  if (existingSchedules.length) {
    inlineKeyboard.push([{
      text: "📋 Jadvalni ko'rish",
      callback_data: JSON.stringify({ type: "view_schedule", stadion_id })
    }]);
  }

  await ctx.editMessageText("📆 Haftalik ish jadvalini boshqarish:", {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
  } catch (error) {
    console.log("ERROR", error);
    
  }
}

}
