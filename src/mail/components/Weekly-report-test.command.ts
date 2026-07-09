import { Update, Ctx, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { WeeklyReportQuery } from '../weekly-report.query';
import { WeeklyReportBotSender } from '../weekly-report-bot-sender';
import { buildStadiumReportData, getLastFullWeekRange } from '../weekly-report.helper';


@Update()
export class WeeklyReportTestCommand {
  constructor(
    private readonly query: WeeklyReportQuery,
    private readonly botSender: WeeklyReportBotSender,
  ) {}

  @Command('hisobot')
  async onTestReport(@Ctx() ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);

    const owners = await this.query.getActiveOwners();
    const owner = owners.find((o) => o.chatID === chatId);

    if (!owner) {
      await ctx.reply("Siz stadion egasi sifatida ro'yxatdan o'tmagansiz.");
      return;
    }

    await ctx.reply('Hisobot tayyorlanmoqda...');

    const { from, to } = getLastFullWeekRange(new Date());
    const raw = await this.query.getOwnerWeeklyRawData(owner.id, from, to);
    const reportData = buildStadiumReportData(raw);
    await this.botSender.sendReportFile(owner.chatID, reportData);
  }
}