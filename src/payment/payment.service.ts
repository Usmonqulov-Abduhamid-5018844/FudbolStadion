import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreatOcto_PaymentDto } from './dto/create-payment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentProvider, Prisma, TransactionStatus } from '@prisma/client';
import { verifyOctoSignature } from 'src/helpers/verify-signature/octo-verify-signature';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  constructor(
    private readonly prisma: PrismaService
  ) {}



async octoPremium_payments(data: CreatOcto_PaymentDto) {

  // if (!verifyOctoSignature(data)) {
  //   this.logger.error(
  //     `Noto'g'ri signature: ${data.shop_transaction_id} / octo_payment_UUID: ${data.octo_payment_UUID}`,
  //   );
  //   throw new BadRequestException('Invalid signature');
  // }

  if (!data.shop_transaction_id?.startsWith('premium_')) {
    this.logger.warn(
      `Noto'g'ri shop_transaction_id format: ${data.shop_transaction_id}`,
    );
    throw new BadRequestException('Noto‘g‘ri transaction ID');
  }
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

      if (data.status !== 'succeeded') {
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
          `Payment #${transactionId} muvaffaqiyatsiz. Status: ${data.status}`,
        );
        return;
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
          paid_at: this.parseDate(data.payed_time),
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
            },
          })
        : await tx.subscription.create({
            data: {
              ownerId: owner.id,
              plan: payment.plan,
              startDate,
              endDate,
              isActive: true,
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

private parseDate(value: string | number | Date): Date {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    this.logger.warn(
      `Noto'g'ri payed_time qiymati: ${value}, hozirgi vaqt ishlatildi`,
    );
    return new Date();
  }
  return date;
}


  findAll() {
    return `This action returns all payment`;
  }
}
