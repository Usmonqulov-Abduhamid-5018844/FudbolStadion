import { Context } from "telegraf";

export interface ISesion{
    name: null | string
}

export interface MyContext extends Context {
    sesion: ISesion
}