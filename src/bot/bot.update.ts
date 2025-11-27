import { I18nService } from 'nestjs-i18n';
import { BotService } from './bot.service';
import { Action, Ctx, Hears, On, Start, Update } from 'nestjs-telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { isCkecked } from 'src/helpers/isChecked_firstName';
import { OwnersService } from 'src/owners/owners.service';
import { UsersService } from 'src/users/users.service';

@Update()
export class BotUpdate {
  constructor(
    private readonly botService: BotService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
    private readonly ownerService: OwnersService,
    private readonly userService: UsersService,
  ) {}

  @Start()
  onStart(@Ctx() ctx: MyContext) {
    return this.botService.start(ctx);
  }
  @Action(/lang_(.+)/)
  async language(@Ctx() ctx: MyContext) {
    ctx.answerCbQuery();
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      ctx.session = ctx.session || {};
      ctx.session.lang = (ctx.callbackQuery?.data).split('_')[1];

    }
    return this.botService.checket(ctx);
  }



    @On("contact")
  async onContact(@Ctx() ctx:MyContext){
    
    if(ctx.session.step == "owner_registor"){
      return this.ownerService.registor_step(ctx)
    }
    if(ctx.session.step == "user_registor"){
      return this.userService.registor_step(ctx)
    }
  }


  @On('message')
  async Message(@Ctx() ctx: MyContext) {
    try {
      if (ctx.message && 'text' in ctx.message) {
        if (ctx.session.step == 'registor') {
          if (
            ctx.message.text ===
            `💼 ${this.i18n.translate('registor.button.0', {
              lang: ctx.session.lang || ctx.from?.language_code,
            })}`
          ) {
            return this.ownerService.registor(ctx);
          } else if (
            ctx.message.text ===
            `🏃🏼 ${this.i18n.translate('registor.button.1', {
              lang: ctx.session.lang || ctx.from?.language_code,
            })}`
          ) {
            return this.userService.registor(ctx);
          } else {
            ctx.reply(
              `${this.i18n.translate('error.worning', { lang: ctx.session.lang || ctx.from?.language_code })}`,
            );
          }
          return;
        }
        if (ctx.session.step == 'owner_registor') {
          return this.ownerService.registor_step(ctx)
        }
        if(ctx.session.step == "user_registor"){
          return this.userService.registor_step(ctx)
        }
      }
    } catch (error) {
      ctx.reply(
        `${this.i18n.translate('error.error', { lang: ctx.session.lang || ctx.from?.language_code })}`,
      );
    }
  }
}
