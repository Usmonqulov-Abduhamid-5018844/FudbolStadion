import { Injectable } from '@nestjs/common';
import { Booking_status, Admin_S, Prisma } from '@prisma/client';
import {
  ActiveOwnerSummary,
  OwnerWeeklyRawData,
  RawBooking,
  StadiumCapacity,
} from './weekly-report.interface';
import { PrismaService } from 'src/prisma/prisma.service';

const SUCCESSFUL_STATUSES: Booking_status[] = [
  'CONFIRMED',
  'PAID',
  'COMPLETED',
];

function parseHoursDiff(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + (sm || 0);
  let endMinutes = eh * 60 + (em || 0);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
}

@Injectable()
export class WeeklyReportQuery {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveOwners(): Promise<ActiveOwnerSummary[]> {
    const owners = await this.prisma.owners.findMany({
      where: {
        status: Admin_S.ACTIVE,
        subscriptions: {
          some: {
            isActive: true,
          },
        },
        notificationSettings: {
          path: ['WEEKLY_STATS'],
          equals: true,
        },
      },
      select: {
        id: true,
        full_name: true,
        chatID: true,
        email: true,
      },
    });
    return owners.map((o: any) => ({
      id: o.id,
      fullName: o.full_name,
      chatID: o.chatID,
      email: o.email,
    }));
  }

  async getOwnerWeeklyRawData(
    ownerId: number,
    from: Date,
    to: Date,
  ): Promise<OwnerWeeklyRawData> {
    const owner = await this.prisma.owners.findUniqueOrThrow({
      where: { id: ownerId },
    });

    const stadiums = await this.prisma.stadion.findMany({
      where: { owner_id: ownerId, working_status: true },
      include: { stadionChedules: true },
    });
    const stadiumIds = stadiums.map((s: any) => s.id);

    if (stadiumIds.length === 0) {
      return {
        ownerId,
        ownerName: owner.full_name,
        ownerChatId: owner.chatID,
        periodFrom: from,
        periodTo: to,
        bookings: [],
        previousWeekRevenue: 0,
        previousWeekBookingsCount: 0,
        previousWeekCustomerIds: [],
        stadiumCapacities: [],
      };
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        stadion_id: { in: stadiumIds },
        status: { in: SUCCESSFUL_STATUSES },
        startAt: { gte: from, lte: to },
      },
      include: { stadion: true, user: true },
    });

    const customerIds: number[] = Array.from(
      new Set<number>(bookings.map((b: any) => b.user_id as number)),
    );

    type FirstBookingRow = {
      user_id: number;
      _min: { createdAt: Date | null };
    };

    const firstBookings = customerIds.length
      ? await this.prisma.booking.groupBy({
          by: ['user_id'],
          where: {
            stadion_id: { in: stadiumIds },
            status: { in: SUCCESSFUL_STATUSES },
            user_id: { in: customerIds },
          },
          _min: { createdAt: true },
        })
      : ([] as FirstBookingRow[]);

    const firstDateByCustomer: Map<number, Date | null> = new Map(
      firstBookings.map((r: FirstBookingRow): [number, Date | null] => [
        r.user_id,
        r._min.createdAt,
      ]),
    );

    const rawBookings: RawBooking[] = bookings.map((b: any) => ({
      stadiumId: b.stadion_id,
      stadiumName: b.stadion.name,
      customerId: b.user_id,
      customerName: b.user.full_name,
      amount: Number(b.total_price),
      createdAt: b.createdAt,
      startAt: b.startAt,
      endAt: b.endAt,
      isFirstBookingEver:
        firstDateByCustomer.get(b.user_id)?.getTime() === b.createdAt.getTime(),
    }));

    const previousFrom = new Date(from);
    previousFrom.setDate(previousFrom.getDate() - 7);
    const previousTo = new Date(from);
    previousTo.setMilliseconds(-1);

    const previousBookings = await this.prisma.booking.findMany({
      where: {
        stadion_id: { in: stadiumIds },
        status: { in: SUCCESSFUL_STATUSES },
        startAt: { gte: previousFrom, lte: previousTo },
      },
      select: { total_price: true, user_id: true },
    });
    const previousWeekRevenue = previousBookings.reduce(
      (sum: number, b: any) => sum + Number(b.total_price),
      0,
    );
    const previousWeekCustomerIds: number[] = [
      ...new Set<number>(previousBookings.map((b: any) => b.user_id as number)),
    ];

    const stadiumCapacities: StadiumCapacity[] = stadiums.map((s: any) => {
      const weeklyCapacityHours = s.stadionChedules.reduce(
        (sum: number, sch: any) =>
          sum + parseHoursDiff(sch.start_time, sch.end_time),
        0,
      );
      return { stadiumId: s.id, stadiumName: s.name, weeklyCapacityHours };
    });

    return {
      ownerId,
      ownerName: owner.full_name,
      ownerChatId: owner.chatID,
      periodFrom: from,
      periodTo: to,
      bookings: rawBookings,
      previousWeekRevenue,
      previousWeekBookingsCount: previousBookings.length,
      previousWeekCustomerIds,
      stadiumCapacities,
    };
  }
}
