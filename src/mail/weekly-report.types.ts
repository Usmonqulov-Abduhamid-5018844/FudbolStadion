export interface StadiumStats {
  revenue: number;
  revenueDelta: number;
  bookings: number;
  bookingsDelta: number;
  customers: number;
  newCustomers: number;
  occupancy: number;
}

export interface FinanceSummary {
  total: number;
  avgBooking: number;
  maxBooking: number;
  avgDaily: number;
}

export interface StadiumPerformance {
  name: string;
  bookings: number;
  revenue: number;
  occupancy: number;
}

export interface DayStat {
  name: string;
  count: number;
}

export interface NamedValue {
  name?: string;
  value?: number;
}

export interface Highlights {
  topRevenue: NamedValue;
  topBooked: NamedValue;
  peakHours: string;
  topCustomer: NamedValue;
}

export type RecommendationFlag = 'green' | 'orange' | 'blue';

export interface Recommendation {
  flag: RecommendationFlag;
  title: string;
  body: string;
}

export interface StadiumReportData {
  brand: string;
  status: string;
  periodFrom: string;
  periodTo: string;
  owner: string;
  stats: StadiumStats;
  finance: FinanceSummary;
  stadiums: StadiumPerformance[];
  days: DayStat[];
  highlights: Highlights;
  recommendations: Recommendation[];
  summary: string[];
  supportEmail: string;
}

// Chaqiruvchi tomondan qisman (partial) obyekt berilishi mumkin — qolganlari default bilan to'ldiriladi
export type StadiumReportInput = Partial<Omit<StadiumReportData, 'stats' | 'finance' | 'highlights'>> & {
  stats?: Partial<StadiumStats>;
  finance?: Partial<FinanceSummary>;
  highlights?: Partial<Highlights>;
};

export const DEFAULT_REPORT_DATA: StadiumReportData = {
  brand: 'Stadium Booking Premium',
  status: 'Faol',
  periodFrom: '',
  periodTo: '',
  owner: '',
  stats: { revenue: 0, revenueDelta: 0, bookings: 0, bookingsDelta: 0, customers: 0, newCustomers: 0, occupancy: 0 },
  finance: { total: 0, avgBooking: 0, maxBooking: 0, avgDaily: 0 },
  stadiums: [],
  days: [],
  highlights: { topRevenue: {}, topBooked: {}, peakHours: '', topCustomer: {} },
  recommendations: [],
  summary: [],
  supportEmail: 'support@stadium.uz',
};

export function withDefaults(data: StadiumReportInput): StadiumReportData {
  return {
    ...DEFAULT_REPORT_DATA,
    ...data,
    stats: { ...DEFAULT_REPORT_DATA.stats, ...(data.stats || {}) },
    finance: { ...DEFAULT_REPORT_DATA.finance, ...(data.finance || {}) },
    highlights: { ...DEFAULT_REPORT_DATA.highlights, ...(data.highlights || {}) },
  };
}

export const fmt = (n: number | undefined): string =>
  Number(n || 0)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');