import { Context } from 'telegraf';

export interface ISesion {
  name: null | string;
  lang: null | string;
  step: null | string;
}

export interface MyContext extends Context {
  session: ISesion;
}
