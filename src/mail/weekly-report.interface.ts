/**
 * Prisma sxemangizga (Owners, Stadion, Booking, Users, Stadion_chedule)
 * mos xom ma'lumot shakllari.
 */

export interface RawBooking {
  stadiumId: number;
  stadiumName: string;
  customerId: number;
  customerName: string;
  /** Booking.total_price (Decimal'dan number'ga o'girilgan) */
  amount: number;
  createdAt: Date;
  startAt: Date;
  endAt: Date;
  /** Shu mijozning ushbu ega (owner) stadionlaridagi eng birinchi bandlovimi */
  isFirstBookingEver: boolean;
}

export interface StadiumCapacity {
  stadiumId: number;
  stadiumName: string;
  /** Stadion_chedule asosida hisoblangan haftalik ishlash soatlari (masalan 7 kun x 14 soat = 98) */
  weeklyCapacityHours: number;
}

export interface OwnerWeeklyRawData {
  ownerId: number;
  ownerName: string;
  ownerChatId: string;
  periodFrom: Date;
  periodTo: Date;
  bookings: RawBooking[];
  previousWeekRevenue: number;
  previousWeekBookingsCount: number;
  previousWeekCustomerIds: number[];
  stadiumCapacities: StadiumCapacity[];
}

export interface ActiveOwnerSummary {
  id: number;
  fullName: string;
  chatID: string;
  email: string;
}