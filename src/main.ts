import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
const Port = process.env.PORT || 4500

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(Port, ()=> {
    console.log(`Server started on Port ${Port}`);
    
  } );
}
bootstrap();
