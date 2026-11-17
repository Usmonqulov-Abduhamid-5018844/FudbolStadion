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
import { INITIAL_SESSION } from './helpers/interface';
import { CronModule } from './cron/cron.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QrModule } from './qr/qr.module';
import { PaymentModule } from './payment/payment.module';
import { AdminModule } from './admin/admin.module';
import { NotifikationModule } from './notifikation/notifikation.module';
import { WeeklyReportModule } from './mail/weekly-report.module';
import { AppController } from './app.controller';
import { PaylovModule } from './paylov/paylov.module';
import { AlertModule } from './alert/alert.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ActorModule } from './common/actor/actor.module';
import { ActorService } from './common/actor/actor.service';
import { ActorMiddleware } from './bot/middlewares/actor.middleware';
import { ManagersModule } from './managers/managers.module';

@Module({
  controllers: [AppController],
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'uz',
      loaderOptions: {
        path: path.join(__dirname, '../src/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver, new QueryResolver(['lang'])],
      logging: false,
    }),

    ScheduleModule.forRoot(),

    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    TelegrafModule.forRootAsync({
      inject: [ActorService],
      useFactory: (actorService: ActorService) => {
        const actorMw = new ActorMiddleware(actorService);
        return {
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
            actorMw.use,
          ],
        };
      },
    }),
    ManagersModule,
    ActorModule,
    PrismaModule,
    BotModule,
    UtileModule,
    OwnersModule,
    UsersModule,
    WeeklyReportModule,
    CronModule,
    QrModule,
    PaymentModule,
    AdminModule,
    NotifikationModule,
    PaylovModule,
    AlertModule,
    FiscalModule,
  ],
})
export class AppModule {}
