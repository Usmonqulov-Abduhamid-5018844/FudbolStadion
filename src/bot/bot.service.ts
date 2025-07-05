import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { MyContex } from 'src/helpers/sesion';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup, Telegraf } from 'telegraf';
import { InlineKeyboardButton } from 'typegram';

@Injectable()
export class BotService {
  constructor(private readonly prisma: PrismaService) {}

  async stadionCreted(ctx: MyContex) {
    try {
      const { location, phone, img, price, description, region, menigerid } =
        ctx.session.stadion;
      if (
        !location ||
        !phone ||
        !img ||
        !description ||
        !region ||
        !menigerid
      ) {
        ctx.reply(
          "Malumotlar to'lig emas Qaytadan kriting",
          Markup.keyboard([['Ortga']]).resize(),
        );
        return;
      }
      await this.prisma.stadion.create({
        data: {
          location: location,
          phone: phone,
          img: img,
          price: Number(price),
          description: description,
          region: region,
          status: true,
          Meneger_chat_id: menigerid,
        },
      });
      ctx.reply(
        '✅ Malumotlar muvofiyaqatliy saqlandi',
        Markup.keyboard([['Ortga']]).resize(),
      );
    } catch (error) {
      ctx.reply("❌ Xatoliy yuz berdi iltimos keyinroq urinib ko'ring");
      return;
    }
    ctx.session.stadion = {
      phone: null,
      location: null,
      region: null,
      description: null,
      price: null,
      img: null,
      menigerid: null
    };
  }

  async FindAllAdmin(ctx: MyContex) {
    try {
      const data = await this.prisma.stadion.findMany();
      if (!data.length) {
        ctx.reply('🤷‍♂️ Hozirda hech qanday stadion mavjud emas.');
        return;
      }
      for (const stadion of data) {
        const [latitude, longitude] = stadion.location.split(',').map(Number);

        await ctx.replyWithLocation(latitude, longitude);

        const message = `
  📍 <b>Region:</b> ${stadion.region}
  📞 <b>Tel:</b> ${stadion.phone}
  💬 <b>Tavsif:</b> ${stadion.description}
  💰 <b>Narx:</b> ${stadion.price} so'm
  ✅ <b>Status:</b> ${stadion.status ? 'Faol' : 'Faol emas'}
  🆔 <b>ID:</b> ${stadion.id}`;

        await ctx.replyWithPhoto(stadion.img, {
          caption: message,
          parse_mode: 'HTML',
        });
      }
    } catch (error) {
      ctx.reply("❌ xatolik yoz berdi, keyimroq urinib ko'ring.");
      console.log(error);
      return;
    }
    ctx.reply('Ortga qaytish ⬇️', Markup.keyboard([['Otrga']]).resize());
  }

  async showPage(ctx: MyContex) {
    const limit = 2;
    const page = ctx.session.page || 0;
    const skip = page * limit;

    const total = await this.prisma.stadion.count();
    const data = await this.prisma.stadion.findMany({
      skip,
      take: limit,
    });

    if (!data.length) {
      await ctx.reply('🤷‍♂️ Stadionlar topilmadi.');
      return;
    }

    for (const stadion of data) {
      const [latitude, longitude] = stadion.location.split(',').map(Number);

      await ctx.replyWithLocation(latitude, longitude);

      const message = `
  📍 <b>Region:</b> ${stadion.region}
  📞 <b>Tel:</b> ${stadion.phone}
  💬 <b>Tafsif:</b> ${stadion.description}
  💰 <b>Narx:</b> ${stadion.price} so'm
  ✅ <b>Status:</b> ${stadion.status ? 'Faol' : 'Faol emas'}
  🆔 <b>ID:</b> ${stadion.id}`;

      await ctx.replyWithPhoto(stadion.img, {
        caption: message,
        parse_mode: 'HTML',
      });
    }

    const buttons: InlineKeyboardButton[] = [];
    
    if (page > 0) buttons.push({ text: '⬅️ Oldingi', callback_data: 'prev' });

    if ((page + 1) * limit < total)
      buttons.push({ text: '➡️ Keyingi', callback_data: 'next' });
    if (buttons.length) {
      await ctx.reply('⬇️ Sahifani boshqarish:', {
        reply_markup: {
          inline_keyboard: [buttons],
        },
      });
    }
    ctx.reply('ortga qaytish ⬇️', Markup.keyboard([['Ortga']]).resize());
  }
}
