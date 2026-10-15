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
  | 'cancelled'
  | 'ok';

export const statusMap: Record<string, RefundStatus> = {
  pending: RefundStatus.PENDING,
  succeeded: RefundStatus.SUCCEEDED,
  failed: RefundStatus.FAILED,
};

export type PaylovMethod = {
  name: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  icon?: string | null;
};

export type PaylovCheckoutResponse = {
  order_id: number;
  external_id?: string;
  state: number;
  checkout_url: string | null;
  message?: string | null;
};

export type PaylovWebhook = {
  external_id: string;
  order_id: number | string;
  payment_id: number | string;
  amount: string;
  state: number;
  provider: string;
  timestamp: number | string;
  signature?: string;
};

export enum PaylovState {
  CANCELLED = -2,                 // to'lovdan keyin bekor/qaytarilgan
  CANCELLED_BEFORE_PAYMENT = -1,  // pul yechilmagan
  CREATED = 0,
  INITIATING = 1,
  SUCCESS = 2,
}

export const normalize = (s: string) => s.trim().toLowerCase();