import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatOcto_PaymentDto } from './dto/create-payment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransactionStatus } from '@prisma/client';
@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async octoPremium_payments(data: CreatOcto_PaymentDto) {
    const transactionId = data.shop_transaction_id.replace('premium_', '')
    try {
        if (!transactionId) {
      throw new BadRequestException('Noto‘g‘ri transaction ID');
    }

    if (data.status !== 'succeeded') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {

      const payment = await tx.premiumTransaction.findUnique({
        where: {
          id: transactionId,
        },
      });

      if (!payment) {
        throw new BadRequestException(
          `PremiumTransaction #${transactionId} topilmadi`,
        );
      }

      if (payment.status === TransactionStatus.SUCCESS) {
        return;
      }

      await tx.premiumTransaction.update({
        where: {
          id: payment.id,
        },
        data: {
          status: 'SUCCESS',
          octo_payment_UUID: data.octo_payment_UUID,
          paid_at: new Date(data.payed_time),
          amount: data.total_sum,
          transfer_sum:data.transfer_sum,
          refunded_sum:data.refunded_sum,

        },
      });

      const owner = await tx.owners.findUnique({
        where: {
          id: payment.owner_id,
        },
      });

      if (!owner) {
        throw new BadRequestException(`Owner #${payment.owner_id} topilmadi`);
      }

      const subscription = await tx.subscription.findFirst({
        where: {
          ownerId: owner.id,
          isActive: true,
        },
        orderBy: {
          endDate: 'desc',
        },
      });

      const now = new Date();

      const startDate =
        subscription && subscription.endDate > now ? subscription.endDate : now;

      const endDate = new Date(startDate);

      endDate.setDate(endDate.getDate() + payment.duration);

      if (subscription) {
        await tx.subscription.update({
          where: {
            id: subscription.id,
          },
          data: {
            endDate,
            plan: payment.plan,
            isActive: true,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            ownerId: owner.id,
            plan: payment.plan,
            startDate,
            endDate,
            isActive: true,
          },
        });
      }
      
    });
    
    } catch (error) {
      return
    }
  }

  findAll() {
    return `This action returns all payment`;
  }
}
