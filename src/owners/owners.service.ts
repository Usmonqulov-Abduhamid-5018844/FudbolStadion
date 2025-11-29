import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async registor(ctx: MyContext) {
    ctx.session = ctx.session || {};
    ctx.session.step = 'owner_registor';

    ctx.session.owner_registor = ctx.session.owner_registor || {
      full_name: null,
      email: null,
      phone: null,
      step: 'full_name',
    };
    ctx.reply(
      `${this.i18n.translate('registor.name', { lang: ctx.session.lang || ctx.from?.language_code })}`,
    );
  }

  async registor_step(ctx: MyContext) {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.owner_registor.step === 'full_name') {
        ctx.session.owner_registor.full_name = ctx.message.text;
        ctx.session.owner_registor.step = 'email';
        ctx.reply(
          `${this.i18n.translate('registor.email', { lang: ctx.session.lang || ctx.from?.language_code })}`,
        );
        return;
      } else if (ctx.session.owner_registor.step === 'email') {
        if (!isEmailFormat(ctx.message.text)) {
          ctx.reply(
            `${this.i18n.translate('registor.email_format', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          );
          return;
        }
        ctx.session.owner_registor.email = ctx.message.text;
        ctx.session.owner_registor.step = 'phone';
        ctx.reply(
          `${this.i18n.translate('registor.phone', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: `${this.i18n.translate('registor.send_phone', { lang: ctx.session.lang || ctx.from?.language_code })}`,
                    request_contact: true,
                  },
                ],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
        return;
      }
    } else if (ctx.message && 'contact' in ctx.message) {
      if (ctx.session.owner_registor.step === 'phone') {
        ctx.session.owner_registor.phone = ctx.message.contact.phone_number;
        ctx.session.owner_registor.step = null;
        ctx.session.step = 'finish';
        try {
          const data = {
            username: String(ctx.from?.username),
            full_name: String(ctx.session.owner_registor.full_name),
            phone: String(ctx.session.owner_registor.phone),
            email: String(ctx.session.owner_registor.email),
            chatID: String(ctx.from!.id),
          };
          await this.prisma.owners.create({ data: { ...data } });

          ctx.reply(
            `${this.i18n.translate('registor.finish', { lang: ctx.session.lang || ctx.from?.language_code })}`,
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
        } catch (error) {
          ctx.reply(
            `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          );
        }
      }
    }
  }
}
