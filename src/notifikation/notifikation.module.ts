import { Global, Module } from '@nestjs/common';
import { NotifikationService } from './notifikation.service';
import { BotModule } from 'src/bot/bot.module';


@Global()
@Module({
  imports:[BotModule],
  providers: [NotifikationService],
  exports:[NotifikationService]
})
export class NotifikationModule {}
