import { Injectable } from '@nestjs/common';
import { MyContext } from 'src/helpers/bot.sesion';
import { PrismaService } from 'src/prisma/prisma.service';
@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService){}

    async registor(ctx: MyContext){
        ctx.reply("User Register")
    }
}
