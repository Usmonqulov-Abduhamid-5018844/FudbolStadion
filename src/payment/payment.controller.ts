import { Controller, Get, Post, Body } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatOcto_PaymentDto } from './dto/create-payment.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('octo-webhook')
  async creates(@Body() data: CreatOcto_PaymentDto) {
    const transactionId = data.shop_transaction_id;

    if (transactionId.startsWith('premium_')) {
      await this.paymentService.octoPremium_payments(data);
    }

    return { success: true };
  }
  @Get()
  findAll() {
    return this.paymentService.findAll();
  }
}
