import { RefundStatus } from '@prisma/client';

export enum scheduleType {
  special = 'special',
  schedule = 'schedule',
}

export type PaymentGuardResult =
  | 'not_found'
  | 'unauthorized'
  | 'pending'
  | 'failed'
  | 'ok';

export const statusMap: Record<string, RefundStatus> = {
  pending: RefundStatus.PENDING,
  succeeded: RefundStatus.SUCCEEDED,
  failed: RefundStatus.FAILED,
};
