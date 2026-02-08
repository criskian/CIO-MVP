import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);

  const additionalOrigin = configService.get<string>('CORS_ORIGIN');
  const corsOrigins: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://cio.almia.com.co',
    'https://admin.cio.almia.com.co',
  ];

  if (additionalOrigin) {
    corsOrigins.push(additionalOrigin);
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-event-checksum'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(port);
  console.log(`🚀 CIO Backend corriendo en puerto ${port}`);
  console.log(`📡 CORS habilitado para: ${corsOrigins.join(', ')}`);
}

bootstrap();
