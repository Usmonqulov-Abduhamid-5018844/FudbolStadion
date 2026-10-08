import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreatOcto_PaymentDto } from './dto/create-payment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Booking_status,
  PaymentProvider,
  PremiumReason,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { verifyOctoSignature } from 'src/helpers/verify-signature/octo-verify-signature';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return `This action returns all payment`;
  }

  async octoPremium_payments(data: CreatOcto_PaymentDto) {
    const OCTO_TERMINAL_FAILURE_STATUSES = ['canceled'] as const;
    const OCTO_SUCCESS_STATUS = 'succeeded';

    // if (!verifyOctoSignature(data)) {
    //   this.logger.error(
    //     `Noto'g'ri signature: ${data.shop_transaction_id} / octo_payment_UUID: ${data.octo_payment_UUID}`,
    //   );
    //   throw new BadRequestException('Invalid signature');
    // }

    const transactionId = data.shop_transaction_id.slice('premium_'.length);

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

        if (
          data.status !== OCTO_SUCCESS_STATUS &&
          !OCTO_TERMINAL_FAILURE_STATUSES.includes(data.status as any)
        ) {
          this.logger.log(
            `Payment #${transactionId} oraliq holatda: ${data.status}. Kutilmoqda.`,
          );
          return;
        }

        if (data.status !== OCTO_SUCCESS_STATUS) {
          await tx.premiumTransaction.updateMany({
            where: {
              id: payment.id,
              status: { not: TransactionStatus.SUCCESS },
            },
            data: {
              status: TransactionStatus.FAILED,
              provider: PaymentProvider.OCTO,
              provider_transaction_id: data.octo_payment_UUID,
              provider_data: data as unknown as Prisma.InputJsonValue,
            },
          });
          this.logger.warn(
            `Payment #${transactionId} bekor qilindi. Status: ${data.status}`,
          );
          return;
        }

        if (data.total_sum < payment.amount) {
          this.logger.error(
            `Summa mos kelmadi: kutilgan ${payment.amount}, kelgan ${data.transfer_sum} (tx #${transactionId})`,
          );
          throw new BadRequestException('To‘lov summasi mos kelmadi');
        }

        const claimed = await tx.premiumTransaction.updateMany({
          where: {
            id: payment.id,
            status: { not: TransactionStatus.SUCCESS },
          },
          data: {
            status: TransactionStatus.SUCCESS,
            provider: PaymentProvider.OCTO,
            provider_transaction_id: data.octo_payment_UUID,
            provider_data: data as unknown as Prisma.InputJsonValue,
            paid_at: new Date(data.payed_time),
            transfer_sum: data.transfer_sum,
            refunded_sum: data.refunded_sum,
            currency: data.currency,
            card_masked_pan: data.maskedPan,
            card_type: data.card_type,
            card_vendor: data.card_vendor,
            card_country: data.card_country,
            risk_level: data.riskLevel,
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
                reason: PremiumReason.PURCHASE
              },
            })
          : await tx.subscription.create({
              data: {
                ownerId: owner.id,
                plan: payment.plan,
                startDate,
                endDate,
                isActive: true,
                reason: PremiumReason.PURCHASE
              },
            });

        await tx.premiumTransaction.update({
          where: { id: payment.id },
          data: { subscription_id: subscriptionRecord.id },
        });

        this.logger.log(
          `Premium subscription faollashtirildi: owner #${owner.id}, plan ${payment.plan}, tugash sanasi ${endDate.toISOString()}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Octo premium payment processing failed for transaction ${transactionId}`,
        error instanceof Error ? error.stack : error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Unique constraint: provider_transaction_id takrorlanmoqda - ${data.octo_payment_UUID}. Duplicate webhook bo'lishi mumkin, status o'zgartirilmadi.`,
        );
        return;
      }

      try {
        await this.prisma.premiumTransaction.updateMany({
          where: {
            id: transactionId,
            status: { not: TransactionStatus.SUCCESS },
          },
          data: { status: TransactionStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Transaction #${transactionId} statusini FAILED qilishda ham xato yuz berdi`,
          updateError instanceof Error ? updateError.stack : updateError,
        );
      }

      throw error;
    }
  }

  async octoBooking_payments(data: CreatOcto_PaymentDto) {
    const OCTO_TERMINAL_FAILURE_STATUSES = ['canceled'] as const;
    const OCTO_SUCCESS_STATUS = 'succeeded';

    // if (!verifyOctoSignature(data)) {
    //   this.logger.error(
    //     `Noto'g'ri signature: ${data.shop_transaction_id} / octo_payment_UUID: ${data.octo_payment_UUID}`,
    //   );
    //   throw new BadRequestException('Invalid signature');
    // }
    
    const transactionId = data.shop_transaction_id.slice('booking_'.length);

    try {
      await this.prisma.$transaction(async (tx) => {
        const payment = await tx.tranzaktion.findUnique({
          where: { id: transactionId },
          include: { booking: true },
        });

        if (!payment) {
          throw new BadRequestException(
            `Tranzaktion #${transactionId} topilmadi`,
          );
        }

        if (
          data.status !== OCTO_SUCCESS_STATUS &&
          !OCTO_TERMINAL_FAILURE_STATUSES.includes(data.status as any)
        ) {
          this.logger.log(
            `Payment #${transactionId} oraliq holatda: ${data.status}. Kutilmoqda.`,
          );
          return;
        }

        if (data.status !== OCTO_SUCCESS_STATUS) {
          await tx.tranzaktion.updateMany({
            where: {
              id: payment.id,
              status: { not: TransactionStatus.SUCCESS },
            },
            data: {
              status: TransactionStatus.FAILED,
              provider: PaymentProvider.OCTO,
              provider_transaction_id: data.octo_payment_UUID,
              provider_data: data as unknown as Prisma.InputJsonValue,
            },
          });
          this.logger.warn(
            `Payment #${transactionId} bekor qilindi. Status: ${data.status}`,
          );
          return;
        }

        if (!payment.booking) {
          throw new BadRequestException(
            `Tranzaktion #${transactionId} uchun booking topilmadi`,
          );
        }

        if (data.total_sum < Number(payment.booking.total_price)) {
          this.logger.error(
            `Summa mos kelmadi: kutilgan ${payment.booking.total_price}, kelgan ${data.total_sum} (tx #${transactionId})`,
          );
          throw new BadRequestException('To‘lov summasi mos kelmadi');
        }

        const claimed = await tx.tranzaktion.updateMany({
          where: {
            id: payment.id,
            status: { not: TransactionStatus.SUCCESS },
          },
          data: {
            status: TransactionStatus.SUCCESS,
            provider: PaymentProvider.OCTO,
            provider_transaction_id: data.octo_payment_UUID,
            provider_data: data as unknown as Prisma.InputJsonValue,
            paid_at: new Date(data.payed_time),
            owner_amount: data.transfer_sum,
            transfer_sum: data.transfer_sum,
            refunded_sum: data.refunded_sum,
            currency: data.currency,
            card_masked_pan: data.maskedPan,
            card_type: data.card_type,
            card_vendor: data.card_vendor,
            card_country: data.card_country,
            risk_level: data.riskLevel,
          },
        });

        if (claimed.count === 0) {
          this.logger.log(
            `Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`,
          );
          return;
        }

        await tx.booking.update({
          where: { id: payment.booking.id },
          data: { status: Booking_status.PAID },
        });

        this.logger.log(
          `Booking tasdiqlandi: booking #${payment.booking.id}, tx #${payment.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Octo booking payment processing failed for transaction ${transactionId}`,
        error instanceof Error ? error.stack : error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Unique constraint: provider_transaction_id takrorlanmoqda - ${data.octo_payment_UUID}. Duplicate webhook bo'lishi mumkin, status o'zgartirilmadi.`,
        );
        return;
      }

      try {
        await this.prisma.tranzaktion.updateMany({
          where: {
            id: transactionId,
            status: { not: TransactionStatus.SUCCESS },
          },
          data: { status: TransactionStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Transaction #${transactionId} statusini FAILED qilishda ham xato yuz berdi`,
          updateError instanceof Error ? updateError.stack : updateError,
        );
      }

      throw error;
    }
  }
}
