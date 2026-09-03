import { IsInt, IsNumber, IsString } from 'class-validator';

export class CreatOcto_PaymentDto {
  @IsString()
  shop_transaction_id: string;

  @IsString()
  octo_payment_UUID: string;

  @IsString()
  status: string;

  @IsString()
  signature: string;

  @IsString()
  hash_key: string;

  @IsNumber()
  total_sum: number;

  @IsNumber()
  transfer_sum: number;

  @IsNumber()
  refunded_sum: number;

  @IsString()
  card_country: string;

  @IsString()
  maskedPan: string;

  @IsString()
  currency: string;

  @IsString()
  card_vendor: string;

  @IsInt()
  riskLevel: number;

  @IsString()
  payed_time: string;

  @IsString()
  card_type: string;
}