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
  is_premium: boolean;
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

export const INITIAL_SESSION: ISession = {
  name: null,
  lang: null,
  step: null,
  maxCount: null,
  booking_step: null,
  stadion_step: null,
  owner_registor: {
    full_name: null,
    email: null,
    phone: null,
    step: null,
    id: null,
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
