import { IsInt, IsNumber, IsString } from 'class-validator';

export class PaylovWebhookDto {
  @IsString() external_id: string;
  @IsInt() order_id: number;
  @IsInt() payment_id: number;
  @IsString() amount: string;
  @IsInt() state: number;
  @IsString() provider: string;
  @IsNumber() timestamp: number;
  @IsString() signature: string;
}