import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotUpdate } from './bot.update';
import { BotService } from './bot.service';

@Module({
  providers: [BotUpdate, BotService],
})
export class BotModule {}
