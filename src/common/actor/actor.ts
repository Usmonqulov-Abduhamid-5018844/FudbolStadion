import { Prisma } from '@prisma/client';

export interface Actor {
  ownerId: number;
  isManager: boolean;
  managerId: number | null;
  stadionIds: number[] | null;
  language: string;
}

export function stadionScope(actor: Actor): Prisma.StadionWhereInput {
  return {
    owner_id: actor.ownerId,
    ...(actor.stadionIds && {
      OR: [
        { id: { in: actor.stadionIds } },
        { parent_id: { in: actor.stadionIds } }, // biriktirilgan stadionning mini bo'laklari
      ],
    }),
  };
}

export function bookingScope(actor: Actor): Prisma.BookingWhereInput {
  return { stadion: stadionScope(actor) };
}

export const isOwnerActor = (actor: Actor | null | undefined): boolean =>
  !!actor && !actor.isManager;

export function canAccessStadion(
  actor: Actor,
  stadion: { id: number; owner_id: number | null; parent_id: number | null },
): boolean {
  if (stadion.owner_id !== actor.ownerId) return false;
  if (!actor.stadionIds) return true;
  return (
    actor.stadionIds.includes(stadion.id) ||
    (stadion.parent_id != null && actor.stadionIds.includes(stadion.parent_id))
  );
}
