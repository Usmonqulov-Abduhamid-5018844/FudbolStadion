import { Global, Module } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { BotService } from 'src/bot/bot.service';

@Global()
@Module({
  providers: [OwnersService,BotService],
  exports:[OwnersService]
})
export class OwnersModule {}
