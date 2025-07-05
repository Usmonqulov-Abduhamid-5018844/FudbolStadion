import { Context } from "telegraf";

export interface IssesionData {
    phone:string | null
    location:string | null
    region: string |null
    description: string |null
    price:string |null
    img:string | null
    menigerid: string | null

    stadion: {
        phone:string | null
        location:string | null
        region: string |null
        description: string |null
        price:number |null
        img:string | null
        menigerid: string | null
    }
    page?: number
}
export interface MyContex extends Context {
    session: IssesionData
}