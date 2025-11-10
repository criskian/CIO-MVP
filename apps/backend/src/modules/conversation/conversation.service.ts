import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { LlmService } from '../llm/llm.service';
import { CvService } from '../cv/cv.service';
import {
  NormalizedIncomingMessage,
  BotReply,
} from '../whatsapp/interfaces/whatsapp-provider.interface';
import { ConversationState, UserIntent, JobType } from './types/conversation-states';
import { BotMessages } from './helpers/bot-messages';
import {
  detectIntent,
  isAcceptance,
  isRejection,
  normalizeRole,
  normalizeLocation,
  normalizeJobType,
  normalizeSalary,
  normalizeTime,
} from './helpers/input-validators';

/**
 * Servicio de conversación (Orquestador)
 * Implementa la máquina de estados del flujo conversacional con el usuario
 * NO se comunica directamente con WhatsApp, solo procesa y devuelve respuestas
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobSearchService: JobSearchService,
    private readonly llmService: LlmService,
    private readonly cvService: CvService,
  ) {}

  /**
   * Punto de entrada principal: procesa un mensaje entrante y devuelve una respuesta
   */
  async handleIncomingMessage(message: NormalizedIncomingMessage): Promise<BotReply> {
    try {
      const { phone, text, mediaUrl, messageType } = message;

      this.logger.log(`💬 Procesando mensaje de ${phone}: ${text || '[media]'}`);

      // 1. Obtener o crear usuario
      const user = await this.getOrCreateUser(phone);

      // 2. Obtener o crear sesión activa
      const session = await this.getOrCreateSession(user.id);

      // 3. Si hay media (documento/imagen), podría ser un CV
      if (mediaUrl && messageType === 'document') {
        return await this.handleCVUpload(user.id, mediaUrl);
      }

      // 4. Si no hay texto, no podemos procesar
      if (!text) {
        return { text: BotMessages.UNKNOWN_INTENT };
      }

      // 5. Detectar intención general (para comandos especiales)
      const intent = detectIntent(text);

      // 6. Manejar comandos especiales independientes del estado
      if (intent === UserIntent.HELP) {
        return { text: BotMessages.HELP_MESSAGE };
      }

      // 7. Procesar según el estado actual
      const response = await this.handleStateTransition(user.id, session.state, text, intent);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error procesando mensaje: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { text: BotMessages.ERROR_GENERAL };
    }
  }

  /**
   * Maneja las transiciones de estado según la máquina de estados
   */
  private async handleStateTransition(
    userId: string,
    currentState: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    this.logger.debug(`Estado actual: ${currentState}, Intent: ${intent}`);

    switch (currentState) {
      case ConversationState.NEW:
        return await this.handleNewState(userId);

      case ConversationState.ASK_TERMS:
        return await this.handleAskTermsState(userId, text, intent);

      case ConversationState.ASK_ROLE:
        return await this.handleAskRoleState(userId, text);

      case ConversationState.ASK_LOCATION:
        return await this.handleAskLocationState(userId, text);

      case ConversationState.ASK_JOB_TYPE:
        return await this.handleAskJobTypeState(userId, text);

      case ConversationState.ASK_MIN_SALARY:
        return await this.handleAskMinSalaryState(userId, text);

      case ConversationState.ASK_ALERT_TIME:
        return await this.handleAskAlertTimeState(userId, text);

      case ConversationState.READY:
        return await this.handleReadyState(userId, text, intent);

      default:
        this.logger.warn(`Estado desconocido: ${currentState}`);
        return { text: BotMessages.UNKNOWN_INTENT };
    }
  }

  /**
   * Estado NEW: Usuario nuevo, mostrar bienvenida y pasar a ASK_TERMS
   */
  private async handleNewState(userId: string): Promise<BotReply> {
    this.logger.log(`👤 Nuevo usuario: ${userId}`);

    // Transición: NEW → ASK_TERMS
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    return {
      text: `${BotMessages.WELCOME}\n\n${BotMessages.ASK_TERMS}`,
    };
  }

  /**
   * Estado ASK_TERMS: Esperando aceptación de términos
   */
  private async handleAskTermsState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    if (isAcceptance(text) || intent === UserIntent.ACCEPT) {
      // Usuario aceptó términos
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.ASK_ROLE };
    }

    if (isRejection(text) || intent === UserIntent.REJECT) {
      // Usuario rechazó términos
      await this.updateSessionState(userId, ConversationState.NEW); // Volver a NEW
      return { text: BotMessages.TERMS_REJECTED };
    }

    // No entendió la respuesta, repetir pregunta
    return {
      text: `${BotMessages.ASK_TERMS}\n\n_Responde "Sí" para aceptar o "No" para rechazar._`,
    };
  }

  /**
   * Estado ASK_ROLE: Esperando rol/cargo
   */
  private async handleAskRoleState(userId: string, text: string): Promise<BotReply> {
    const role = normalizeRole(text);

    if (!role) {
      return { text: BotMessages.ERROR_ROLE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { role });

    // Transición: ASK_ROLE → ASK_LOCATION
    await this.updateSessionState(userId, ConversationState.ASK_LOCATION);

    return { text: BotMessages.ASK_LOCATION };
  }

  /**
   * Estado ASK_LOCATION: Esperando ciudad/ubicación
   */
  private async handleAskLocationState(userId: string, text: string): Promise<BotReply> {
    const location = normalizeLocation(text);

    if (!location) {
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    // Detectar si es remoto
    const isRemote = text.toLowerCase().includes('remoto') || text.toLowerCase().includes('remote');

    // Guardar en UserProfile
    await this.updateUserProfile(userId, {
      location,
      remoteAllowed: isRemote,
    });

    // Transición: ASK_LOCATION → ASK_JOB_TYPE
    await this.updateSessionState(userId, ConversationState.ASK_JOB_TYPE);

    return { text: BotMessages.ASK_JOB_TYPE };
  }

  /**
   * Estado ASK_JOB_TYPE: Esperando tipo de jornada
   */
  private async handleAskJobTypeState(userId: string, text: string): Promise<BotReply> {
    const jobType = normalizeJobType(text);

    if (!jobType) {
      return { text: BotMessages.ERROR_JOB_TYPE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { jobType });

    // Transición: ASK_JOB_TYPE → ASK_MIN_SALARY
    await this.updateSessionState(userId, ConversationState.ASK_MIN_SALARY);

    return { text: BotMessages.ASK_MIN_SALARY };
  }

  /**
   * Estado ASK_MIN_SALARY: Esperando salario mínimo
   */
  private async handleAskMinSalaryState(userId: string, text: string): Promise<BotReply> {
    // Si el usuario escribe "0", aceptamos sin filtro de salario
    if (text.trim() === '0') {
      await this.updateUserProfile(userId, { minSalary: 0 });
      await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);
      return { text: BotMessages.ASK_ALERT_TIME };
    }

    const minSalary = normalizeSalary(text);

    if (!minSalary) {
      return { text: BotMessages.ERROR_SALARY_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { minSalary });

    // Transición: ASK_MIN_SALARY → ASK_ALERT_TIME
    await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);

    return { text: BotMessages.ASK_ALERT_TIME };
  }

  /**
   * Estado ASK_ALERT_TIME: Esperando hora de alertas
   */
  private async handleAskAlertTimeState(userId: string, text: string): Promise<BotReply> {
    const alertTime = normalizeTime(text);

    if (!alertTime) {
      return { text: BotMessages.ERROR_TIME_INVALID };
    }

    // Guardar en AlertPreference
    await this.upsertAlertPreference(userId, alertTime);

    // Obtener datos del perfil para el mensaje de confirmación
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });

    // Transición: ASK_ALERT_TIME → READY
    await this.updateSessionState(userId, ConversationState.READY);

    const confirmationMessage = BotMessages.ONBOARDING_COMPLETE(
      profile?.role || 'tu cargo',
      profile?.location || 'tu ubicación',
    );

    return { text: confirmationMessage };
  }

  /**
   * Estado READY: Usuario completó onboarding
   * Aquí se manejarían búsquedas, cambios de preferencias, etc.
   */
  private async handleReadyState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // TODO: Implementar búsqueda de empleos
    // if (intent === UserIntent.SEARCH_NOW) {
    //   return await this.performJobSearch(userId);
    // }

    // TODO: Implementar cambio de preferencias
    // if (intent === UserIntent.CHANGE_PREFERENCES) {
    //   return await this.handlePreferenceChange(userId);
    // }

    // Por ahora, solo mensaje de "no disponible"
    return { text: BotMessages.NOT_READY_YET };
  }

  /**
   * Maneja la subida de CV (stub)
   */
  private async handleCVUpload(userId: string, mediaUrl: string): Promise<BotReply> {
    this.logger.log(`📄 CV recibido de usuario ${userId}`);

    // TODO: Implementar con CvService
    // await this.cvService.processCV(userId, mediaUrl);

    return {
      text: `¡Gracias por enviar tu CV! 📄

Por ahora estoy en pruebas y no puedo procesarlo aún, pero pronto podré extraer información automáticamente.

Continúa con el proceso manual. 👇`,
    };
  }

  // ========================================
  // Métodos auxiliares de base de datos
  // ========================================

  /**
   * Obtiene o crea un usuario
   */
  private async getOrCreateUser(phone: string) {
    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phone },
      });
      this.logger.log(`✅ Usuario creado: ${phone}`);
    }

    return user;
  }

  /**
   * Obtiene o crea una sesión activa
   */
  private async getOrCreateSession(userId: string) {
    let session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await this.prisma.session.create({
        data: {
          userId,
          state: ConversationState.NEW,
          data: {},
        },
      });
      this.logger.log(`✅ Sesión creada para usuario ${userId}`);
    }

    return session;
  }

  /**
   * Actualiza el estado de la sesión
   */
  private async updateSessionState(userId: string, newState: ConversationState) {
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        state: newState,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(`📊 Estado actualizado a: ${newState}`);
  }

  /**
   * Actualiza o crea el perfil del usuario
   */
  private async updateUserProfile(
    userId: string,
    data: Partial<{
      role: string;
      location: string;
      jobType: string;
      minSalary: number;
      remoteAllowed: boolean;
    }>,
  ) {
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    this.logger.debug(`✅ Perfil actualizado: ${JSON.stringify(data)}`);
  }

  /**
   * Crea o actualiza la preferencia de alertas
   */
  private async upsertAlertPreference(userId: string, alertTime: string) {
    await this.prisma.alertPreference.upsert({
      where: { userId },
      update: {
        alertTimeLocal: alertTime,
        enabled: true,
      },
      create: {
        userId,
        alertTimeLocal: alertTime,
        timezone: 'America/Bogota',
        enabled: true,
      },
    });

    this.logger.debug(`⏰ Alerta configurada para: ${alertTime}`);
  }
}
