import { PayoutStatus } from '@prisma/client';
import { IStadion } from './interface';

export const getStadionIds = (stadion: any): number[] => {
  if (stadion.parent_id) {
    return [stadion.id, stadion.parent_id];
  }

  const ids = [stadion.id];

  if (stadion.children?.length) {
    stadion.children.forEach((c: IStadion) => ids.push(c.id));
  }

  return ids;
};

export const getRelatedStadionIds = (stadion: any): number[] => {
  const ids = new Set<number>();

  if (stadion.parent_id) {
    return [stadion.id];
  }
  ids.add(stadion.id);

  if (stadion.children?.length) {
    stadion.children.forEach((c: any) => ids.add(c.id));
  }

  return Array.from(ids);
};


export const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');





type OwnerPayoutInfo = {
  payout_status: PayoutStatus | string;
  paylov_partner_id: string | null;
};

type PaymentsType = 'CASH' | 'CARD' | 'GIBRID';

/**
 * Ega onlayn (karta) to'lov qabul qila oladimi.
 * Ikkala shart ham kerak: holat ACTIVE va Paylov sub partner ID mavjud.
 */
export const canOwnerAcceptCard = (owner: OwnerPayoutInfo): boolean =>
  owner.payout_status === PayoutStatus.ACTIVE && !!owner.paylov_partner_id;

/**
 * Stadion bron menyusida haqiqatda qaysi to'lov turi ishlashi kerak.
 * Bazadagi payments_type eganing tanlovi bo'lib qoladi, o'zgartirilmaydi.
 */
export const getEffectivePaymentsType = (
  stadionPayments: PaymentsType,
  owner: OwnerPayoutInfo,
): PaymentsType =>
  stadionPayments !== 'CASH' && !canOwnerAcceptCard(owner)
    ? 'CASH'
    : stadionPayments;

/**
 * Mijoz bu stadionda karta bilan to'lay oladimi
 * (stadion sozlamasi + ega holati).
 */
export const canPayByCard = (
  stadionPayments: PaymentsType,
  owner: OwnerPayoutInfo,
): boolean => getEffectivePaymentsType(stadionPayments, owner) !== 'CASH';