import { Context } from "telegraf";

export interface ISession {
  name: string | null;
  lang: string | null;
  step: string | null;
  owner_registor: registerOwner;
  user_registor: registorUser;
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
