import { Global, Module } from '@nestjs/common';
import { PaylovService } from './paylov.service';

@Global()
@Module({
  providers: [PaylovService],
  exports: [PaylovService],
})
export class PaylovModule {}
