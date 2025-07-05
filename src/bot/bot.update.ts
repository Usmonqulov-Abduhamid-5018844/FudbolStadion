import {
  Ctx,
  Start,
  Update,
  Hears,
  On,
  Help,
  Command,
  Action,
} from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { BotService } from './bot.service';
import { MyContex } from 'src/helpers/sesion';
import { PrismaService } from 'src/prisma/prisma.service';

@Update()
export class BotUpdate {
  private readonly ADMIN_ID = process.env.ADMIN_ID;
  constructor(private readonly botService: BotService,  private readonly prisma: PrismaService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    if (ctx.from?.id === Number(this.ADMIN_ID)) {
      ctx.reply(
        `Assalomu alaykun xurmatliy ${ctx.from?.first_name || 'Admin'}`,
        Markup.keyboard([
          [`Stadion qo'shish`, `Stadionlarni ko'rish`],
        ]).resize(),
      );
    } else {
      const data = this.prisma.stadion.findFirst({where:{Meneger_chat_id: String(ctx.from!.id)}})
      if(!data){
        ctx.reply(`Asslaomu alaykum botga xush kelibsiz furmatliy ${ctx.from?.first_name || "Foydalanuvchi"}`)
      }
      else{
        ctx.reply(`Asslaomu alaykum botga xush kelibsiz furmatliy ${ctx.from?.first_name || "Menijer"}`,Markup.keyboard([
          [`Zakazlarni ko'rish`,`Stadion malumotlari`],[`Stadion ish vahtlarini ko'rish`]
        ]).resize())
      }
    }
  }
  @Hears("Stadion qo'shish")
  stadionQoshish(@Ctx() ctx: MyContex) {
    if (ctx.from?.id == this.ADMIN_ID) {
      ctx.session = ctx.session ?? {};

      ctx.session.stadion = ctx.session.stadion ?? {
        phone: null,
        location: null,
        region: null,
        description: null,
        price: null,
        img: null,
        menigerid: null,
      };
      ctx.session.region = 'region';
      ctx.reply("Qaysi region uchun stadion qo'shmoqchisiz nomini kriting: ");
    }
    return;
  }
  @Hears('Ortga')
  OnOrtga(@Ctx() ctx: MyContex) {
    if (ctx.from?.id == this.ADMIN_ID) {
      ctx.reply(
        "Siz asosiy menyuga o'ttingiz",
        Markup.keyboard([
          [`Stadion qo'shish`, `Stadionlarni ko'rish`],
        ]).resize(),
      );
    }
  }
  @Hears("Stadionlarni ko'rish")
  OnStadionlar(@Ctx() ctx: MyContex) {
    return this.botService.showPage(ctx);
  }
  @Action('next')
  async nextPage(@Ctx() ctx: MyContex) {
    ctx.answerCbQuery();
    ctx.session.page = (ctx.session.page ?? 0) + 1;
    await this.botService.showPage(ctx);
  }

  @Action('prev')
  async prevPage(@Ctx() ctx: MyContex) {
    ctx.answerCbQuery();
    ctx.session.page = Math.max((ctx.session.page ?? 0) - 1, 0);
    await this.botService.showPage(ctx);
  }

  @On('message')
  async onStepHandler(@Ctx() ctx: MyContex) {
    ctx.session = ctx.session ?? {};
    ctx.session.stadion = ctx.session.stadion ?? {};

    if (
      ctx.session.region === 'region' &&
      ctx.message &&
      'text' in ctx.message
    ) {
      ctx.session.stadion.region = ctx.message.text;
      ctx.session.region = null;
      ctx.session.phone = 'phone';
      ctx.reply('📞 Telefon raqamini (998930451852) shaklida kiriting:');
      return;
    }

    if (ctx.session.phone === 'phone' && ctx.message && 'text' in ctx.message) {
      ctx.session.stadion.phone = ctx.message.text;
      ctx.session.phone = null;
      ctx.session.description = 'description';
      ctx.reply('📝 Tavsif kiriting:');
      return;
    }

    if (
      ctx.session.description === 'description' &&
      ctx.message &&
      'text' in ctx.message
    ) {
      ctx.session.stadion.description = ctx.message.text;
      ctx.session.description = null;
      ctx.session.location = 'location';
      ctx.reply('📍 Joylashuvingizni yuboring:');
      return;
    }

    if (
      ctx.session.location === 'location' &&
      ctx.message &&
      'location' in ctx.message
    ) {
      const { latitude, longitude } = ctx.message.location;
      ctx.session.stadion.location = `${latitude},${longitude}`;
      ctx.session.location = null;
      ctx.session.price = 'price';
      ctx.reply('💰 Narxni kiriting (raqamda):');
      return;
    }

    if (ctx.session.price === 'price' && ctx.message && 'text' in ctx.message) {
      const price = parseInt(ctx.message.text);
      if (isNaN(price))
        return ctx.reply("❗ Raqam bo'lishi kerak. Qayta kiriting:");
      ctx.session.stadion.price = price;
      ctx.session.price = null;
      ctx.session.img = 'img';
      ctx.reply('🖼 Rasm yuboring:');
      return;
    }

    if (ctx.session.img === 'img' && ctx.message && 'photo' in ctx.message) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      ctx.session.stadion.img = photo.file_id;
      ctx.session.img = null;
      ctx.session.menigerid = 'menigerid';
      ctx.reply('Menijer chatId sini kriting: ');
      return;
    }
    if (
      ctx.session.menigerid === 'menigerid' &&
      ctx.message &&
      'text' in ctx.message
    ) {
      ctx.session.stadion.menigerid = ctx.message.text;
      ctx.session.menigerid = null;
      console.log('📦 Stadion:', ctx.session.stadion);
      return this.botService.stadionCreted(ctx);
    }

    ctx.reply("Iltimos, kerakli formatda ma'lumot yuboring.");
    return;
  }
}
