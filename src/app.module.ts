import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { I18nModule, AcceptLanguageResolver, QueryResolver } from 'nestjs-i18n';

import * as path from 'path';
import { UtileModule } from './utils/utils.module';
import { OwnersModule } from './owners/owners.module';
import { UsersModule } from './users/users.module';
import { MailService } from './mail/mail.service';
import { INITIAL_SESSION } from './helpers/interface';
import { CronModule } from './cron/cron.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QrModule } from './qr/qr.module';
import { PaymentModule } from './payment/payment.module';
import { AdminModule } from './admin/admin.module';

@Module({
  providers: [MailService],
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'uz',
      loaderOptions: {
        path: path.join(__dirname, '../src/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver, new QueryResolver(['lang'])],
    }),
    ScheduleModule.forRoot(),

    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TelegrafModule.forRoot({
      token: String(process.env.BOT_TOKEN),
      middlewares: [
        session({
          defaultSession: () => ({
            ...structuredClone(INITIAL_SESSION),
            stadion: {
              ...structuredClone(INITIAL_SESSION.stadion),
              special: new Date(),
            },
          }),
        }),
      ],
    }),
    PrismaModule,
    BotModule,
    UtileModule,
    OwnersModule,
    UsersModule,
    CronModule,
    QrModule,
    PaymentModule,
    AdminModule,
  ],
})
export class AppModule {}
