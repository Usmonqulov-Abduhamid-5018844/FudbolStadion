import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';

@Module({
  providers: [BotUpdate, BotService],
})
export class BotModule {}
