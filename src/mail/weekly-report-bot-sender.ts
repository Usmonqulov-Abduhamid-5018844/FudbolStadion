import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { renderWeeklyReportHtml } from './weekly-report.template';
import { StadiumReportData } from './weekly-report.types';


@Injectable()
export class WeeklyReportBotSender {
  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async sendReportFile(ownerChatId: string | number, data: StadiumReportData): Promise<void> {
    
    const html = renderWeeklyReportHtml(data);
    const buffer = Buffer.from(html, 'utf-8');
    const filename = `hisobot-${data.periodFrom}--${data.periodTo}.html`.replace(/\s+/g, '-');

    await this.bot.telegram.sendDocument(ownerChatId, {
      source: buffer,
      filename,
    });
  }
}
