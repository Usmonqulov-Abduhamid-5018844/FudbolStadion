import { Global, Module } from '@nestjs/common';
import { AdminService } from './admin.service';

@Global()
@Module({
  providers: [AdminService],
  exports:[AdminService]
})
export class AdminModule {}
