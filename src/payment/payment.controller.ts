import {
  Controller,
  Get,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaylovWebhookDto } from './dto/create-paylov.dto';
import { PaylovService } from 'src/paylov/paylov.service';
import { PaylovState } from 'src/helpers/interface/enum';
import { Request } from 'express';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(
    private readonly paymentService: PaymentService,
    private readonly paylove: PaylovService,
  ) {}

  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  // @Post('octo-webhook')
  // @HttpCode(HttpStatus.OK)
  // async creates(@Body() data: CreatOcto_PaymentDto) {
  //   const transactionId = data.shop_transaction_id;

  //   if (transactionId.startsWith('premium_')) {
  //     return await this.paymentService.octoPremium_payments(data);
  //   }

  //   if (transactionId.startsWith('booking_')) {
  //     return await this.paymentService.octoBooking_payments(data);
  //   }

  //   this.logger.warn(
  //     `octo-webhook: noma'lum transactionId format: ${transactionId}`,
  //   );
  //   return { success: false };
  // }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async paylov(@Body() data: PaylovWebhookDto, @Req() req: RawBodyRequest<Request>,) {
    this.logger.warn(
      `WEBHOOK DEBUG keys=${Object.keys(data).join(',')} ` +
        `msg=${data.order_id}:${data.payment_id}:${data.state}:${data.timestamp} ` +
        `sigLen=${data.signature?.length ?? 0}`,
    );

    this.paylove.debugWebhook(data, req.rawBody);
    
    // 1) Imzo
    if (!this.paylove.verifyWebhookSignature(data)) {
      this.logger.warn(`paylov webhook: imzo noto'g'ri (${data.external_id})`);
      throw new UnauthorizedException();
    }
    if (data.state === PaylovState.CANCELLED_BEFORE_PAYMENT) {
      return this.paymentService.paylovFailed(data.external_id, data);
    }
    if (data.state === PaylovState.CANCELLED) {
      return this.paymentService.paylovRefunded(data.external_id, data);
    }

    // 2) Faqat muvaffaqiyatli state (qiymatini hujjatdan tasdiqlang)
    if (data.state !== PaylovState.SUCCESS) {
      return { success: true }; // boshqa holatlar: log qilib e'tiborsiz qoldirish
    }

    // 3) Prefiks bo'yicha yo'naltirish
    if (data.external_id.startsWith('PR:')) {
      return this.paymentService.paylovPremium_payments(
        data.external_id.slice(3),
        data,
      );
    }
    if (data.external_id.startsWith('BK:')) {
      return this.paymentService.paylovBooking_payments(
        data.external_id.slice(3),
        data,
      );
    }
    this.logger.warn(
      `paylov webhook: noma'lum external_id: ${data.external_id}`,
    );
    return { success: false };
  }
}
