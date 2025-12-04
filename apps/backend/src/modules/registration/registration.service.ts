import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RegisterUserDto } from './dto/register-user.dto';

/**
 * Servicio de registro de usuarios
 * Maneja la creación de usuarios desde la landing page
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un nuevo usuario con plan freemium
   * Se llama desde la landing page cuando el usuario completa el formulario
   *
   * @param dto - Datos del formulario de registro
   * @returns Objeto con éxito y datos del usuario creado
   * @throws ConflictException si el teléfono o email ya existen
   */
  async registerFreemiumUser(dto: RegisterUserDto) {
    // Validar que aceptó los términos
    if (!dto.acceptedTerms) {
      throw new BadRequestException('Debes aceptar los términos y condiciones');
    }

    // Verificar si el teléfono ya está registrado
    const existingByPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { subscription: true },
    });

    if (existingByPhone) {
      // Si el usuario existe pero no tiene nombre/email, podría ser un registro incompleto
      // En ese caso, actualizamos sus datos
      if (!existingByPhone.name && !existingByPhone.email) {
        return this.completeRegistration(existingByPhone.id, dto);
      }

      throw new ConflictException(
        'Este número de WhatsApp ya está registrado. Si ya tienes cuenta, escríbele al CIO por WhatsApp.',
      );
    }

    // Verificar si el email ya está registrado
    const existingByEmail = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingByEmail) {
      throw new ConflictException(
        'Este email ya está registrado con otro número de WhatsApp.',
      );
    }

    // Crear usuario con suscripción freemium
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        subscription: {
          create: {
            plan: 'FREEMIUM',
            freemiumUsesLeft: 3,
            freemiumStartDate: new Date(),
            freemiumExpired: false,
            status: 'ACTIVE',
          },
        },
      },
      include: {
        subscription: true,
      },
    });

    this.logger.log(`✅ Usuario freemium registrado: ${user.phone} - ${user.name} (${user.email})`);

    return {
      success: true,
      message: '¡Registro exitoso! Ya puedes escribir al CIO por WhatsApp.',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        plan: 'FREEMIUM',
        usesLeft: 3,
        daysLeft: 3,
      },
      whatsappLink: `https://wa.me/573226906461?text=${encodeURIComponent('Hola CIO, quiero buscar trabajo')}`,
    };
  }

  /**
   * Completa el registro de un usuario que ya existe solo con teléfono
   * (caso donde el usuario escribió al bot antes de registrarse en landing)
   */
  private async completeRegistration(userId: string, dto: RegisterUserDto) {
    // Verificar que el email no esté usado por otro usuario
    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        NOT: { id: userId },
      },
    });

    if (existingByEmail) {
      throw new ConflictException('Este email ya está registrado con otro número.');
    }

    // Actualizar usuario
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
      },
      include: { subscription: true },
    });

    // Crear suscripción si no existe
    let subscription = user.subscription;
    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 3,
          freemiumStartDate: new Date(),
          freemiumExpired: false,
          status: 'ACTIVE',
        },
      });
    }

    this.logger.log(`✅ Registro completado para usuario existente: ${user.phone}`);

    return {
      success: true,
      message: '¡Registro completado! Ya puedes escribir al CIO por WhatsApp.',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        plan: subscription.plan,
        usesLeft: subscription.freemiumUsesLeft,
      },
      whatsappLink: `https://wa.me/573226906461?text=${encodeURIComponent('Hola CIO, quiero buscar trabajo')}`,
    };
  }

  /**
   * Verifica si un número ya está registrado
   * Útil para validación en tiempo real en el formulario
   */
  async checkPhoneRegistered(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true, email: true },
    });

    // Solo considerar registrado si tiene nombre y email
    const isFullyRegistered = !!(user?.name && user?.email);

    return {
      registered: isFullyRegistered,
      name: isFullyRegistered ? user.name : null,
    };
  }

  /**
   * Verifica si un email ya está registrado
   * Útil para validación en tiempo real en el formulario
   */
  async checkEmailRegistered(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    return {
      registered: !!user,
    };
  }

  /**
   * Obtiene el estado completo de suscripción de un usuario
   * Útil para mostrar información en la landing si el usuario ya está registrado
   */
  async getUserStatus(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { subscription: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const subscription = user.subscription;

    // Calcular días restantes de freemium
    let freemiumDaysLeft = 0;
    if (subscription && !subscription.freemiumExpired && subscription.plan === 'FREEMIUM') {
      const daysSinceStart = Math.floor(
        (Date.now() - subscription.freemiumStartDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      freemiumDaysLeft = Math.max(0, 3 - daysSinceStart);

      // Si pasaron los 3 días, marcar como expirado
      if (freemiumDaysLeft === 0 && !subscription.freemiumExpired) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { freemiumExpired: true },
        });
      }
    }

    return {
      registered: true,
      name: user.name,
      email: user.email,
      phone: user.phone,
      plan: subscription?.plan || 'NONE',
      status: subscription?.status || 'NONE',
      freemiumExpired: subscription?.freemiumExpired || false,
      freemiumUsesLeft: subscription?.freemiumUsesLeft || 0,
      freemiumDaysLeft,
      premiumUsesLeft: subscription?.premiumUsesLeft || 0,
      premiumEndDate: subscription?.premiumEndDate || null,
    };
  }
}

