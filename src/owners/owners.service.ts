import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MyContext } from 'src/helpers/bot.sesion';
import { isEmailFormat } from 'src/helpers/isEmailChecked';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService,
    private readonly i18n: I18nService
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
    ctx.reply("To'liq ism familyangizni keiting!");
  }

  async registor_step(ctx: MyContext) {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.session.owner_registor.step === 'full_name') {
        ctx.session.owner_registor.full_name = ctx.message.text;
        ctx.session.owner_registor.step = 'email';
        ctx.reply('Email manzilingizni kriting!');
        return;
      } else if (ctx.session.owner_registor.step === 'email') {
        if(!isEmailFormat(ctx.message.text)){
            ctx.reply("Email manzilingizni to'g'ri formatda kriting!\n iltimos qaytadan kiriting.")
            return
        }
        ctx.session.owner_registor.email = ctx.message.text;
        ctx.session.owner_registor.step = 'phone';
        ctx.reply('📞 Telefon raqamingizni yuboring', {
          reply_markup: {
            keyboard: [
              [
                {
                  text: '📱Telefon raqamni yuborish',
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
    }
    else if (ctx.message && "contact" in ctx.message) {
      if (ctx.session.owner_registor.step === 'phone') {
        ctx.session.owner_registor.phone = ctx.message.contact.phone_number
        ctx.session.owner_registor.step = null
        ctx.session.step = "finish"
        try {
            const data = {
                username: String(ctx.from?.username),
                full_name: String(ctx.session.owner_registor.full_name),
                phone: String(ctx.session.owner_registor.phone),
                email: String(ctx.session.owner_registor.email),
                chatID: String(ctx.from!.id)
            }
            let owner = await this.prisma.owners.create({data: {...data}})

            ctx.reply("Tabriklaymiz siz muvofiyaqatliy ro'yhaddan o'tdingiz")
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
