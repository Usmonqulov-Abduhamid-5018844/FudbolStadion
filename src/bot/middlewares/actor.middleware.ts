import { Logger } from '@nestjs/common';
import type { MyContext } from 'src/helpers/bot.sesion';
import { ActorService } from '../../common/actor/actor.service';

const BLOCKED_TYPES = new Set([
  'price',
  'payment_method',
  'Update_Payments',
  'delete',
  'premium_buy',
  'ownerPremium',
  'advertising',
  'advertisement_confirm',
  'advertisement_select_stadium',
  'advertisement_skip_image',
  'notification',
  'notification_unread',
  'notification_read',
  'notification_all',
  'notification_settings',
  'notification_clear',
  'notification_back',
  'phone',
  'phone_update',
]);

// Oddiy matnli tugmalar
const BLOCKED_PREFIXES = [
  'ownMgr_',
  'add_stadion',
  'owner_stadionSplit_',
  'payments_',
  'toggleNotification|',
  'SelectOwnerPremium_',
  'advertisement',
];

const DENY: Record<string, string> = {
  uz: "⛔ Sizda bu amal uchun ruxsat yo'q.",
  ru: '⛔ У вас нет прав для этого действия.',
  en: "⛔ You don't have permission for this action.",
};

function isBlocked(data: string): boolean {
  if (data.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
        const type = parsed.type;
        return typeof type === 'string' && BLOCKED_TYPES.has(type);
      }
    } catch {
      return false;
    }
    return false;
  }
  return BLOCKED_PREFIXES.some((p) => data.startsWith(p));
}

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

    if (ctx.actor?.isManager) {
      const data =
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? ctx.callbackQuery.data
          : '';
      if (data && isBlocked(data)) {
        await ctx
          .answerCbQuery(DENY[ctx.actor.language] ?? DENY.uz, {
            show_alert: true,
          })
          .catch(() => undefined);
        return;
      }
    }
    return next();
  };
}
