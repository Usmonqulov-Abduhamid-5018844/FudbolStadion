import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  normalize,
  PaylovCheckoutResponse,
  PaylovMethod,
} from 'src/helpers/interface/enum';
import { PaylovWebhookDto } from 'src/payment/dto/create-paylov.dto';

const FALLBACK_METHODS: PaylovMethod[] = [
  { name: 'payme', label: 'Payme', sort_order: 1, is_active: true },
  { name: 'click', label: 'Click', sort_order: 2, is_active: true },
];
const HIDDEN_METHODS = ['card'];

@Injectable()
export class PaylovService implements OnModuleInit {
  private readonly logger = new Logger(PaylovService.name);

  async onModuleInit() {
    if (process.env.REGISTER_WEBHOOK === '1') {
      try {
        const res = await this.request('POST', '/partners/me/webhooks', {
          url: 'https://stadionbronbot.uz/payment/webhook',
        });
        console.log('WEBHOOK NATIJA:', JSON.stringify(res));
      } catch (e) {
        console.log('WEBHOOK XATO:', String(e));
      }
    }

    if (process.env.CHECK_WEBHOOK === '1') {
      try {
        const res = await this.request('GET', '/partners/me/webhooks');
        console.log("WEBHOOK RO'YXAT:", JSON.stringify(res));
      } catch (e) {
        console.log('WEBHOOK XATO:', String(e));
      }
    }
  }

  private get baseUrl(): string {
    return (process.env.PAYLOV_API_URL ?? '').trim().replace(/\/+$/, '');
  }
  private get apiKey(): string {
    return (process.env.PAYLOV_API_KEY ?? '').trim();
  }
  private get apiSecret(): string {
    return (process.env.PAYLOV_API_SECRET ?? '').trim();
  }

  private get basePath(): string {
    return new URL(this.baseUrl).pathname.replace(/\/+$/, '');
  }

  private methodsCache?: { at: number; data: PaylovMethod[] };

