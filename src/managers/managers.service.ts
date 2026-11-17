import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AcceptInviteResult =
  | {
      ok: true;
      managerName: string;
      ownerChatId: string;
      stadionNames: string[];
    }
  | { ok: false; reason: 'INVALID' | 'IS_OWNER' | 'OTHER_OWNER' };

const PAGE_SIZE = 5;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

@Injectable()
export class ManagersService {
  constructor(private readonly prisma: PrismaService) {}

  getOwnerStadions(ownerId: number) {
    return this.prisma.stadion.findMany({
      where: { owner_id: ownerId, parent_id: null },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async listManagers(ownerId: number, page: number) {
    const where = { ownerId, isActive: true };
    const total = await this.prisma.manager.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), pages);

    const items = await this.prisma.manager.findMany({
      where,
      include: { _count: { select: { stadions: true } } },
      orderBy: { id: 'desc' },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });

    return { items, page: safePage, pages };
  }

  async createInvite(ownerId: number, stadionIds: number[]): Promise<string> {
    const bot = process.env.BOT_USERNAME;
    if (!bot) throw new Error('BOT_USERNAME sozlanmagan');

    const unique = [...new Set(stadionIds)];
    if (unique.length === 0) throw new BadRequestException('NO_STADION');

    const own = await this.prisma.stadion.count({
      where: { id: { in: unique }, owner_id: ownerId, parent_id: null },
    });
    if (own !== unique.length) throw new ForbiddenException();

    // muddati o'tgan invaytlarni tozalaymiz, faol invaytlar soni cheklanadi
    const now = new Date();
    await this.prisma.managerInvite.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const active = await this.prisma.managerInvite.count({
      where: { ownerId, usedAt: null, expiresAt: { gt: now } },
    });
    if (active >= 20) throw new BadRequestException('TOO_MANY_INVITES');

    const token = crypto.randomBytes(16).toString('hex');
    await this.prisma.managerInvite.create({
      data: {
        ownerId,
        tokenHash: sha256(token),
        stadionIds: unique,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    return `https://t.me/${bot}?start=mgr_${token}`;
  }

  async acceptInvite(
    telegramId: string,
    name: string,
    token: string,
  ): Promise<AcceptInviteResult> {
    if (!/^[a-f0-9]{32}$/.test(token)) return { ok: false, reason: 'INVALID' };
    const tokenHash = sha256(token);

    // Owner o'z havolasini bosib qolsa, token yonib ketmasin
    const owner = await this.prisma.owners.findUnique({
      where: { chatID: telegramId },
      select: { id: true },
    });
    if (owner) return { ok: false, reason: 'IS_OWNER' };

    return this.prisma.$transaction(async (tx): Promise<AcceptInviteResult> => {
      const invite = await tx.managerInvite.findUnique({
        where: { tokenHash },
      });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        return { ok: false, reason: 'INVALID' };
      }

      // Bir odam faqat bitta owner'ning menejeri bo'lishi mumkin
      const existing = await tx.manager.findUnique({
        where: { telegramId },
        select: { ownerId: true, isActive: true },
      });
      if (existing?.isActive && existing.ownerId !== invite.ownerId) {
        return { ok: false, reason: 'OTHER_OWNER' };
      }

      // Stadionlar hali ham shu owner'nikimi va mavjudmi
      const stadions = await tx.stadion.findMany({
        where: {
          id: { in: invite.stadionIds },
          owner_id: invite.ownerId,
          parent_id: null,
        },
        select: { id: true, name: true },
      });
      if (stadions.length === 0) return { ok: false, reason: 'INVALID' };

      // Bir martalik: atomik band qilish (ikki marta bosilsa, ikkinchisi o'tmaydi)
      const claimed = await tx.managerInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false, reason: 'INVALID' };

      const manager = await tx.manager.upsert({
        where: { telegramId },
        update: {
          isActive: true,
          isPaused: false,
          ownerId: invite.ownerId,
          name: name.slice(0, 100),
        },
        create: {
          telegramId,
          ownerId: invite.ownerId,
          name: name.slice(0, 100),
        },
        select: { id: true, name: true },
      });

      // Avval olib tashlangan menejer qayta qo'shilsa, eski biriktirishlar tozalanadi
      if (existing && !existing.isActive) {
        await tx.managerStadion.deleteMany({
          where: { managerId: manager.id },
        });
      }

      await tx.managerStadion.createMany({
        data: stadions.map((s) => ({ managerId: manager.id, stadionId: s.id })),
        skipDuplicates: true,
      });

      const ownerRow = await tx.owners.findUniqueOrThrow({
        where: { id: invite.ownerId },
        select: { chatID: true },
      });

      return {
        ok: true,
        managerName: manager.name,
        ownerChatId: ownerRow.chatID,
        stadionNames: stadions.map((s) => s.name),
      };
    });
  }
  // Menejer kartasi: ma'lumot + biriktirilgan stadionlar + tasdiqlagan bronlari
  async getManagerCard(ownerId: number, managerId: number) {
    const manager = await this.prisma.manager.findFirst({
      where: { id: managerId, ownerId, isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        telegramId: true,
        isPaused: true,
        createdAt: true,
        stadions: { select: { stadion: { select: { id: true, name: true } } } },
      },
    });
    if (!manager) return null;

    const handled = await this.prisma.booking.count({
      where: { handledByManagerId: managerId },
    });

    return { ...manager, handled };
  }

  async setPaused(
    ownerId: number,
    managerId: number,
    paused: boolean,
  ): Promise<boolean> {
    const res = await this.prisma.manager.updateMany({
      where: { id: managerId, ownerId, isActive: true },
      data: { isPaused: paused },
    });
    return res.count > 0;
  }

  // Stadionni biriktirish / olib tashlash (bir bosishda)
  async toggleStadion(
    ownerId: number,
    managerId: number,
    stadionId: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [manager, stadion] = await Promise.all([
        tx.manager.findFirst({
          where: { id: managerId, ownerId, isActive: true },
          select: { id: true },
        }),
        tx.stadion.findFirst({
          where: { id: stadionId, owner_id: ownerId, parent_id: null },
          select: { id: true },
        }),
      ]);
      if (!manager || !stadion) return false; // begona ID

      const removed = await tx.managerStadion.deleteMany({
        where: { managerId, stadionId },
      });
      if (removed.count === 0) {
        await tx.managerStadion.createMany({
          data: [{ managerId, stadionId }],
          skipDuplicates: true, // ikki marta tez bosilsa ham xato bo'lmaydi
        });
      }
      return true;
    });
  }

  // O'chirish (oldingi javobdagi removeManager o'zgarishsiz qoladi)

  // O'chirish: yozuv o'chmaydi, isActive=false (bronlardagi tarix saqlanadi)
  async removeManager(
    ownerId: number,
    managerId: number,
  ): Promise<{ telegramId: string; lang: string } | null> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const manager = await tx.manager.findFirst({
        where: { id: managerId, ownerId, isActive: true },
        select: { telegramId: true },
      });
      if (!manager) return null;

      const res = await tx.manager.updateMany({
        where: { id: managerId, ownerId, isActive: true },
        data: { isActive: false, isPaused: false },
      });
      if (res.count === 0) return null;

      await tx.managerStadion.deleteMany({ where: { managerId } });
      return manager;
    });
    if (!removed) return null;

    const session = await this.prisma.sesion.findUnique({
      where: { chat_id: removed.telegramId },
      select: { lang: true },
    });
    return { telegramId: removed.telegramId, lang: session?.lang ?? 'uz' };
  }
}
