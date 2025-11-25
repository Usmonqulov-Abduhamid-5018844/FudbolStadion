import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { BotService } from 'src/bot/bot.service';

@Global()
@Module({
  providers: [UsersService, BotService],
  exports:[UsersService]
})
export class UsersModule {}
