import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatOcto_PaymentDto } from './dto/create-payment.dto';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  @Post('octo-webhook')
  async creates(@Body() data: CreatOcto_PaymentDto) {
    const transactionId = data.shop_transaction_id;

    if (transactionId.startsWith('premium_')) {
      return await this.paymentService.octoPremium_payments(data);
    }

    if (transactionId.startsWith('booking_')) {
      return await this.paymentService.octoBooking_payments(data);
    }

    this.logger.warn(
      `octo-webhook: noma'lum transactionId format: ${transactionId}`,
    );
    return { success: false };
  }
}
