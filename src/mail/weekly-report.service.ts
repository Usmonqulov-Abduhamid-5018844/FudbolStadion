import { Injectable, Logger } from '@nestjs/common';
import { WeeklyReportQuery } from './weekly-report.query';
import { buildStadiumReportData, getLastFullWeekRange } from './weekly-report.helper';
import { WeeklyReportBotSender } from './weekly-report-bot-sender';

@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly query: WeeklyReportQuery,
    private readonly botSender: WeeklyReportBotSender,
  ) {}

  async sendWeeklyReportsToAllOwners(): Promise<void> {
    const { from, to } = getLastFullWeekRange(new Date());
    const owners = await this.query.getActiveOwners();

    this.logger.log(`Haftalik hisobot: ${owners.length} ega uchun (${from.toISOString()} — ${to.toISOString()})`);

    for (const owner of owners) {
      try {
        const raw = await this.query.getOwnerWeeklyRawData(owner.id, from, to);
        const reportData = buildStadiumReportData(raw);
        await this.botSender.sendReportFile(owner.chatID, reportData);
        this.logger.log(`Hisobot yuborildi: ${owner.fullName} (${owner.chatID})`);
      } catch (error) {

        this.logger.error(`Hisobot yuborilmadi: ${owner.fullName} (${owner.chatID})`, error as Error);
      }
    }

    this.logger.log('Haftalik hisobotlarni yuborish yakunlandi');
  }
}