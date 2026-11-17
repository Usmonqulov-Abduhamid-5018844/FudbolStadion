import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Actor } from './actor';

@Injectable()
export class ActorService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(telegramId: string): Promise<Actor | null> {
    const session = await this.prisma.sesion.findUnique({
      where: { chat_id: telegramId },
      select: { lang: true },
    });
    const language = session?.lang ?? 'uz';

    const owner = await this.prisma.owners.findUnique({
      where: { chatID: telegramId },
      select: { id: true },
    });
    if (owner) {
      return {
        ownerId: owner.id,
        isManager: false,
        managerId: null,
        stadionIds: null,
        language,
      };
    }

    const m = await this.prisma.manager.findFirst({
      where: {
        telegramId,
        isActive: true,
        isPaused: false
      },
      select: {
        id: true,
        ownerId: true,
        stadions: { select: { stadionId: true } },
      },
    });
    if (!m) return null;

    return {
      ownerId: m.ownerId,
      isManager: true,
      managerId: m.id,
      stadionIds: m.stadions.map((s) => s.stadionId),
      language,
    };
  }
}
