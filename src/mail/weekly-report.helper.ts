import { OwnerWeeklyRawData, RawBooking } from './weekly-report.interface';
import { DayStat, Recommendation, StadiumPerformance, StadiumReportData } from './weekly-report.types';
// import { StadiumReportData, StadiumPerformance, DayStat, Recommendation } from './weekly-report.types';

const DAY_NAMES_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
// getDay(): 0=Yaksh...6=Shanba. Hisobotda Dushanbadan boshlanadi:
const ORDERED_DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0];

function formatDateUz(date: Date): string {
  const months = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
  ];
  return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function percentDelta(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function bookingHours(b: RawBooking): number {
  return Math.max(0, (b.endAt.getTime() - b.startAt.getTime()) / (1000 * 60 * 60));
}

/**
 * Cron hozir ishga tushgan paytdan oldingi to'liq tugagan hafta
 * (Dushanba 00:00 — Yakshanba 23:59:59.999) oralig'ini hisoblaydi.
 */
export function getLastFullWeekRange(now: Date): { from: Date; to: Date } {
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - daysSinceMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setMilliseconds(-1);

  return { from: lastMonday, to: lastSunday };
}

export function buildStadiumReportData(raw: OwnerWeeklyRawData): StadiumReportData {
  const { bookings } = raw;

  // ---------- Umumiy statistika ----------
  const revenue = bookings.reduce((sum, b) => sum + b.amount, 0);
  const bookingsCount = bookings.length;
  const uniqueCustomerIds = new Set(bookings.map((b) => b.customerId));
  const newCustomersCount = new Set(bookings.filter((b) => b.isFirstBookingEver).map((b) => b.customerId)).size;

  const revenueDelta = percentDelta(revenue, raw.previousWeekRevenue);
  const bookingsDelta = percentDelta(bookingsCount, raw.previousWeekBookingsCount);

  const totalCapacityHours = raw.stadiumCapacities.reduce((sum, s) => sum + s.weeklyCapacityHours, 0);
  const totalBookedHours = bookings.reduce((sum, b) => sum + bookingHours(b), 0);
  const overallOccupancy = totalCapacityHours > 0 ? Math.round((totalBookedHours / totalCapacityHours) * 100) : 0;

  // ---------- Stadionlar bo'yicha (soat asosida bandlik) ----------
  const stadiums: StadiumPerformance[] = raw.stadiumCapacities.map((cap) => {
    const stadiumBookings = bookings.filter((b) => b.stadiumId === cap.stadiumId);
    const stadiumRevenue = stadiumBookings.reduce((sum, b) => sum + b.amount, 0);
    const bookedHours = stadiumBookings.reduce((sum, b) => sum + bookingHours(b), 0);
    const occupancy = cap.weeklyCapacityHours > 0 ? Math.round((bookedHours / cap.weeklyCapacityHours) * 100) : 0;
    return { name: cap.stadiumName, bookings: stadiumBookings.length, revenue: stadiumRevenue, occupancy };
  });

  // ---------- Kunlik faollik (Dush -> Yaksh, bandlovlar soni) ----------
  const dayCounts = new Map<number, number>();
  for (const b of bookings) {
    const dow = b.startAt.getDay();
    dayCounts.set(dow, (dayCounts.get(dow) || 0) + 1);
  }
  const days: DayStat[] = ORDERED_DAY_INDEXES.map((dow) => ({
    name: DAY_NAMES_UZ[dow],
    count: dayCounts.get(dow) || 0,
  }));

  // ---------- Peak soatlar (4 soatlik eng band oyna) ----------
  const hourCounts = new Array(24).fill(0);
  for (const b of bookings) hourCounts[b.startAt.getHours()] += 1;
  let bestStart = 18;
  let bestTotal = -1;
  for (let start = 0; start < 24; start++) {
    let total = 0;
    for (let h = 0; h < 4; h++) total += hourCounts[(start + h) % 24];
    if (total > bestTotal) {
      bestTotal = total;
      bestStart = start;
    }
  }
  const peakHours = `${String(bestStart).padStart(2, '0')}:00 – ${String((bestStart + 4) % 24).padStart(2, '0')}:00`;

  // ---------- Yutuqlar ----------
  const topRevenueStadium = [...stadiums].sort((a, b) => b.revenue - a.revenue)[0];
  const topBookedStadium = [...stadiums].sort((a, b) => b.bookings - a.bookings)[0];

  const customerBookingCounts = new Map<number, { name: string; count: number }>();
  for (const b of bookings) {
    const entry = customerBookingCounts.get(b.customerId) || { name: b.customerName, count: 0 };
    entry.count += 1;
    customerBookingCounts.set(b.customerId, entry);
  }
  const topCustomerEntry = [...customerBookingCounts.values()].sort((a, b) => b.count - a.count)[0];

  // ---------- Qaytgan mijozlar foizi ----------
  const returningCustomers = [...uniqueCustomerIds].filter((id) => raw.previousWeekCustomerIds.includes(id));
  const returningPercent = uniqueCustomerIds.size > 0
    ? Math.round((returningCustomers.length / uniqueCustomerIds.size) * 100)
    : 0;

  // ---------- Avtomatik tavsiyalar ----------
  const morningBookedHours = bookings
    .filter((b) => b.startAt.getHours() >= 6 && b.startAt.getHours() < 12)
    .reduce((sum, b) => sum + bookingHours(b), 0);
  const morningCapacityHours = totalCapacityHours * (6 / 24);
  const morningOccupancy = morningCapacityHours > 0 ? Math.round((morningBookedHours / morningCapacityHours) * 100) : 0;

  const avgOccupancy = stadiums.length > 0 ? stadiums.reduce((sum, s) => sum + s.occupancy, 0) / stadiums.length : 0;
  const weakestStadium = [...stadiums].sort((a, b) => a.occupancy - b.occupancy)[0];
  const busiestDay = [...days].sort((a, b) => b.count - a.count)[0];
  const maxDayCount = Math.max(1, ...days.map((d) => d.count));
  const busiestDayShare = (busiestDay.count / maxDayCount) * 100;

  const recommendations: Recommendation[] = [];
  if (morningOccupancy < 50) {
    recommendations.push({
      flag: 'green',
      title: `Ertalabki bandlik atigi ${morningOccupancy}%`,
      body: "10–15% chegirma kampaniyasini boshlang, ertalabki soatlarga mijoz jalb qilish uchun.",
    });
  }
  if (weakestStadium && weakestStadium.occupancy < avgOccupancy - 10) {
    recommendations.push({
      flag: 'orange',
      title: `${weakestStadium.name} o'rtachadan past`,
      body: "Ushbu stadionni Telegram kanalida faolroq reklama qiling.",
    });
  }
  if (busiestDayShare >= 100 && busiestDay.count > 0) {
    recommendations.push({
      flag: 'blue',
      title: `${busiestDay.name} kuni eng band kun bo'ldi`,
      body: "Qo'shimcha bandlash vaqt oralig'larini ochishni ko'rib chiqing.",
    });
  }

  const summary: string[] = [
    `Daromad ${revenueDelta >= 0 ? '+' : ''}${revenueDelta}% ga o'zgardi`,
    `Bandlik ${overallOccupancy}% ga yetdi`,
    `Mijozlarning ${returningPercent}% qaytdi`,
    revenueDelta >= 0 ? "Biznes barqaror o'sib bormoqda" : "Diqqat: daromad pasaygan, tavsiyalarga e'tibor bering",
  ];

  return {
    brand: 'Stadium Booking',
    status: 'Faol',
    periodFrom: formatDateUz(raw.periodFrom),
    periodTo: formatDateUz(raw.periodTo),
    owner: raw.ownerName,
    stats: {
      revenue,
      revenueDelta,
      bookings: bookingsCount,
      bookingsDelta,
      customers: uniqueCustomerIds.size,
      newCustomers: newCustomersCount,
      occupancy: overallOccupancy,
    },
    finance: {
      total: revenue,
      avgBooking: bookingsCount > 0 ? Math.round(revenue / bookingsCount) : 0,
      maxBooking: bookings.length > 0 ? Math.max(...bookings.map((b) => b.amount)) : 0,
      avgDaily: Math.round(revenue / 7),
    },
    stadiums,
    days,
    highlights: {
      topRevenue: topRevenueStadium ? { name: topRevenueStadium.name, value: topRevenueStadium.revenue } : {},
      topBooked: topBookedStadium ? { name: topBookedStadium.name, value: topBookedStadium.bookings } : {},
      peakHours,
      topCustomer: topCustomerEntry ? { name: topCustomerEntry.name, value: topCustomerEntry.count } : {},
    },
    recommendations,
    summary,
    supportEmail: 'support.stadiumbot@gmail.com',
  };
}