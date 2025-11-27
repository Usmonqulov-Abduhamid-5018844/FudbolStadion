import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { PrismaService } from 'src/prisma/prisma.service';
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async registor(ctx: MyContext) {
    ctx.session = ctx.session || {};
    ctx.session.step = 'user_registor';

    ctx.session.user_registor = ctx.session.user_registor || {
      full_name: null,
      phone: null,
      step: 'full_name',
    };
    ctx.reply(
      `${this.i18n.translate('registor.name', { lang: ctx.session.lang || ctx.from?.language_code })}`,
    );
  }

  async registor_step(ctx: MyContext) {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.user_registor.step === 'full_name') {
        ctx.session.user_registor.full_name = ctx.message.text;

        ctx.session.user_registor.step = 'phone';
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
      if (ctx.session.user_registor.step === 'phone') {
        ctx.session.user_registor.phone = ctx.message.contact.phone_number;
        ctx.session.user_registor.step = null;
        ctx.session.step = 'finish';
        try {
          const data = {
            username: String(ctx.from?.username),
            full_name: String(ctx.session.user_registor.full_name),
            phone: String(ctx.session.user_registor.phone),
            chatID: String(ctx.from!.id),
          };
          let owner = await this.prisma.users.create({ data: { ...data } });

          ctx.reply(
            `${this.i18n.translate('registor.finish', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          );
          console.log(owner);
        } catch (error) {
          ctx.reply(
            `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
          );
        }
      }
    }
  }
}
