import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const PORT = Number(process.env.PORT)
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT ?? 3000);
  console.log('Server running on port', PORT);

}
bootstrap();
