import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { DatabaseModule } from '../database/database.module';

/**
 * Módulo de Registro
 *
 * Proporciona endpoints para que la landing page pueda registrar usuarios.
 * Este módulo es el puente entre el frontend (landing) y la base de datos.
 *
 * Endpoints disponibles:
 * - POST /api/registration/freemium - Registrar usuario freemium
 * - GET /api/registration/check/:phone - Verificar si teléfono existe
 * - GET /api/registration/check-email/:email - Verificar si email existe
 * - GET /api/registration/status/:phone - Obtener estado de suscripción
 */
@Module({
  imports: [DatabaseModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}

