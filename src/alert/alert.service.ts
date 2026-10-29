import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertType } from 'src/helpers/interface/enum';

interface AlertPolicy {
  dedupeBy: 'title' | 'exact';
  cooldownMs: number;
}

const ALERT_POLICY: Record<AlertType, AlertPolicy> = {
  error: { dedupeBy: 'title', cooldownMs: 60_000 },
  payment: { dedupeBy: 'title', cooldownMs: 60_000 },
  security: { dedupeBy: 'title', cooldownMs: 5 * 60_000 },
  refund: { dedupeBy: 'exact', cooldownMs: 10_000 },
  premium: { dedupeBy: 'exact', cooldownMs: 10_000 },
  booking: { dedupeBy: 'exact', cooldownMs: 10_000 },
  newOwner: { dedupeBy: 'exact', cooldownMs: 10_000 },
};

const TOPIC_ENV_KEYS: Record<AlertType, string> = {
  error: 'ALERT_TOPIC_ERROR',
  payment: 'ALERT_TOPIC_PAYMENT',
  security: 'ALERT_TOPIC_SECURITY',
  refund: 'ALERT_TOPIC_REFUND',
  premium: 'ALERT_TOPIC_PREMIUM',
  booking: 'ALERT_TOPIC_BOOKING',
  newOwner: 'ALERT_TOPIC_NEW_OWNER',
};

const TYPE_EMOJI: Record<AlertType, string> = {
  error: '🔥',
  payment: '💰',
  security: '🔒',
  refund: '💸',
  premium: '⭐',
  booking: '⚽',
  newOwner: '🎉',
};

interface DedupeEntry {
  until: number;
  suppressed: number;
}

const TELEGRAM_MAX_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = 5_000;
const GENERAL_TOPIC_ID = 1;
const DEDUPE_MAP_MAX_SIZE = 500;

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly dedupe = new Map<string, DedupeEntry>();

  constructor(private readonly config: ConfigService) {}

  async notify(
    title: string,
    details: string,
    type: AlertType = AlertType.ERROR,
    options: { parseMode?: 'HTML' } = {},
  ): Promise<boolean> {
    const token = this.config.get<string>('ALERT_BOT_TOKEN');
    const chatId = this.config.get<string>('ALERT_CHAT_ID');

    if (!token || !chatId) {
      this.logger.warn(
        'ALERT_CHAT_ID yoki ALERT_BOT_TOKEN sozlanmagan, alert yuborilmadi',
      );
      return false;
    }

    const policy = ALERT_POLICY[type];
    const key =
      policy.dedupeBy === 'title'
        ? `${type}:${title}`
        : `${type}:${title}|${details}`;
    const check = this.checkCooldown(key, policy.cooldownMs);
    if (!check.send) return true;

    const threadId = this.getThreadId(type);
    const repeatNote =
      check.suppressed > 0
        ? `\n\n🔁 Oxirgi xabardan beri ${check.suppressed} marta takrorlandi`
        : '';
    const text =
      `${TYPE_EMOJI[type]} ${title}\n\n${details}${repeatNote}`.slice(
        0,
        TELEGRAM_MAX_LENGTH,
      );

    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (threadId !== undefined) body.message_thread_id = threadId;
    if (options.parseMode) body.parse_mode = options.parseMode;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (res.ok) return true;

      const errText = await res.text().catch(() => '');
      this.logger.error(
        `Alert yuborilmadi: status ${res.status} | type=${type} | thread=${threadId ?? '-'} | ${errText.slice(0, 200)}`,
      );
      return false;
    } catch (error) {
      this.logger.error(
        'Alert yuborishda xatolik',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  private checkCooldown(
    key: string,
    cooldownMs: number,
  ): { send: boolean; suppressed: number } {
    const now = Date.now();
    const entry = this.dedupe.get(key);

    if (entry && now < entry.until) {
      entry.suppressed += 1;
      return { send: false, suppressed: 0 };
    }

    this.cleanup(now);
    this.dedupe.set(key, { until: now + cooldownMs, suppressed: 0 });
    return { send: true, suppressed: entry?.suppressed ?? 0 };
  }

  private cleanup(now: number): void {
    if (this.dedupe.size < DEDUPE_MAP_MAX_SIZE) return;

    for (const [k, v] of this.dedupe) {
      if (now >= v.until) this.dedupe.delete(k);
    }
    if (this.dedupe.size >= DEDUPE_MAP_MAX_SIZE) {
      const oldest = this.dedupe.keys().next().value;
      if (oldest !== undefined) this.dedupe.delete(oldest);
    }
  }

  private getThreadId(type: AlertType): number | undefined {
    const direct = this.parseId(this.config.get<string>(TOPIC_ENV_KEYS[type]));
    if (direct !== undefined) return direct;

    this.logger.warn(
      `${TOPIC_ENV_KEYS[type]} sozlanmagan, ERROR topiciga yuboriladi`,
    );
    return this.parseId(this.config.get<string>(TOPIC_ENV_KEYS.error));
  }

  private parseId(raw: string | undefined): number | undefined {
    const id = Number(raw);
    if (!raw || !Number.isInteger(id) || id <= GENERAL_TOPIC_ID)
      return undefined;
    return id;
  }
}
