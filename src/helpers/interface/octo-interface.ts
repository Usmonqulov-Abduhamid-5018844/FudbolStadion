export interface OctoPayload {
  shop_transaction_id: string;
  octo_payment_UUID: string;
  status: string;
  signature: string;
  hash_key: string;
  total_sum: number;
  transfer_sum: number;
  refunded_sum: number;
  card_country: string;
  maskedPan: string;
  currency: string;
  card_vendor: string;
  riskLevel: number;
  payed_time: string;
  card_type: string;
}
