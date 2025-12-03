import { Context } from 'telegraf';

export interface ISession {
  name: string | null;
  lang: string | null;
  step: string | null;
  stadion_step: string | null;
  owner_registor: registerOwner;
  user_registor: registorUser;
  stadion: Stadion;
}
export interface Stadion {
  name: string | null;
  lockation: string | null;
  price: string | null;
  image: string | null;
  region_id: number | null;
  region_item_id: number | null;
  owner_id: number | null;
  length: string | null;
  width: string | null;
  payments_type: string | null;
}

export interface registerOwner {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  step: string | null;
}

export interface registorUser {
  full_name: string | null;
  phone: string | null;
  step: string | null;
}

export interface MyContext extends Context {
  session: ISession;
}
