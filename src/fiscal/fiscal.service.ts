import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  FiscalStatus,
  FiscalType,
  PaymentProvider,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaylovService } from 'src/paylov/paylov.service';
import { AlertType } from 'src/helpers/interface/enum';
import { AlertService } from 'src/alert/alert.service';

/** Shuncha urinishdan keyin chek FAILED bo'ladi va guruhga alert ketadi */
const MAX_ATTEMPTS = 5;
/** Bir cron ishga tushishida ko'pi bilan nechta chek qayta ishlanadi */
const BATCH_SIZE = 20;
/** Chek band qilingandan keyin boshqa jarayon uni olmaydigan vaqt (cron takrorlanishidan oshiq) */
const LEASE_MS = 5 * 60_000;
/** Qaytarish cheki sotuv cheki tugashini shuncha kutadi */
const SALE_WAIT_MS = 5 * 60_000;
const MAX_BACKOFF_MINUTES = 60;
const MAX_TITLE_LENGTH = 120;
const MAX_ERROR_LENGTH = 500;

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paylov: PaylovService,
    private readonly alert: AlertService,
  ) {}

  // ───────────────────────── Navbatga qo'yish ─────────────────────────
  // Bu metodlar tarmoqqa chiqmaydi: faqat bazaga yozadi. Webhook va refund
  // jarayonlari fiskal servis ishlamayotgan bo'lsa ham to'xtamaydi.

  /** To'lov SUCCESS bo'lgach chaqiriladi (webhook ichida, `void` bilan) */
  async enqueueSale(tranzaktionId: string): Promise<void> {
    try {
      const tx = await this.prisma.tranzaktion.findUnique({
        where: { id: tranzaktionId },
        select: {
          status: true,
          provider: true,
          amount: true,
          provider_payment_id: true,
        },
      });

      // Faqat Paylov orqali o'tgan, muvaffaqiyatli va summasi bor to'lovlar fiskallanadi
      if (
        !tx ||
        tx.status !== TransactionStatus.SUCCESS ||
        tx.provider !== PaymentProvider.PAYLOV ||
        !tx.amount ||
        tx.amount <= 0
      ) {
        return;
      }

      await this.prisma.fiscalReceipt.upsert({
        where: {
          tranzaktion_id_type: {
            tranzaktion_id: tranzaktionId,
            type: FiscalType.SALE,
          },
        },
        create: {
          tranzaktion_id: tranzaktionId,
          type: FiscalType.SALE,
          // Owner nomidagi chek summasi buxgalter bilan kelishiladi: kerak bo'lsa tx.owner_amount
          amount: tx.amount,
          next_attempt_at: new Date(),
        },
        update: {}, // allaqachon bor: dublikat chek yaratilmaydi
      });
    } catch (error) {
      this.logger.error(
        `enqueueSale xatosi: tranzaksiya=${tranzaktionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      void this.alert.notify(
        'Fiskal chek navbatga yozilmadi',
        `tranzaksiya=${tranzaktionId}\n${this.errorMessage(error)}`,
        AlertType.PAYMENT,
      );
    }
  }

  /** To'lov qaytarilganda chaqiriladi */
  async enqueueRefund(tranzaktionId: string): Promise<void> {
    try {
      const sale = await this.prisma.fiscalReceipt.findUnique({
        where: {
          tranzaktion_id_type: {
            tranzaktion_id: tranzaktionId,
            type: FiscalType.SALE,
          },
        },
        select: { amount: true },
      });
      if (!sale) return; // sotuv cheki umuman yaratilmagan: qaytarish cheki ham kerak emas

      await this.prisma.fiscalReceipt.upsert({
        where: {
          tranzaktion_id_type: {
            tranzaktion_id: tranzaktionId,
            type: FiscalType.REFUND,
          },
        },
        create: {
          tranzaktion_id: tranzaktionId,
          type: FiscalType.REFUND,
          amount: sale.amount,
          next_attempt_at: new Date(),
        },
        update: {},
      });
    } catch (error) {
      this.logger.error(
        `enqueueRefund xatosi: tranzaksiya=${tranzaktionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      void this.alert.notify(
        'Qaytarish cheki navbatga yozilmadi',
        `tranzaksiya=${tranzaktionId}\n${this.errorMessage(error)}`,
        AlertType.PAYMENT,
      );
    }
  }

  /** FAILED bo'lgan chekni qo'lda qayta urinish uchun (masalan admin paneldan) */
  async retry(receiptId: string): Promise<boolean> {
    const { count } = await this.prisma.fiscalReceipt.updateMany({
      where: { id: receiptId, status: FiscalStatus.FAILED },
      data: {
        status: FiscalStatus.PENDING,
        attempts: 0,
        error: null,
        next_attempt_at: new Date(),
      },
    });
    return count > 0;
  }

  // ───────────────────────── Navbatni qayta ishlash ─────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue(): Promise<void> {
    if (this.running) return; // oldingi ishga tushish hali tugamagan
    this.running = true;
    try {
      const due = await this.prisma.fiscalReceipt.findMany({
        where: {
          status: FiscalStatus.PENDING,
          next_attempt_at: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });

      for (const { id } of due) {
        await this.processOne(id);
      }
    } catch (error) {
      this.logger.error(
        "Fiskal navbatni o'qib bo'lmadi",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Chekni band qiladi: bir nechta jarayon (PM2 cluster) bir chekni ikki marta
   * yubormasligi uchun next_attempt_at vaqtincha kelajakka suriladi.
   */
  private async claim(receiptId: string): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.fiscalReceipt.updateMany({
      where: {
        id: receiptId,
        status: FiscalStatus.PENDING,
        next_attempt_at: { lte: now },
      },
      data: { next_attempt_at: new Date(now.getTime() + LEASE_MS) },
    });
    return count === 1;
  }

  private async processOne(receiptId: string): Promise<void> {
    if (!(await this.claim(receiptId))) return;

    const receipt = await this.prisma.fiscalReceipt.findUnique({
      where: { id: receiptId },
      include: {
        tranzaktion: {
          select: {
            provider_payment_id: true,
            booking: {
              select: {
                date: true,
                start_time: true,
                end_time: true,
                stadion: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!receipt || receipt.status !== FiscalStatus.PENDING) return;

    try {
      const paymentId = receipt.tranzaktion.provider_payment_id;
      if (!paymentId) throw new Error("provider_payment_id yo'q");

      if (receipt.type === FiscalType.REFUND) {
        await this.processRefund(receipt.id, receipt.tranzaktion_id, paymentId);
        return;
      }

      const { booking } = receipt.tranzaktion;
      const day = booking.date.toISOString().slice(0, 10);
      const title =
        `Stadion ijarasi: ${booking.stadion.name}, ${day} ${booking.start_time}-${booking.end_time}`.slice(
          0,
          MAX_TITLE_LENGTH,
        );

      const data = await this.paylov.registerFiscalReceipt({
        paymentId,
        items: [{ title, price: receipt.amount * 100, count: 1 }], // narx tiyinda
      });
      await this.markDone(receipt.id, data);
    } catch (error) {
      await this.markFailedAttempt(
        receipt.id,
        receipt.attempts + 1,
        receipt.type,
        error,
      );
    }
  }

  private async processRefund(
    receiptId: string,
    tranzaktionId: string,
    paymentId: string,
  ): Promise<void> {
    const sale = await this.prisma.fiscalReceipt.findUnique({
      where: {
        tranzaktion_id_type: {
          tranzaktion_id: tranzaktionId,
          type: FiscalType.SALE,
        },
      },
      select: { status: true },
    });

    // Ro'yxatdan o'tmagan chekni qaytarib bo'lmaydi
    if (!sale || sale.status === FiscalStatus.FAILED) {
      await this.markSkipped(receiptId, "Sotuv cheki ro'yxatdan o'tmagan");
      return;
    }
    // Sotuv hali yuborilmagan: tugashini kutamiz
    if (sale.status !== FiscalStatus.DONE) {
      await this.postpone(receiptId, SALE_WAIT_MS);
      return;
    }

    const data = await this.paylov.refundFiscalReceipt(paymentId);
    await this.markDone(receiptId, data);
  }

  // ───────────────────────── Holatni yozish ─────────────────────────

  private async markDone(
    id: string,
    providerData: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.fiscalReceipt.update({
      where: { id },
      data: {
        status: FiscalStatus.DONE,
        provider_data: providerData as Prisma.InputJsonObject,
        error: null,
        next_attempt_at: null,
        sent_at: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  private async markSkipped(id: string, reason: string): Promise<void> {
    await this.prisma.fiscalReceipt.update({
      where: { id },
      data: {
        status: FiscalStatus.SKIPPED,
        error: reason,
        next_attempt_at: null,
      },
    });
  }

  private async postpone(id: string, delayMs: number): Promise<void> {
    await this.prisma.fiscalReceipt.update({
      where: { id },
      data: { next_attempt_at: new Date(Date.now() + delayMs) },
    });
  }

  private async markFailedAttempt(
    id: string,
    attempts: number,
    type: FiscalType,
    error: unknown,
  ): Promise<void> {
    const message = this.errorMessage(error);
    const exhausted = attempts >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES); // 2, 4, 8, 16 daqiqa

    try {
      await this.prisma.fiscalReceipt.update({
        where: { id },
        data: {
          attempts,
          error: message.slice(0, MAX_ERROR_LENGTH),
          status: exhausted ? FiscalStatus.FAILED : FiscalStatus.PENDING,
          next_attempt_at: exhausted
            ? null
            : new Date(Date.now() + delayMinutes * 60_000),
        },
      });
    } catch (dbError) {
      this.logger.error(
        `Fiskal chek holati yozilmadi: receipt=${id}`,
        dbError instanceof Error ? dbError.stack : String(dbError),
      );
    }

    this.logger.warn(
      `Fiskal chek (${type}) urinish ${attempts}/${MAX_ATTEMPTS}: ${message}`,
    );

    if (exhausted) {
      void this.alert.notify(
        `Fiskal chek yuborilmadi (${type})`,
        `receipt=${id}\nurinishlar=${attempts}\n${message}`.slice(0, 1000),
        AlertType.PAYMENT,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
