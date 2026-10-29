import { Global, Module } from '@nestjs/common';
import { UtilisService } from './utile.service';

@Global()
@Module({
  providers: [UtilisService],
  exports: [UtilisService],
})
export class UtileModule {}
