import { forwardRef, Global, Module } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { BotService } from 'src/bot/bot.service';
import { BotModule } from 'src/bot/bot.module';

@Global()
@Module({
   imports: [forwardRef(() => BotModule)],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
