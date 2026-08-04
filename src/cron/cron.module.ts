import { Logger, Module } from '@nestjs/common';
import { CronService } from './cron.service';

@Module({
  providers: [CronService,Logger],
  exports: [CronService],
})
export class CronModule {}
