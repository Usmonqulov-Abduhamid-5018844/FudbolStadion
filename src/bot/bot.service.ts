import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Context } from "telegraf";

@Injectable()
export class BotService {
  constructor(private readonly prisma: PrismaService){}

  async start(ctx: Context) {
    ctx.reply("Salom")
  }
}