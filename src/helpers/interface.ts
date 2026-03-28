import {
  Payments,
  Region,
  Region_item,
  Owners,
  Stadion_chedule,
  Booking,
  stadion_off_days,
  stadion_special_schedule,
} from '@prisma/client';
import { ISession } from './bot.sesion';

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
  region?: Region;
  region_items?: Region_item;
  owner?: Owners;
  stadionChedules?: Stadion_chedule[];
  bookings?: Booking[];
  stadionOffDays?: stadion_off_days[];
  stadionSpecialSchedules?: stadion_special_schedule[];
}

export const INITIAL_SESSION: ISession = {
  name: null,
  lang: null,
  step: null,
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
