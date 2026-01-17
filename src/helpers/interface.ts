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

export interface IStadion {
  id: number;
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
