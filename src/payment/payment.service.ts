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
import { PaylovWebhookDto } from './dto/create-paylov.dto';
import { Telegraf } from 'telegraf';
import { MyContext } from 'src/helpers/bot.sesion';
import { formatDate } from 'src/helpers/dateFormat';
import { formatSum } from 'src/utils/utile.service';
import { escapeHtml } from 'src/helpers/stadions';
import { InjectBot } from 'nestjs-telegraf';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  constructor(
    private readonly prisma: PrismaService,
   @InjectBot() private readonly bot: Telegraf<MyContext>

  ) {}

  findAll() {
    return `This action returns all payment`;
  }

  // async octoPremium_payments(data: CreatOcto_PaymentDto) {
  //   const OCTO_TERMINAL_FAILURE_STATUSES = ['canceled'] as const;
  //   const OCTO_SUCCESS_STATUS = 'succeeded';


  //   const transactionId = data.shop_transaction_id.slice('premium_'.length);

  //   try {
  //     await this.prisma.$transaction(async (tx) => {
  //       const payment = await tx.premiumTransaction.findUnique({
  //         where: { id: transactionId },
  //       });

  //       if (!payment) {
  //         throw new BadRequestException(
  //           `PremiumTransaction #${transactionId} topilmadi`,
  //         );
  //       }

  //       if (
  //         data.status !== OCTO_SUCCESS_STATUS &&
  //         !OCTO_TERMINAL_FAILURE_STATUSES.includes(data.status as any)
  //       ) {
  //         this.logger.log(
  //           `Payment #${transactionId} oraliq holatda: ${data.status}. Kutilmoqda.`,
  //         );
  //         return;
  //       }

  //       if (data.status !== OCTO_SUCCESS_STATUS) {
  //         await tx.premiumTransaction.updateMany({
  //           where: {
  //             id: payment.id,
  //             status: { not: TransactionStatus.SUCCESS },
  //           },
  //           data: {
  //             status: TransactionStatus.FAILED,
  //             provider: PaymentProvider.PAYLOV,
  //             provider_transaction_id: data.octo_payment_UUID,
  //             provider_data: data as unknown as Prisma.InputJsonValue,
  //           },
  //         });
  //         this.logger.warn(
  //           `Payment #${transactionId} bekor qilindi. Status: ${data.status}`,
  //         );
  //         return;
  //       }

  //       if (data.total_sum < payment.amount) {
  //         this.logger.error(
  //           `Summa mos kelmadi: kutilgan ${payment.amount}, kelgan ${data.transfer_sum} (tx #${transactionId})`,
  //         );
  //         throw new BadRequestException('To‘lov summasi mos kelmadi');
  //       }

  //       const claimed = await tx.premiumTransaction.updateMany({
  //         where: {
  //           id: payment.id,
  //           status: { not: TransactionStatus.SUCCESS },
  //         },
  //         data: {
  //           status: TransactionStatus.SUCCESS,
  //           provider: PaymentProvider.PAYLOV,
  //           provider_transaction_id: data.octo_payment_UUID,
  //           provider_data: data as unknown as Prisma.InputJsonValue,
  //           paid_at: new Date(data.payed_time),
  //           transfer_sum: data.transfer_sum,
  //           refunded_sum: data.refunded_sum,
  //           currency: data.currency,
  //           card_masked_pan: data.maskedPan,
  //           card_type: data.card_type,
  //           card_vendor: data.card_vendor,
  //           card_country: data.card_country,
  //           risk_level: data.riskLevel,
  //         },
  //       });

  //       if (claimed.count === 0) {
  //         this.logger.log(
  //           `Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`,
  //         );
  //         return;
  //       }

  //       const owner = await tx.owners.findUnique({
  //         where: { id: payment.owner_id },
  //         select: { id: true },
  //       });

  //       if (!owner) {
  //         throw new BadRequestException(`Owner #${payment.owner_id} topilmadi`);
  //       }

  //       const subscription = await tx.subscription.findFirst({
  //         where: { ownerId: owner.id, isActive: true },
  //         orderBy: { endDate: 'desc' },
  //       });

  //       const now = new Date();
  //       const startDate =
  //         subscription && subscription.endDate > now
  //           ? subscription.endDate
  //           : now;

  //       const endDate = new Date(startDate);
  //       endDate.setDate(endDate.getDate() + payment.duration);

  //       const subscriptionRecord = subscription
  //         ? await tx.subscription.update({
  //             where: { id: subscription.id },
  //             data: {
  //               endDate,
  //               plan: payment.plan,
  //               isActive: true,
  //               reason: PremiumReason.PURCHASE,
  //             },
  //           })
  //         : await tx.subscription.create({
  //             data: {
  //               ownerId: owner.id,
  //               plan: payment.plan,
  //               startDate,
  //               endDate,
  //               isActive: true,
  //               reason: PremiumReason.PURCHASE,
  //             },
  //           });

  //       await tx.premiumTransaction.update({
  //         where: { id: payment.id },
  //         data: { subscription_id: subscriptionRecord.id },
  //       });

  //       this.logger.log(
  //         `Premium subscription faollashtirildi: owner #${owner.id}, plan ${payment.plan}, tugash sanasi ${endDate.toISOString()}`,
  //       );
  //     });
  //   } catch (error) {
  //     this.logger.error(
  //       `Octo premium payment processing failed for transaction ${transactionId}`,
  //       error instanceof Error ? error.stack : error,
  //     );

  //     if (error instanceof BadRequestException) {
  //       throw error;
  //     }

  //     if (
  //       error instanceof Prisma.PrismaClientKnownRequestError &&
  //       error.code === 'P2002'
  //     ) {
  //       this.logger.warn(
  //         `Unique constraint: provider_transaction_id takrorlanmoqda - ${data.octo_payment_UUID}. Duplicate webhook bo'lishi mumkin, status o'zgartirilmadi.`,
  //       );
  //       return;
  //     }

  //     try {
  //       await this.prisma.premiumTransaction.updateMany({
  //         where: {
  //           id: transactionId,
  //           status: { not: TransactionStatus.SUCCESS },
  //         },
  //         data: { status: TransactionStatus.FAILED },
  //       });
  //     } catch (updateError) {
  //       this.logger.error(
  //         `Transaction #${transactionId} statusini FAILED qilishda ham xato yuz berdi`,
  //         updateError instanceof Error ? updateError.stack : updateError,
  //       );
  //     }

  //     throw error;
  //   }
  // }

  // async octoBooking_payments(data: CreatOcto_PaymentDto) {
  //   const OCTO_TERMINAL_FAILURE_STATUSES = ['canceled'] as const;
  //   const OCTO_SUCCESS_STATUS = 'succeeded';


  //   const transactionId = data.shop_transaction_id.slice('booking_'.length);

  //   try {
  //     await this.prisma.$transaction(async (tx) => {
  //       const payment = await tx.tranzaktion.findUnique({
  //         where: { id: transactionId },
  //         include: { booking: true },
  //       });

  //       if (!payment) {
  //         throw new BadRequestException(
  //           `Tranzaktion #${transactionId} topilmadi`,
  //         );
  //       }

  //       if (
  //         data.status !== OCTO_SUCCESS_STATUS &&
  //         !OCTO_TERMINAL_FAILURE_STATUSES.includes(data.status as any)
  //       ) {
  //         this.logger.log(
  //           `Payment #${transactionId} oraliq holatda: ${data.status}. Kutilmoqda.`,
  //         );
  //         return;
  //       }

  //       if (data.status !== OCTO_SUCCESS_STATUS) {
  //         await tx.tranzaktion.updateMany({
  //           where: {
  //             id: payment.id,
  //             status: { not: TransactionStatus.SUCCESS },
  //           },
  //           data: {
  //             status: TransactionStatus.FAILED,
  //             provider: PaymentProvider.PAYLOV,
  //             provider_transaction_id: data.octo_payment_UUID,
  //             provider_data: data as unknown as Prisma.InputJsonValue,
  //           },
  //         });
  //         this.logger.warn(
  //           `Payment #${transactionId} bekor qilindi. Status: ${data.status}`,
  //         );
  //         return;
  //       }

  //       if (!payment.booking) {
  //         throw new BadRequestException(
  //           `Tranzaktion #${transactionId} uchun booking topilmadi`,
  //         );
  //       }

  //       if (data.total_sum < Number(payment.booking.total_price)) {
  //         this.logger.error(
  //           `Summa mos kelmadi: kutilgan ${payment.booking.total_price}, kelgan ${data.total_sum} (tx #${transactionId})`,
  //         );
  //         throw new BadRequestException('To‘lov summasi mos kelmadi');
  //       }

  //       const claimed = await tx.tranzaktion.updateMany({
  //         where: {
  //           id: payment.id,
  //           status: { not: TransactionStatus.SUCCESS },
  //         },
  //         data: {
  //           status: TransactionStatus.SUCCESS,
  //           provider: PaymentProvider.PAYLOV,
  //           provider_transaction_id: data.octo_payment_UUID,
  //           provider_data: data as unknown as Prisma.InputJsonValue,
  //           paid_at: new Date(data.payed_time),
  //           owner_amount: data.transfer_sum,
  //           transfer_sum: data.transfer_sum,
  //           refunded_sum: data.refunded_sum,
  //           currency: data.currency,
  //           card_masked_pan: data.maskedPan,
  //           card_type: data.card_type,
  //           card_vendor: data.card_vendor,
  //           card_country: data.card_country,
  //           risk_level: data.riskLevel,
  //         },
  //       });

  //       if (claimed.count === 0) {
  //         this.logger.log(
  //           `Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`,
  //         );
  //         return;
  //       }

  //       await tx.booking.update({
  //         where: { id: payment.booking.id },
  //         data: { status: Booking_status.PAID },
  //       });

  //       this.logger.log(
  //         `Booking tasdiqlandi: booking #${payment.booking.id}, tx #${payment.id}`,
  //       );
  //     });
  //   } catch (error) {
  //     this.logger.error(
  //       `Octo booking payment processing failed for transaction ${transactionId}`,
  //       error instanceof Error ? error.stack : error,
  //     );

  //     if (error instanceof BadRequestException) {
  //       throw error;
  //     }

  //     if (
  //       error instanceof Prisma.PrismaClientKnownRequestError &&
  //       error.code === 'P2002'
  //     ) {
  //       this.logger.warn(
  //         `Unique constraint: provider_transaction_id takrorlanmoqda - ${data.octo_payment_UUID}. Duplicate webhook bo'lishi mumkin, status o'zgartirilmadi.`,
  //       );
  //       return;
  //     }

  //     try {
  //       await this.prisma.tranzaktion.updateMany({
  //         where: {
  //           id: transactionId,
  //           status: { not: TransactionStatus.SUCCESS },
  //         },
  //         data: { status: TransactionStatus.FAILED },
  //       });
  //     } catch (updateError) {
  //       this.logger.error(
  //         `Transaction #${transactionId} statusini FAILED qilishda ham xato yuz berdi`,
  //         updateError instanceof Error ? updateError.stack : updateError,
  //       );
  //     }

  //     throw error;
  //   }
  // }

  private isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
