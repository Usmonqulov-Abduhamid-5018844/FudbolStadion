import { forwardRef, Global, Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotUpdate } from './updates/bot.update';
import { OwnerManagersUpdate } from './updates/owner-managers.update';
import { ManagersModule } from 'src/managers/managers.module';
import { OwnersModule } from 'src/owners/owners.module';

@Global()
@Module({
  imports:[ManagersModule],
  providers: [OwnerManagersUpdate,BotUpdate, BotService],
  exports: [BotService],
})
export class BotModule {}
