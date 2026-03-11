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

    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TelegrafModule.forRoot({
      token: String(process.env.BOT_TOKEN),
      middlewares: [
        session({
          defaultSession: () => INITIAL_SESSION,
        }),
      ],
    }),
    PrismaModule,
    BotModule,
    UtileModule,
    OwnersModule,
    UsersModule,
  ],
})
export class AppModule {}