// imzoni provider_data ga yozmaymiz
private paylovPayload(data: PaylovWebhookDto): Prisma.InputJsonValue {
  const { signature, ...rest } = data;
  return rest as unknown as Prisma.InputJsonValue;
}

async paylovPremium_payments(transactionId: string, data: PaylovWebhookDto) {
  if (!this.isUuid(transactionId)) {
    throw new BadRequestException(`Noto'g'ri tranzaksiya id: ${transactionId}`);
  }

  try {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.premiumTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!payment) {
        throw new BadRequestException(`PremiumTransaction #${transactionId} topilmadi`);
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
        this.logger.log(`Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`);
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
        subscription && subscription.endDate > now ? subscription.endDate : now;

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
    throw new BadRequestException(`Noto'g'ri tranzaksiya id: ${transactionId}`);
  }

  try {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.tranzaktion.findUnique({
        where: { id: transactionId },
        include: { booking: true },
      });

      if (!payment) {
        throw new BadRequestException(`Tranzaktion #${transactionId} topilmadi`);
      }
      if (!payment.booking) {
        throw new BadRequestException(`Tranzaktion #${transactionId} uchun booking topilmadi`);
      }

      if (payment.provider_order_id !== String(data.order_id)) {
        this.logger.error(
          `paylov: order_id mos emas, kutilgan ${payment.provider_order_id}, kelgan ${data.order_id} (tx #${transactionId})`,
        );
        throw new BadRequestException('order_id mos kelmadi');
      }

      // foydalanuvchi aynan total_price to'laydi (yangi `amount` maydoni bo'lsa, o'sha ustuvor)
      const expected = payment.amount ?? Number(payment.booking.total_price);
      const paidAmount = Math.round(Number(data.amount));
      if (paidAmount !== expected) {
        this.logger.error(
          `paylov: summa mos emas, kutilgan ${expected}, kelgan ${data.amount} (tx #${transactionId})`,
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
          paid_at: new Date(data.timestamp),
        },
      });

      if (claimed.count === 0) {
        this.logger.log(`Payment #${transactionId} allaqachon qayta ishlangan (duplicate webhook)`);
        return;
      }

      await tx.booking.update({
        where: { id: payment.booking.id },
        data: { status: Booking_status.PAID },
      });

      this.logger.log(`Booking tasdiqlandi: booking #${payment.booking.id}, tx #${payment.id}`);
    });

    return { success: true };
  } catch (error) {
    this.logger.error(
      `Paylov booking payment failed, tx ${transactionId}`,
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
      ? await this.prisma.premiumTransaction.updateMany({ where, data: patch })
      : externalId.startsWith('BK:')
        ? await this.prisma.tranzaktion.updateMany({ where, data: patch })
        : null;

    if (!res) {
      this.logger.warn(`paylov: noma'lum external_id: ${externalId}`);
      return { success: false };
    }

    this.logger.warn(`Payment ${externalId} bekor qilindi, state=${data.state}, yangilandi: ${res.count}`);
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



private get adminChatIds(): string[] {
  const raw = [process.env.ADMIN_CHAT_ID, process.env.SUPPER_ADMIN]
    .filter(Boolean)
    .join(',');
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

private async notifyAdmins(text: string): Promise<void> {
  const ids = this.adminChatIds;
  if (ids.length === 0) {
    this.logger.warn("Admin chat ID lar .env da topilmadi, xabar yuborilmadi");
    return;
  }

  const results = await Promise.allSettled(
    ids.map((id) =>
      this.bot.telegram.sendMessage(id, text, { parse_mode: 'HTML' }),
    ),
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      this.logger.error(
        `Admin ${ids[i]} ga xabar yuborilmadi: ${r.reason instanceof Error ? r.reason.message : r.reason}`,
      );
    }
  });
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
      this.logger.warn(`paylov: refund webhook mos kelmadi (${externalId}, order=${data.order_id})`);
      return { success: true };
    }
    dbStatus = tx.status;
    details = tx.booking
      ? `📅 Bron: #${tx.booking.id}, ${formatDate(tx.booking.date, 'uz')}, ${tx.booking.start_time}–${tx.booking.end_time}\n💰 Bron summasi: ${formatSum(tx.booking.total_price)}`
      : '📅 Bron topilmadi';
  } else {
    const tx = await this.prisma.premiumTransaction.findUnique({ where: { id } });
    if (!tx || tx.provider_order_id !== String(data.order_id)) {
      this.logger.warn(`paylov: refund webhook mos kelmadi (${externalId}, order=${data.order_id})`);
      return { success: true };
    }
    dbStatus = tx.status;
    details = `⭐ Premium: owner #${tx.owner_id}, ${tx.plan}, ${tx.duration} kun\n💰 Summa: ${formatSum(tx.amount)}`;
  }

  this.logger.error(
    `PAYLOV QAYTARISH: ${externalId}, order=${data.order_id}, payment=${data.payment_id}, amount=${data.amount}, status=${dbStatus}`,
  );

  await this.notifyAdmins(
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
