import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.use(helmet());
  app.enableCors();
  await app.listen(process.env.PORT ?? 3003);
  console.log(`Room service is running on port ${process.env.PORT ?? 3003}`);
}
bootstrap();
