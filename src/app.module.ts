import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    
    TelegrafModule.forRoot({
      token: String(process.env.BOT_TOKEN),
      middlewares:[session()]
    }),
    PrismaModule,
    BotModule,
  ],
})
export class AppModule {}
