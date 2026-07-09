import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { WeeklyReportModule } from 'src/mail/weekly-report.module';
@Module({
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
