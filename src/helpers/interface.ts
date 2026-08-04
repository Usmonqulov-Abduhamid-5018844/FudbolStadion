import {
  Payments,
  Region,
  Region_item,
  Owners,
  Stadion_chedule,
  Booking,
  stadion_off_days,
  stadion_special_schedule,
  Booking_status,
  Pay_method,
} from '@prisma/client';
import { ISession } from './bot.sesion';
import { Decimal } from '@prisma/client/runtime/library';

export interface IStadion {
  id: number;
  distance?: number;
  name: string;
  latitude: number;
  longitude: number;
  image: string;
  price: number;
  region_id: number;
  region_item_id: number;
  owner_id: number;
  max_count: number;
  working_status: boolean;
  length: number;
  width: number;
  payments_type: Payments;
  createdAt: Date;
  updatedAt: Date;
  region: Region;
  mini: boolean;
  stadion_mini: boolean;
  region_items: Region_item;
  owner?: Owners;
  stadionChedules?: Stadion_chedule[];
  bookings?: Booking[];
  ownerStadions?: number[];
  stadionOffDays?: stadion_off_days[];
  stadionSpecialSchedules?: stadion_special_schedule[];
  ownerActiveBooking?: number[];
  advertisements?: number[];

  advertisement?: {
    title?: string;
    description?: string;
    image?: string;
    stadionId?: number;
    isAllStadiums?: boolean;
  };
}

export interface IBooking {
  id: number;
  user_id: number;
  stadion_id: number;
  date: Date;
  start_time: string;
  end_time: string;
  total_price: Decimal;
  startAt: Date;
  endAt: Date;
  check_in: boolean;
  status: Booking_status;
  payment_method: Pay_method;
  createdAt: Date;
  updatedAt: Date;
  expires_at?: Date | null;
  status_pay_later: boolean;

  stadion: IStadion;
  user: IUser;
}
export interface IUser {
  id: number;
  username?: string | null;
  phone: string;
  full_name: string;
  chatID: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum EStadion_type {
  BIG = 'big',
  SMOL = 'smol',
}

export type NotificationSettings = {
  newBooking?: boolean;
  cancel?: boolean;
  payment?: boolean;
  reminder?: boolean;
};

export const INITIAL_SESSION: ISession = {
  name: null,
  lang: null,
  step: null,
  advertisement_step: null,
  admin_messageId: null,
  maxCount: null,
  booking_step: null,
  stadion_step: null,
  ownerBrons: null,
  ownerDataFilter: null,
  advertisements: [],
  linkes: [],
  kalanConfirment: [],
  owner_registor: {
    full_name: null,
    email: null,
    phone: null,
    step: null,
    id: null,
  },
  advertisement: {
    title: null,
    description: null,
    image: null,
    stadionId: null,
    isAllStadiums: false,
  },
  user_registor: {
    full_name: null,
    phone: null,
    step: null,
    id: null,
  },
  stadion: {
    step: 0,
    name: null,
    lockation: null,
    latitude: null,
    longitude: null,
    price: null,
    max_count: null,
    image: null,
    region_id: null,
    region_item_id: null,
    owner_id: null,
    length: null,
    width: null,
    payments_type: Payments.CASH,
    payments: null,
    schedule_day: null,
    id: null,
    schedule_id: null,
    special: new Date(),
    off: null,
  },
};

export enum PremiumPlan {
  WEEK_1 = 'WEEK_1',
  MONTH_1 = 'MONTH_1',
  MONTH_3 = 'MONTH_3',
  MONTH_6 = 'MONTH_6',
  YEAR_1 = 'YEAR_1',
}

export const PLAN_LABELS = {
  uz: {
    WEEK_1: '🎁 7 KUN',
    MONTH_1: '📅 1 OY',
    MONTH_3: '🔥 3 OY',
    MONTH_6: '💎 6 OY',
    YEAR_1: '🏆 1 YIL',
  },
  ru: {
    WEEK_1: '🎁 7 ДНЕЙ',
    MONTH_1: '📅 1 МЕСЯЦ',
    MONTH_3: '🔥 3 МЕСЯЦА',
    MONTH_6: '💎 6 МЕСЯЦЕВ',
    YEAR_1: '🏆 1 ГОД',
  },
  en: {
    WEEK_1: '🎁 7 DAYS',
    MONTH_1: '📅 1 MONTH',
    MONTH_3: '🔥 3 MONTHS',
    MONTH_6: '💎 6 MONTHS',
    YEAR_1: '🏆 1 YEAR',
  },
} as const;

export enum Premium_price {
  MONTH_1 = '39k',
  MONTH_3 = '99k',
  YEAR_1 = '299k',
}
export const PREMIUM_PLANS = {
  MONTH_1: {
    price: 39000,
    discount: null,
  },
  MONTH_3: {
    price: 99000,
    discount: 117000,
  },
  YEAR_1: {
    price: 299000,
    discount: 468000,
  },
} as const;

export const CURRENCY_LABELS = {
  uz: "so'm",
  ru: 'сум',
  en: 'UZS',
} as const;
