import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { UtilisService } from 'src/utils/utile.service';

@Injectable()
export class CronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilisService,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredBookings() {
    try {

      await this.prisma.booking.updateMany({
        where: {
          status: 'PENDING',
          status_pay_later: false,
          expires_at: {
            lt: new Date(),
          },
        },
        data: {
          status: 'CANCELED',
        },
      });
    } catch (error) {
      console.log(error.message);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async no_showBooking() {
    try {
      const booking = await this.prisma.booking.findMany({
        where: {
          status: {
            in: ['CONFIRMED', 'PAID'],
          },
          check_in: false,
        },
        select:{
          id:true,
          date:true,
          end_time:true,
        }
      });
      await this.prisma.booking.updateMany({
        where: {
          id: {
            in: booking
              .filter(
                (b) =>
                  this.utils.bookingTimeCalculate(b.date, b.end_time)
                    .totalMinutes <= 0,
              )
              .map((b) => b.id),
          },
        },
        data: { status: 'NO_SHOW' },
      });
    } catch (error) {
      console.log(error.message);
    }
  }
  @Cron(CronExpression.EVERY_30_MINUTES)
  async bookingCampleted() {
    try {
      const booking = await this.prisma.booking.findMany({
        where: {
          check_in: true,
          status:{
            in: ['CONFIRMED', 'PAID'],
          }
        },
        select:{
          id:true,
          date:true,
          end_time:true,
        }
      });
      await this.prisma.booking.updateMany({
        where: {
          id: {
            in: booking
              .filter(
                (b) =>
                  this.utils.bookingTimeCalculate(b.date, b.end_time)
                    .totalMinutes <= 0,
              )
              .map((b) => b.id),
          },
        },
        data: { status: 'COMPLETED' },
      });
    } catch (error) {
      console.log(error.message);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async bookingCancel() {
    try {
      const booking = await this.prisma.booking.findMany({
        where: {
          status: {
            in: ['PENDING'],
          },
          status_pay_later: true,
        },
        select:{
          id:true,
          date:true,
          start_time:true,
        }
      });
      await this.prisma.booking.updateMany({
        where: {
          id: {
            in: booking
              .filter(
                (b) =>
                  this.utils.bookingTimeCalculate(b.date, b.start_time)
                    .totalMinutes < 60,
              )
              .map((b) => b.id),
          },
        },
        data: { status: 'CANCELED' },
      });
    } catch (error) {
      console.log(error.message);
    }
  }
}
