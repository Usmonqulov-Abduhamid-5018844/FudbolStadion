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
    ...(actor.stadionIds && { id: { in: actor.stadionIds } }),
  };
}

export function bookingScope(actor: Actor): Prisma.BookingWhereInput {
  return {
    stadion: {
      owner_id: actor.ownerId,
      ...(actor.stadionIds && { id: { in: actor.stadionIds } }),
    },
  };
}
export const isOwnerActor = (actor: Actor | null | undefined): boolean =>
  !!actor && !actor.isManager;
