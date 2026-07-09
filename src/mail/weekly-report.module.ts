import { Module } from '@nestjs/common';
import { WeeklyReportService } from './weekly-report.service';
import { WeeklyReportQuery } from './weekly-report.query';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WeeklyReportBotSender } from './weekly-report-bot-sender';
import { WeeklyReportCron } from './weekly-report.cron';


@Module({
  imports: [PrismaModule],
  providers: [WeeklyReportService, WeeklyReportQuery, WeeklyReportBotSender,WeeklyReportCron],
  exports: [WeeklyReportService],
})
export class WeeklyReportModule {}