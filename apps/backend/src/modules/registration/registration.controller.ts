import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegisterUserDto } from './dto/register-user.dto';

/**
 * Controlador de registro de usuarios
 *
 * Endpoints para que la landing page pueda:
 * - Registrar usuarios con plan freemium
 * - Verificar si un teléfono/email ya está registrado
 * - Obtener estado de suscripción
 *
 * CONEXIÓN FRONTEND ↔ BACKEND:
 * - La landing (Next.js) hace fetch() a estos endpoints
 * - El backend responde con JSON
 * - CORS permite el acceso desde el dominio de la landing
 */
@Controller('api/registration')
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

  constructor(private readonly registrationService: RegistrationService) {}

  /**
   * POST /api/registration/freemium
   *
   * Registra un nuevo usuario con plan freemium desde la landing page.
   * El frontend envía: { name, email, phone, acceptedTerms }
   *
   * Ejemplo de uso en frontend:
   * ```javascript
   * const response = await fetch('https://backend.com/api/registration/freemium', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ name, email, phone: '57' + phone, acceptedTerms: true })
   * });
   * const data = await response.json();
   * ```
   *
   * @returns { success, message, user, whatsappLink }
   */
  @Post('freemium')
  @HttpCode(HttpStatus.CREATED)
  async registerFreemium(@Body() dto: RegisterUserDto) {
    this.logger.log(`📝 Solicitud de registro freemium: ${dto.phone}`);
    return this.registrationService.registerFreemiumUser(dto);
  }

  /**
   * GET /api/registration/check/:phone
   *
   * Verifica si un número de WhatsApp ya está registrado.
   * Útil para validación en tiempo real en el formulario.
   *
   * Ejemplo de uso en frontend:
   * ```javascript
   * const { registered } = await fetch(`/api/registration/check/573001234567`).then(r => r.json());
   * if (registered) showError('Este número ya está registrado');
   * ```
   *
   * @param phone - Número en formato 57XXXXXXXXXX
   * @returns { registered: boolean, name?: string }
   */
  @Get('check/:phone')
  async checkPhone(@Param('phone') phone: string) {
    this.logger.debug(`🔍 Verificando teléfono: ${phone}`);
    return this.registrationService.checkPhoneRegistered(phone);
  }

  /**
   * GET /api/registration/check-email/:email
   *
   * Verifica si un email ya está registrado.
   * Útil para validación en tiempo real en el formulario.
   *
   * @param email - Email a verificar
   * @returns { registered: boolean }
   */
  @Get('check-email/:email')
  async checkEmail(@Param('email') email: string) {
    this.logger.debug(`🔍 Verificando email: ${email}`);
    return this.registrationService.checkEmailRegistered(email);
  }

  /**
   * GET /api/registration/status/:phone
   *
   * Obtiene el estado completo de suscripción de un usuario.
   * Útil si la landing quiere mostrar info personalizada a usuarios existentes.
   *
   * @param phone - Número en formato 57XXXXXXXXXX
   * @returns Estado completo del usuario y su suscripción
   */
  @Get('status/:phone')
  async getStatus(@Param('phone') phone: string) {
    this.logger.debug(`📊 Consultando estado de: ${phone}`);
    return this.registrationService.getUserStatus(phone);
  }
}

