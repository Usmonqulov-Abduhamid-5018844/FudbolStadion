import { BotService } from './bot.service';
import { Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Update()
export class BotUpdate {
  constructor(private readonly botService: BotService) {}

  @Start()
  onStart(@Ctx() ctx: Context){
    return this.botService.start(ctx)
  }
}