  private hmacHex(secret: string, message: string): string {
    return createHmac('sha256', secret).update(message).digest('hex');
  }
  private safeEqualHex(expectedHex: string, receivedHex?: string): boolean {
    if (!receivedHex || !/^[0-9a-f]+$/i.test(receivedHex)) return false;
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(receivedHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private signRequest(
    method: string,
    signedPath: string,
    ts: string,
    body: string,
  ): string {
    const bodyHash = createHash('sha256').update(body).digest('hex');
    return this.hmacHex(
      this.apiSecret,
      [method, signedPath, ts, bodyHash].join('\n'),
    );
  }
  debugWebhook(d: PaylovWebhookDto, raw?: Buffer): void {
    const received = String(d.signature ?? '').toLowerCase();
    const rest: Record<string, unknown> = Object.fromEntries(
      Object.entries(d).filter(([k]) => k !== 'signature'),
    );

    const secrets: Record<string, string> = {
      API_SECRET: this.apiSecret,
      API_KEY: this.apiKey,
    };
    const seps = [':', '\n', '', '|', ',', '&'];
    const amountVariants: Record<string, Record<string, unknown>> = {
      amountAsIs: rest,
      amountNum: { ...rest, amount: String(Number(rest.amount)) },
    };
    const hits: string[] = [];

    const check = (label: string, msg: string): void => {
      for (const [sn, s] of Object.entries(secrets)) {
        if (!s) continue;
        if (this.hmacHex(s, msg) === received)
          hits.push(`HMAC ${label} secret=${sn}`);
        const plain = createHash('sha256')
          .update(msg + s)
          .digest('hex');
        if (plain === received)
          hits.push(`SHA256(msg+secret) ${label} secret=${sn}`);
      }
    };

    for (const [vn, obj] of Object.entries(amountVariants)) {
      const original = Object.keys(obj);
      const sorted = [...original].sort();
      for (const [on, keys] of [
        ['orig', original],
        ['sorted', sorted],
      ] as const) {
        for (let mask = 1; mask < 1 << keys.length; mask++) {
          const picked = keys.filter((_, i) => mask & (1 << i));
          for (const sep of seps) {
            const msg = picked.map((k) => String(obj[k])).join(sep);
            check(
              `${vn}/${on} [${picked.join('+')}] sep=${JSON.stringify(sep)}`,
              msg,
            );
          }
        }
      }
      check(`${vn} JSON orig`, JSON.stringify(obj));
      check(
        `${vn} JSON sorted`,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      );
    }
    if (raw) check('rawBody', raw.toString('utf8'));

    this.logger.warn(
      `WEBHOOK DIAG hits=${hits.length ? hits.join(' || ') : 'YOQ'}`,
    );
  }

  verifyWebhookSignature(d: {
    order_id: number;
    payment_id: number;
    state: number;
    timestamp: number;
    signature?: string;
  }): boolean {
    const secret = this.apiSecret;
    if (!secret) return false;

    const msg = `${d.order_id}:${d.payment_id}:${d.state}:${d.timestamp}`;

    return this.safeEqualHex(this.hmacHex(secret, msg), d.signature);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    data?: object,
  ): Promise<T> {
    const body = method === 'POST' ? JSON.stringify(data ?? {}) : '';
    const ts = Date.now().toString();
    const signedPath = this.basePath + path;
    const signature = this.signRequest(method, signedPath, ts, body);
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-Timestamp': ts,
          'X-Signature': signature,
        },
        body: method === 'POST' ? body : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.logger.error(`Paylov ${method} ${signedPath} ulanish xatosi: ${e}`);
      throw new BadGatewayException("To'lov tizimiga ulanib bo'lmadi");
    }

    const text = await res.text();
    if (!res.ok) {
      this.logger.error(
        `Paylov ${method} ${signedPath} -> ${res.status}: ${text}`,
      );
      throw new BadGatewayException(
        `Paylov xatosi (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException('Paylov javobi JSON emas');
    }
  }

  async getActiveMethods(): Promise<PaylovMethod[]> {
    const now = Date.now();
    if (this.methodsCache && now - this.methodsCache.at < 5 * 60_000) {
      return this.methodsCache.data;
    }
    try {
      const all = await this.request<PaylovMethod[]>(
        'GET',
        '/payments/providers',
      );

      const data = all
        .filter(
          (m) => m.is_active && !HIDDEN_METHODS.includes(normalize(m.name)),
        )
        .map((m) => ({ ...m, name: normalize(m.name) }))
        .sort((a, b) => a.sort_order - b.sort_order);
      this.methodsCache = { at: now, data };

      return data;
    } catch {
      this.logger.warn("Usullar ro'yxati olinmadi, zaxira ro'yxat ishlatildi");
      return this.methodsCache?.data ?? FALLBACK_METHODS;
    }
  }

  async createCheckout(p: {
    externalId: string;
    amountSom: number;
    method: string;
    returnUrl: string;
  }): Promise<PaylovCheckoutResponse & { checkout_url: string }> {
    const active = await this.getActiveMethods();
    const method = normalize(p.method);

    if (!active.some((m) => m.name === method)) {
      throw new BadRequestException("Bu to'lov usuli mavjud emas");
    }

    if (!Number.isInteger(p.amountSom) || p.amountSom <= 0) {
      throw new BadRequestException("Noto'g'ri summa");
    }

    const res = await this.request<PaylovCheckoutResponse>(
      'POST',
      '/integrations/checkout',
      {
        external_id: p.externalId,
        amount: p.amountSom * 100,
        payment_provider: method,
        return_url: p.returnUrl,
      },
    );

    if (!res.checkout_url) {
      this.logger.error(`checkout_url yo'q: ${JSON.stringify(res)}`);
      throw new BadGatewayException("To'lov havolasi olinmadi");
    }

    return res as PaylovCheckoutResponse & { checkout_url: string };
  }

  /** Fiskal chek ro'yxatdan o'tkazish. items[].price TIYINDA */
  async registerFiscalReceipt(p: {
    paymentId: string;
    items: { title: string; price: number; count: number }[];
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/fiscalization/register',
      {
        payment_id: this.asPaymentId(p.paymentId),
        items: p.items,
      },
    );
  }

  /** Avval fiskallangan to'lov uchun qaytarish cheki */
  async refundFiscalReceipt(
    paymentId: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/fiscalization/refund',
      {
        payment_id: this.asPaymentId(paymentId),
      },
    );
  }

  private asPaymentId(id: string): number | string {
    const n = Number(id);
    return Number.isSafeInteger(n) ? n : id;
  }
}
