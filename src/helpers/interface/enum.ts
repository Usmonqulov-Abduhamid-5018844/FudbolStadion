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
  CANCELLED = -2, // to'lovdan keyin bekor/qaytarilgan
  CANCELLED_BEFORE_PAYMENT = -1, // pul yechilmagan
  CREATED = 0,
  INITIATING = 1,
  SUCCESS = 2,
}

export const normalize = (s: string) => s.trim().toLowerCase();


export type ErrorLevel =
  | 'ignore'
  | 'blocked'
  | 'warn'
  | 'error'
  | 'critical'
  | 'silent';


export enum AlertType {
  ERROR = 'error',
  PAYMENT = 'payment',
  SECURITY = 'security',
  REFUND = 'refund',
  PREMIUM = 'premium',
  BOOKING = 'booking',
  NEW_OWNER = 'newOwner',
}

export enum ErrorContext {
  PAYMENT = 'payment',
  WEBHOOK = 'webhook',
  REFUND = 'refund',
  PREMIUM = 'premium',
  SECURITY = 'security',
  BOOKING = 'booking',

  USER = 'user',
  OWNER = 'owner',
  ADMIN = 'admin',
  STADION = 'stadion',
  COMMON = 'common',
  SILENT = 'silent',
}
export const CONTEXT_ALERT: Partial<Record<ErrorContext, AlertType>> = {
  [ErrorContext.PAYMENT]: AlertType.PAYMENT,
  [ErrorContext.WEBHOOK]: AlertType.PAYMENT,
  [ErrorContext.REFUND]: AlertType.REFUND,
  [ErrorContext.PREMIUM]: AlertType.PREMIUM,
  [ErrorContext.SECURITY]: AlertType.SECURITY,
  [ErrorContext.BOOKING]: AlertType.ERROR,
};
