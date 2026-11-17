import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Booking_status,
  PaymentProvider,
  PremiumReason,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { PaylovWebhookDto } from './dto/create-paylov.dto';
import { formatDate } from 'src/helpers/dateFormat';
import { formatSum, UtilisService } from 'src/utils/utile.service';
import { escapeHtml } from 'src/helpers/stadions';
import { FiscalService } from 'src/fiscal/fiscal.service';
import { AlertService } from 'src/alert/alert.service';
import { AlertType } from 'src/helpers/interface/enum';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilisService,
    private readonly fiscal: FiscalService,
    private readonly alert: AlertService,
  ) {}

  findAll() {
    return `This action returns all payment`;
  }

  private isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v,
    );
  }
  // imzoni provider_data ga yozmaymiz
  private paylovPayload(data: PaylovWebhookDto): Prisma.InputJsonValue {
    const { signature, ...rest } = data;
    return rest as unknown as Prisma.InputJsonValue;
  }

  async paylovPremium_payments(transactionId: string, data: PaylovWebhookDto) {
    if (!this.isUuid(transactionId)) {
      throw new BadRequestException(
        `Noto'g'ri tranzaksiya id: ${transactionId}`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const payment = await tx.premiumTransaction.findUnique({
          where: { id: transactionId },
        });

        if (!payment) {
          throw new BadRequestException(
            `PremiumTransaction #${transactionId} topilmadi`,
          );
        }

        // imzo external_id ni qamramaydi, shuning uchun order_id mosligi shart
        if (payment.provider_order_id !== String(data.order_id)) {
          this.logger.error(
            `paylov: order_id mos emas, kutilgan ${payment.provider_order_id}, kelgan ${data.order_id} (tx #${transactionId})`,
          );
          throw new BadRequestException('order_id mos kelmadi');
        }

        const paidAmount = Math.round(Number(data.amount));
        if (paidAmount !== payment.amount) {
          this.logger.error(
            `paylov: summa mos emas, kutilgan ${payment.amount}, kelgan ${data.amount} (tx #${transactionId})`,
          );
          throw new BadRequestException("To'lov summasi mos kelmadi");
        }

        const claimed = await tx.premiumTransaction.updateMany({
          where: { id: payment.id, status: { not: TransactionStatus.SUCCESS } },
          data: {
            status: TransactionStatus.SUCCESS,
            provider: PaymentProvider.PAYLOV,
            provider_payment_id: String(data.payment_id),
            provider_data: this.paylovPayload(data),
            paid_at: new Date(data.timestamp),
          },
        });

        if (claimed.count === 0) {
          this.logger.log(
            `Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`,
          );
          return;
        }

        const owner = await tx.owners.findUnique({
          where: { id: payment.owner_id },
          select: { id: true },
        });
        if (!owner) {
          throw new BadRequestException(`Owner #${payment.owner_id} topilmadi`);
        }

        const subscription = await tx.subscription.findFirst({
          where: { ownerId: owner.id, isActive: true },
          orderBy: { endDate: 'desc' },
        });

        const now = new Date();
        const startDate =
          subscription && subscription.endDate > now
            ? subscription.endDate
            : now;

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + payment.duration);

        const subscriptionRecord = subscription
          ? await tx.subscription.update({
              where: { id: subscription.id },
              data: {
                endDate,
                plan: payment.plan,
                isActive: true,
                reason: PremiumReason.PURCHASE,
              },
            })
          : await tx.subscription.create({
              data: {
                ownerId: owner.id,
                plan: payment.plan,
                startDate,
                endDate,
                isActive: true,
                reason: PremiumReason.PURCHASE,
              },
            });

        await tx.premiumTransaction.update({
          where: { id: payment.id },
          data: { subscription_id: subscriptionRecord.id },
        });

        this.logger.log(
          `Premium faollashtirildi: owner #${owner.id}, plan ${payment.plan}, tugash ${endDate.toISOString()}`,
        );
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Paylov premium payment failed, tx ${transactionId}`,
        error instanceof Error ? error.stack : error,
      );

      if (error instanceof BadRequestException) throw error;

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Unique constraint: payment_id takrorlanmoqda (${data.payment_id}). Duplicate webhook bo'lishi mumkin.`,
        );
        return { success: true };
      }

      throw error;
    }
  }

  async paylovBooking_payments(transactionId: string, data: PaylovWebhookDto) {
    if (!this.isUuid(transactionId)) {
      throw new BadRequestException(
        `Noto'g'ri tranzaksiya id: ${transactionId}`,
      );
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.tranzaktion.findUnique({
          where: { id: transactionId },
          include: { booking: true },
        });

        if (!payment) {
          throw new BadRequestException(
            `Tranzaktion #${transactionId} topilmadi`,
          );
        }
        if (!payment.booking) {
          throw new BadRequestException(
            `Tranzaktion #${transactionId} uchun booking topilmadi`,
          );
        }

        if (payment.provider_order_id !== String(data.order_id)) {
          this.logger.error(
            `paylov: order_id mos emas, kutilgan ${payment.provider_order_id}, kelgan ${data.order_id} (tx #${transactionId})`,
          );
          void this.alert.notify(
            `Paylov order_id mos kelmadi | tx=${transactionId}`,
            `kutilgan=${payment.provider_order_id}\nkelgan=${data.order_id}`,
            AlertType.PAYMENT,
          );
          throw new BadRequestException('order_id mos kelmadi');
        }

        const expected = payment.amount ?? Number(payment.booking.total_price);
        const paidAmount = Math.round(Number(data.amount));
        if (paidAmount !== expected) {
          this.logger.error(
            `paylov: summa mos emas, kutilgan ${expected}, kelgan ${data.amount} (tx #${transactionId})`,
          );
          void this.alert.notify(
            `Paylov summasi mos kelmadi | tx=${transactionId}`,
            `kutilgan=${expected}\nkelgan=${data.amount}`,
            AlertType.PAYMENT,
          );
          throw new BadRequestException("To'lov summasi mos kelmadi");
        }

        const claimed = await tx.tranzaktion.updateMany({
          where: { id: payment.id, status: { not: TransactionStatus.SUCCESS } },
          data: {
            status: TransactionStatus.SUCCESS,
            provider: PaymentProvider.PAYLOV,
            provider_payment_id: String(data.payment_id),
            provider_data: this.paylovPayload(data),
            paid_at: this.toPaidAt(data.timestamp),
          },
        });

        if (claimed.count === 0) {
          this.logger.log(
            `Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`,
          );
          return { processed: false, bookingConfirmed: false };
        }

        // Faqat hali kutilayotgan bron tasdiqlanadi (muddati o'tgan yoki bekor qilingani emas)
        const confirmed = await tx.booking.updateMany({
          where: { id: payment.booking.id, status: Booking_status.PENDING },
          data: { status: Booking_status.PAID },
        });

        this.logger.log(
          `Payment qabul qilindi: booking #${payment.booking.id}, tx #${payment.id}, tasdiqlandi=${confirmed.count > 0}`,
        );
        return { processed: true, bookingConfirmed: confirmed.count > 0 };
      });

      // Commit'dan KEYIN ishlaydigan ishlar
      if (result.processed) {
        void this.fiscal.enqueueSale(transactionId);

        if (!result.bookingConfirmed) {
          // Pul olingan, lekin bron PENDING emas edi: qo'lda hal qilish yoki qaytarish kerak
          void this.alert.notify(
            `To'lov keldi, bron tasdiqlanmadi | tx=${transactionId}`,
            `Bron PENDING holatida emas edi (muddati o'tgan yoki bekor qilingan).\nPul qaytarilishi kerak bo'lishi mumkin.`,
            AlertType.PAYMENT,
          );
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Paylov booking payment failed, tx ${transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof BadRequestException) throw error;

      // P2002: boshqa tranzaksiyada shu payment_id allaqachon bor. Transaction rollback bo'lgan,
      // ya'ni bron tasdiqlanmagan. Haqiqiy duplicate webhook bu yerga yetmaydi (claimed.count === 0).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        void this.alert.notify(
          `Paylov payment_id takrorlandi | tx=${transactionId}`,
          `payment_id=${data.payment_id}`,
          AlertType.SECURITY,
        );
        throw new BadRequestException('payment_id allaqachon ishlatilgan');
      }

      void this.alert.notify(
        `Paylov webhook xatosi | tx=${transactionId}`,
        error instanceof Error ? error.message : String(error),
        AlertType.PAYMENT,
      );
      throw error;
    }
  }

  /** Paylov timestamp'i sekundda kelsa ham, millisekundda kelsa ham to'g'ri sana beradi */
  private toPaidAt(timestamp: number): Date {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return new Date();
    return new Date(ts < 1e12 ? ts * 1000 : ts);
  }

  // state -1 / -2: bekor qilingan to'lovni FAILED qilish
  async paylovFailed(externalId: string, data: PaylovWebhookDto) {
    const id = externalId.slice(3);
    if (!this.isUuid(id)) return { success: false };

    const patch = {
      status: TransactionStatus.FAILED,
      provider: PaymentProvider.PAYLOV,
      provider_payment_id: String(data.payment_id),
      provider_data: this.paylovPayload(data),
    };

    // order_id ham where ichida: external_id ni almashtirib yuborilgan soxta so'rov begona to'lovni bekor qila olmaydi
    const where = {
      id,
      provider_order_id: String(data.order_id),
      status: { not: TransactionStatus.SUCCESS },
    };

    try {
      const res = externalId.startsWith('PR:')
        ? await this.prisma.premiumTransaction.updateMany({
            where,
            data: patch,
          })
        : externalId.startsWith('BK:')
          ? await this.prisma.tranzaktion.updateMany({ where, data: patch })
          : null;

      if (!res) {
        this.logger.warn(`paylov: noma'lum external_id: ${externalId}`);
        return { success: false };
      }

      this.logger.warn(
        `Payment ${externalId} bekor qilindi, state=${data.state}, yangilandi: ${res.count}`,
      );
      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { success: true };
      }
      throw error;
    }
  }

  async paylovRefunded(externalId: string, data: PaylovWebhookDto) {
    const isBooking = externalId.startsWith('BK:');
    const isPremium = externalId.startsWith('PR:');
    if (!isBooking && !isPremium) {
      this.logger.warn(`paylov: noma'lum external_id (refund): ${externalId}`);
      return { success: false };
    }

    const id = externalId.slice(3);
    if (!this.isUuid(id)) return { success: false };

    let details: string;
    let dbStatus: string;

    if (isBooking) {
      const tx = await this.prisma.tranzaktion.findUnique({
        where: { id },
        include: { booking: true },
      });
      if (!tx || tx.provider_order_id !== String(data.order_id)) {
        this.logger.warn(
          `paylov: refund webhook mos kelmadi (${externalId}, order=${data.order_id})`,
        );
        return { success: true };
      }
      dbStatus = tx.status;
      details = tx.booking
        ? `📅 Bron: #${tx.booking.id}, ${formatDate(tx.booking.date, 'uz')}, ${tx.booking.start_time}–${tx.booking.end_time}\n💰 Bron summasi: ${formatSum(tx.booking.total_price)}`
        : '📅 Bron topilmadi';
    } else {
      const tx = await this.prisma.premiumTransaction.findUnique({
        where: { id },
      });
      if (!tx || tx.provider_order_id !== String(data.order_id)) {
        this.logger.warn(
          `paylov: refund webhook mos kelmadi (${externalId}, order=${data.order_id})`,
        );
        return { success: true };
      }
      dbStatus = tx.status;
      details = `⭐ Premium: owner #${tx.owner_id}, ${tx.plan}, ${tx.duration} kun\n💰 Summa: ${formatSum(tx.amount)}`;
    }

    this.logger.error(
      `PAYLOV QAYTARISH: ${externalId}, order=${data.order_id}, payment=${data.payment_id}, amount=${data.amount}, status=${dbStatus}`,
    );

    await this.utils.notifyAdmins(
      [
        "⚠️ <b>Paylov: to'lov qaytarildi / bekor qilindi</b>",
        '',
        `Turi: ${isBooking ? 'Bron' : 'Premium'}`,
        `Tranzaksiya: <code>${id}</code>`,
        details,
        '',
        `Paylov summasi: ${escapeHtml(data.amount)}`,
        `Order: ${data.order_id}, payment: ${data.payment_id}`,
        `Usul: ${escapeHtml(data.provider)}`,
        `Bazadagi holat: ${dbStatus}`,
        '',
        "Bazadagi holat avtomatik o'zgartirilmadi. Pul qaytarilganini Paylov kabinetida tekshirib, bron/premiumni qo'lda hal qiling.",
      ].join('\n'),
    );

    return { success: true };
  }
}
