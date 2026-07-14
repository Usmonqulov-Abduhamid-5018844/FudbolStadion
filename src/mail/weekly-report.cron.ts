import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WeeklyReportService } from './weekly-report.service';

@Injectable()
export class WeeklyReportCron {
  constructor(private readonly weeklyReportService: WeeklyReportService) {}

  @Cron('0 0 7 * * 1', {
    timeZone: 'Asia/Tashkent',
  })
  async sendWeeklyOwnerReports(): Promise<void> {
    
    await this.weeklyReportService.sendWeeklyReportsToAllOwners();
  }
}

//'0 0 7 * * 1' - Har dushanba kuni soat 07:00 da ishga tushadi