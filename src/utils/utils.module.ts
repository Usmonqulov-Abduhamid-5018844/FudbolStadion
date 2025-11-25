import { Module } from "@nestjs/common";
import { TelegrafModule } from "nestjs-telegraf";
import { UtilisService } from "./utile.service";

@Module({
    providers: [UtilisService],
    imports:[TelegrafModule],
    exports: [UtilisService]

})
export class UtileModule {}