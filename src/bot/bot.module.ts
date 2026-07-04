import { Global, Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';

@Global()
@Module({
  providers: [BotUpdate, BotService],
  exports: [BotService],
})
export class BotModule {}
