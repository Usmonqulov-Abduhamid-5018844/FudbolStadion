import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  normalize,
  PaylovCheckoutResponse,
  PaylovMethod,
} from 'src/helpers/interface/enum';

// GET /payments/providers ishlamay qolsa, bot tugmasiz qolmasligi uchun
const FALLBACK_METHODS: PaylovMethod[] = [
  { name: 'payme', label: 'Payme', sort_order: 1, is_active: true },
  { name: 'click', label: 'Click', sort_order: 2, is_active: true },
];

// Botda ko'rsatilmaydigan usullar (karta ma'lumotini serverimiz orqali o'tkazmaymiz)
const HIDDEN_METHODS = ['card'];

@Injectable()
export class PaylovService {
  private readonly logger = new Logger(PaylovService.name);

  // .env dan o'qiladi; boshidagi/oxiridagi bo'sh joy va oxirgi "/" olib tashlanadi
  private get baseUrl(): string {
    return (process.env.PAYLOV_API_URL ?? '').trim().replace(/\/+$/, '');
  }
  private get apiKey(): string {
    return (process.env.PAYLOV_API_KEY ?? '').trim();
  }
  private get apiSecret(): string {
    return (process.env.PAYLOV_API_SECRET ?? '').trim();
  }

  /** 'https://apidev.wlcm.uz/api/v1' -> '/api/v1' (imzo shu yo'l bilan hisoblanadi) */
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
  // ---- Chiquvchi so'rov imzosi (siz -> Paylov) ----
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
  // ---- Kiruvchi webhook imzosi (Paylov -> siz) ----
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

  /**
   * Imzolangan so'rov yuborish.
   * path: bazadan keyingi qism, masalan '/integrations/checkout'
   * URL     = baseUrl  + path -> https://apidev.wlcm.uz/api/v1/integrations/checkout
   * Imzo    = basePath + path -> /api/v1/integrations/checkout  (domensiz, to'liq yo'l)
   */
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
        body: method === 'POST' ? body : undefined, // imzolangan aynan shu string yuboriladi
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
      throw new BadGatewayException(`Paylov xatosi (${res.status})`);
    }
    return JSON.parse(text) as T;
  }

  /** Foydalanuvchiga ko'rsatiladigan faol usullar (5 daqiqa keshlanadi) */
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

  /**
   * Checkout yaratish.
   * amountSom: so'mda (Paylov'ga tiyinda yuboriladi).
   * method: faqat faol usullardan biri bo'lishi shart (soxta callback_data'dan himoya).
   */
  async createCheckout(p: {
    externalId: string; // "BK:<uuid>" yoki "PR:<uuid>"
    amountSom: number;
    method: string;
    returnUrl: string;
  }): Promise<PaylovCheckoutResponse & { checkout_url: string }> {
    const active = await this.getActiveMethods();
    if (!active.some((m) => m.name === normalize(p.method))) {
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
        amount: p.amountSom * 100, // tiyinda
        payment_provider: p.method,
        return_url: p.returnUrl,
      },
    );

    if (!res.checkout_url) {
      this.logger.error(`checkout_url yo'q: ${JSON.stringify(res)}`);
      throw new BadGatewayException("To'lov havolasi olinmadi");
    }
    return res as PaylovCheckoutResponse & { checkout_url: string };
  }
}
