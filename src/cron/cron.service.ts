import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';

@Injectable()
export class CronService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}
  private isCancelRunning = false;
  private isNoShowRunning = false;
  private isCompletedRunning = false;
  private isPayLaterCancelRunning = false;

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredBookings() {
    if (this.isCancelRunning) return;
    this.isCancelRunning = true;

    try {
      const result = await this.prisma.booking.updateMany({
        where: {
          status: 'PENDING',
          status_pay_later: false,
          expires_at: {
            lt: new Date(),
          },
        },
        data: { status: 'CANCELED' },
      });

      console.log(`Expired bookings canceled: ${result.count}`);
    } catch (error) {
      console.log('Cancel cron error:', error.message);
    } finally {
      this.isCancelRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async no_showBooking() {
    if (this.isNoShowRunning) return;
    this.isNoShowRunning = true;

    try {
      const now = new Date();

      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: ['CONFIRMED', 'PAID'] },
          endAt: { lte: now },
          check_in: false,
        },
        data: { status: 'NOSHOW' },
      });

      console.log(`NO_SHOW updated: ${result.count}`);
    } catch (error) {
      console.log('NoShow cron error:', error.message);
    } finally {
      this.isNoShowRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async bookingCompleted() {
    if (this.isCompletedRunning) return;
    this.isCompletedRunning = true;

    try {
      const now = new Date();

      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: ['CONFIRMED', 'PAID'] },
          endAt: { lte: now },
          check_in: true,
        },
        data: { status: 'COMPLETED' },
      });

      console.log(`Bookings completed: ${result.count}`);
    } catch (error) {
      console.log('Completed cron error:', error.message);
    } finally {
      this.isCompletedRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async bookingCancel() {
    if(this.isPayLaterCancelRunning) return;
    this.isPayLaterCancelRunning = true;
    try {
      const now = new Date();

      const result = await this.prisma.booking.updateMany({
        where: {
          status: 'PENDING',
          startAt: {
            lte: new Date(now.getTime() + 60 * 60 * 1000),
          },
          status_pay_later: true,
        },
        data: { status: 'CANCELED' },
      });

      console.log(`Pay-later canceled: ${result.count}`);
    } catch (error) {
      console.log('Cron error:', error.message);
    }
    finally{
      this.isPayLaterCancelRunning = false;
    }
  }
}
