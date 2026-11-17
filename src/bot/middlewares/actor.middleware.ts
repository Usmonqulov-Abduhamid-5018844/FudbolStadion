import { Logger } from '@nestjs/common';
import type { MyContext } from 'src/helpers/bot.sesion';
import { ActorService } from '../../common/actor/actor.service';

export class ActorMiddleware {
  private readonly logger = new Logger(ActorMiddleware.name);

  constructor(private readonly actorService: ActorService) {}

  use = async (ctx: MyContext, next: () => Promise<void>) => {
    const tgId = ctx.from?.id?.toString();

    try {
      ctx.actor = tgId ? await this.actorService.resolve(tgId) : null;
    } catch (err) {
      this.logger.error(`actor resolve failed (${tgId}): ${String(err)}`);
      ctx.actor = null;
    }

    return next();
  };
}
