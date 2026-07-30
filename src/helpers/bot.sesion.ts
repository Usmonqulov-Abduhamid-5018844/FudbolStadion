import { Payments } from '@prisma/client';
import { Context } from 'telegraf';

export interface ISession {
  name: string | null;
  lang: string | null;
  step: string | null;
  admin_messageId: number | null;
  stadion_step: string | null;
  owner_registor: registerOwner;
  user_registor: registorUser;
  stadion: Stadion;
  maxCount?: string | null;
  mini?: boolean | null;
  ownerStadions?: number[];
  stadionMessages?: number[];
  stadionFavoritMessages?: number[];
  bookingBrones?: number[];
  booking_step: string | null;
  ownerActiveBooking?: number[];
  advertisements?: number[];
  linkes?: any[];
  kalanConfirment?: number[];
  ownerBrons: string | null;
  ownerDataFilter: string | null;

  advertisement: {
    title: string | null;
    description: string | null;
    image: string | null;
    stadionId: number | null;
    isAllStadiums: boolean;
  };
}
export interface Stadion {
  step: number;
  name: string | null;
  lockation: string | null;
  latitude: number | null;
  longitude: number | null;
  price: string | null | number;
  max_count: number | null;
  image: string | null;
  region_id: number | null;
  region_item_id: number | null;
  owner_id: number | null;
  length: string | null | number;
  width: string | null | number;
  payments_type: Payments;
  payments: string | null;
  schedule_day: null | number;
  id: number | null;
  schedule_id: number | null;
  special: Date;
  off: number | null;
}

export interface registerOwner {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  step: string | null;
  id: number | null;
}

export interface registorUser {
  full_name: string | null;
  phone: string | null;
  step: string | null;
  id: number | null;
}

export interface MyContext extends Context {
  session: ISession;
  match?: RegExpMatchArray;
  advertisement: AdvertisementSession;
}

export interface AdvertisementSession {
  title: string | null;
  description: string | null;
  image: string | null;
  stadionId: number | null;
  isAllStadiums: boolean;
}
