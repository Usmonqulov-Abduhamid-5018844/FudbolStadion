import { Global, Module } from '@nestjs/common';
import { ActorService } from './actor.service';

@Global()
@Module({
  providers: [ActorService],
  exports: [ActorService],
})
export class ActorModule {}
