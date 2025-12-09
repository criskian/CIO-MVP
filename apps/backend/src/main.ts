import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);

  // ============================================================
  // CORS - Permite que la landing page (frontend) se comunique
  // con este backend aunque estén en dominios diferentes
  // ============================================================
  const additionalOrigin = configService.get<string>('CORS_ORIGIN');
  const corsOrigins: string[] = [
    'http://localhost:3000', // Landing en desarrollo
    'http://localhost:3001', // Backend local (para testing)
    'https://cioalmia.vercel.app', // Landing en producción
  ];

  if (additionalOrigin) {
    corsOrigins.push(additionalOrigin);
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  });

  // ============================================================
  // ValidationPipe - Valida automáticamente los DTOs
  // Cuando el frontend envía datos, se validan con class-validator
  // ============================================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades no definidas en el DTO
      forbidNonWhitelisted: true, // Error si envían propiedades extra
      transform: true, // Transforma los tipos automáticamente
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
