import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { LlmService } from '../llm/llm.service';
import { CvService } from '../cv/cv.service';
import { ChatHistoryService } from './chat-history.service';
import {
  NormalizedIncomingMessage,
  BotReply,
} from '../whatsapp/interfaces/whatsapp-provider.interface';
import { ConversationState, UserIntent } from './types/conversation-states';
import { BotMessages } from './helpers/bot-messages';
import {
  detectIntent,
  isAcceptance,
  isRejection,
  isRestartIntent,
  isCancelServiceIntent,
  isEditIntent,
  detectEditField,
  // isMobileDevice, // [ELIMINADO] Ya no se usa, todos son tratados como móvil
  // isDesktopDevice, // [ELIMINADO] Ya no se usa, todos son tratados como móvil
  normalizeRole,
  normalizeExperienceLevel,
  normalizeLocation,
  validateAndNormalizeLocation,
  // normalizeWorkMode, // [DESACTIVADO] Función comentada
  normalizeJobType,
  normalizeSalary,
  normalizeTime,
  normalizeAlertFrequency,
  alertFrequencyToText,
  generateTimeOptions,
  getFirstName,
} from './helpers/input-validators';
import {
  countBusinessDays,
  isFreemiumExpiredByBusinessDays,
} from './helpers/date-utils';

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
    private readonly chatHistoryService: ChatHistoryService,
  ) { }

  /**
   * Punto de entrada principal: procesa un mensaje entrante y devuelve una respuesta
   */
  async handleIncomingMessage(message: NormalizedIncomingMessage): Promise<BotReply> {
    try {
      const { phone, text, mediaUrl, messageType } = message;

      this.logger.log(`💬 Procesando mensaje de ${phone}: ${text || '[media]'}`);

      // 1. Buscar usuario por teléfono (NO crear, debe registrarse en landing)
      const user = await this.findUserByPhone(phone);

      // 2. Si no está registrado, indicar que debe registrarse en la landing
      if (!user) {
        this.logger.log(`🚫 Usuario no registrado: ${phone}`);
        return { text: BotMessages.NOT_REGISTERED };
      }

      // 3. Si está registrado pero no tiene nombre, también indicar registro
      // (esto no debería pasar si el registro desde landing es correcto)
      if (!user.name) {
        this.logger.warn(`⚠️ Usuario ${phone} sin nombre completo`);
        return { text: BotMessages.NOT_REGISTERED };
      }

      // 4. Obtener o crear sesión activa
      const session = await this.getOrCreateSession(user.id);

      // NOTA: Los mensajes entrantes y salientes se guardan centralizadamente en WhatsappService

      // 5. Si hay media (documento/imagen), podría ser un CV
      if (mediaUrl && messageType === 'document') {
        const response = await this.handleCVUpload(user.id, mediaUrl);
        return response;
      }

      // 6. Si no hay texto, no podemos procesar - mostrar menú de ayuda
      if (!text) {
        const response = await this.returnToMainMenu(user.id, BotMessages.UNKNOWN_INTENT);
        return response;
      }

      // 7. Detectar intención general (para comandos especiales)
      const intent = detectIntent(text);

      // 8. Manejar comandos especiales independientes del estado
      if (intent === UserIntent.HELP) {
        return { text: BotMessages.HELP_MESSAGE };
      }

      // 9. Procesar según el estado actual
      const response = await this.handleStateTransition(user.id, session.state, text, intent);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error procesando mensaje: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // 💾 GUARDAR ERROR EN HISTORIAL
      const user = await this.findUserByPhone(message.phone);
      if (user) {
        await this.chatHistoryService.saveErrorMessage(
          user.id,
          BotMessages.ERROR_GENERAL,
          'ERROR',
        );
      }

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

      // [ELIMINADO] ASK_DEVICE - Ya no se pregunta por dispositivo, siempre usamos botones interactivos
      // case ConversationState.ASK_DEVICE:
      //   return await this.handleAskDeviceState(userId, text);

      case ConversationState.ASK_TERMS:
        return await this.handleAskTermsState(userId, text, intent);

      case ConversationState.ASK_ROLE:
        return await this.handleAskRoleState(userId, text);

      case ConversationState.ASK_EXPERIENCE:
        return await this.handleAskExperienceState(userId, text);

      case ConversationState.ASK_LOCATION:
        return await this.handleAskLocationState(userId, text);

      // [DESACTIVADO] Estado ASK_WORK_MODE - Puede reactivarse en el futuro
      // case ConversationState.ASK_WORK_MODE:
      //   return await this.handleAskWorkModeState(userId, text);

      // [DESACTIVADO] Estados ASK_JOB_TYPE y ASK_MIN_SALARY - No aportan valor significativo
      // case ConversationState.ASK_JOB_TYPE:
      //   return await this.handleAskJobTypeState(userId, text);

      // case ConversationState.ASK_MIN_SALARY:
      //   return await this.handleAskMinSalaryState(userId, text);

      // [DESACTIVADO] Estado ASK_ALERT_FREQUENCY - Frecuencia siempre es diaria
      // case ConversationState.ASK_ALERT_FREQUENCY:
      //   return await this.handleAskAlertFrequencyState(userId, text);

      case ConversationState.ASK_ALERT_TIME:
        return await this.handleAskAlertTimeState(userId, text);

      case ConversationState.READY:
        return await this.handleReadyState(userId, text, intent);

      // Estado para ofrecer alertas durante onboarding
      case ConversationState.OFFER_ALERTS:
        return await this.handleOfferAlertsState(userId, text);

      // [DESACTIVADO] Estado ASK_ALERT_FREQUENCY - Frecuencia siempre es diaria
      // case ConversationState.ASK_ALERT_FREQUENCY:
      //   return await this.handleAskAlertFrequencyState(userId, text);

      case ConversationState.ASK_ALERT_TIME:
        return await this.handleAskAlertTimeState(userId, text);

      case ConversationState.CONFIRM_RESTART:
        return await this.handleConfirmRestartState(userId, text);

      case ConversationState.CONFIRM_CANCEL_SERVICE:
        return await this.handleConfirmCancelServiceState(userId, text);

      case ConversationState.EDITING_PROFILE:
        return await this.handleEditingProfileState(userId, text);

      case ConversationState.EDIT_ROLE:
        return await this.handleEditRoleState(userId, text);

      case ConversationState.EDIT_EXPERIENCE:
        return await this.handleEditExperienceState(userId, text);

      case ConversationState.EDIT_LOCATION:
        return await this.handleEditLocationState(userId, text);

      // [DESACTIVADO] Estado EDIT_WORK_MODE - Puede reactivarse en el futuro
      // case ConversationState.EDIT_WORK_MODE:
      //   return await this.handleEditWorkModeState(userId, text);

      // [DESACTIVADO] Estados EDIT_JOB_TYPE y EDIT_MIN_SALARY - No aportan valor significativo
      // case ConversationState.EDIT_JOB_TYPE:
      //   return await this.handleEditJobTypeState(userId, text);

      // case ConversationState.EDIT_MIN_SALARY:
      //   return await this.handleEditMinSalaryState(userId, text);

      // [DESACTIVADO] Estado EDIT_ALERT_FREQUENCY - Frecuencia siempre es diaria
      // case ConversationState.EDIT_ALERT_FREQUENCY:
      //   return await this.handleEditAlertFrequencyState(userId, text);

      case ConversationState.EDIT_ALERT_TIME:
        return await this.handleEditAlertTimeState(userId, text);

      // ========================================
      // ESTADOS DEL SISTEMA DE PLANES
      // ========================================
      case ConversationState.FREEMIUM_EXPIRED:
        return await this.handleFreemiumExpiredState(userId, text);

      case ConversationState.ASK_EMAIL:
        return await this.handleAskEmailState(userId, text);

      case ConversationState.WAITING_PAYMENT:
        return await this.handleWaitingPaymentState(userId, text);

      default:
        this.logger.warn(`Estado desconocido: ${currentState}`);
        return await this.returnToMainMenu(userId, BotMessages.UNKNOWN_INTENT);
    }
  }

  /**
   * Estado NEW: Usuario registrado que inicia el onboarding
   * NOTA: Solo llegan aquí usuarios ya registrados desde la landing
   * ACTUALIZADO: Ya no se pregunta por dispositivo, siempre se usan botones interactivos
   */
  private async handleNewState(userId: string): Promise<BotReply> {
    this.logger.log(`👤 Procesando estado NEW para usuario: ${userId}`);

    // Obtener usuario con su suscripción
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    // CASO 1: Usuario pagado activo (PREMIUM o PRO)
    if ((user?.subscription?.plan === 'PREMIUM' || user?.subscription?.plan === 'PRO') && user?.subscription?.status === 'ACTIVE') {
      this.logger.log(`👑 Usuario pagado ${userId}`);
      await this.updateSessionState(userId, ConversationState.ASK_TERMS);
      return {
        text: BotMessages.WELCOME_BACK_PREMIUM(getFirstName(user.name)),
        buttons: [
          { id: 'continue', title: 'Continuar' },
        ],
      };
    }

    // CASO 2: Usuario con freemium expirado
    if (user?.subscription?.freemiumExpired) {
      this.logger.log(`⏰ Usuario ${userId} con freemium expirado`);
      await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);
      return {
        text: BotMessages.FREEMIUM_EXPIRED_RETURNING_USER(getFirstName(user?.name)),
        buttons: [
          { id: 'cmd_pagar', title: 'Quiero pagar' },
          { id: 'cmd_ofertas', title: 'Ver ofertas gratis' },
        ],
      };
    }

    // CASO 3: Usuario sin suscripción → crear freemium
    if (!user?.subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 5,
          freemiumStartDate: new Date(),
        },
      });
    }

    // CASO 4: Usuario freemium activo → dar bienvenida con botón Continuar
    this.logger.log(`🆕 Usuario ${userId} iniciando onboarding`);
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    return {
      text: BotMessages.WELCOME_REGISTERED(getFirstName(user?.name)),
      buttons: [
        { id: 'continue', title: 'Continuar' },
      ],
    };
  }

  // [ELIMINADO] Estado ASK_DEVICE - Ya no se pregunta por dispositivo
  // Todos los usuarios ahora reciben botones interactivos automáticamente
  // private async handleAskDeviceState(userId: string, text: string): Promise<BotReply> { ... }

  /**
   * Estado ASK_TERMS: Esperando que el usuario presione Continuar
   * ACTUALIZADO: Ya no pide aceptar términos, solo un botón para continuar
   */
  private async handleAskTermsState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Cualquier interacción (botón o texto) avanza al siguiente paso
    if (isAcceptance(text) || intent === UserIntent.ACCEPT || text.toLowerCase().includes('continu')) {
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.ASK_ROLE };
    }

    // Si el usuario escribe cualquier cosa, también continuar
    await this.updateSessionState(userId, ConversationState.ASK_ROLE);
    return { text: BotMessages.ASK_ROLE };
  }

  /**
   * Estado ASK_ROLE: Esperando rol/cargo
   * ACTUALIZADO: Siempre muestra lista interactiva
   */
  private async handleAskRoleState(userId: string, text: string): Promise<BotReply> {
    const role = normalizeRole(text);

    if (!role) {
      return { text: BotMessages.ERROR_ROLE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { role });

    // Transición: ASK_ROLE → ASK_EXPERIENCE
    await this.updateSessionState(userId, ConversationState.ASK_EXPERIENCE);

    // Siempre mostrar lista interactiva
    return {
      text: BotMessages.ASK_EXPERIENCE,
      listTitle: 'Seleccionar nivel',
      listSections: [
        {
          title: 'Nivel de Experiencia',
          rows: [
            {
              id: 'exp_none',
              title: 'Sin experiencia',
              description: 'Recién graduado o sin experiencia laboral',
            },
            {
              id: 'exp_junior',
              title: 'Junior (1-2 años)',
              description: 'Experiencia inicial en el campo',
            },
            {
              id: 'exp_mid',
              title: 'Intermedio (3-5 años)',
              description: 'Experiencia sólida',
            },
            {
              id: 'exp_senior',
              title: 'Senior (5+ años)',
              description: 'Experto en el área',
            },
            {
              id: 'exp_lead',
              title: 'Lead/Expert (7+ años)',
              description: 'Liderazgo y expertise avanzado',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado ASK_EXPERIENCE: Esperando nivel de experiencia
   * ACTUALIZADO: Siempre muestra lista interactiva en errores
   */
  private async handleAskExperienceState(userId: string, text: string): Promise<BotReply> {
    const experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      // Mostrar lista interactiva cuando no entiende la respuesta
      return {
        text: BotMessages.ERROR_EXPERIENCE_INVALID,
        listTitle: 'Seleccionar nivel',
        listSections: [
          {
            title: 'Nivel de Experiencia',
            rows: [
              {
                id: 'exp_none',
                title: 'Sin experiencia',
                description: 'Recién graduado o sin experiencia laboral',
              },
              {
                id: 'exp_junior',
                title: 'Junior (1-2 años)',
                description: 'Experiencia inicial en el campo',
              },
              {
                id: 'exp_mid',
                title: 'Intermedio (3-5 años)',
                description: 'Experiencia sólida',
              },
              {
                id: 'exp_senior',
                title: 'Senior (5+ años)',
                description: 'Experto en el área',
              },
              {
                id: 'exp_lead',
                title: 'Lead/Expert (7+ años)',
                description: 'Liderazgo y expertise avanzado',
              },
            ],
          },
        ],
      };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { experienceLevel });

    // Transición: ASK_EXPERIENCE → ASK_LOCATION
    await this.updateSessionState(userId, ConversationState.ASK_LOCATION);

    return { text: BotMessages.ASK_LOCATION };
  }

  /**
   * Estado ASK_LOCATION: Esperando ciudad/ubicación
   * ACTUALIZADO: Ahora va a OFFER_ALERTS para preguntar si quiere alertas (antes de poder buscar)
   */
  private async handleAskLocationState(userId: string, text: string): Promise<BotReply> {
    const validation = validateAndNormalizeLocation(text);

    // Verificar si es una ubicación demasiado vaga
    if (validation.errorType === 'too_vague') {
      return { text: BotMessages.ERROR_LOCATION_TOO_VAGUE };
    }

    if (!validation.isValid || !validation.location) {
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, { location: validation.location });

    // [ACTUALIZADO] Flujo: ASK_LOCATION → OFFER_ALERTS (preguntar si quiere alertas antes de buscar)
    await this.updateSessionState(userId, ConversationState.OFFER_ALERTS);

    // Preguntar si desea recibir alertas con botones interactivos (sin emojis)
    return {
      text: BotMessages.OFFER_ALERTS,
      buttons: [
        { id: 'alerts_yes', title: 'Sí, activar' },
        { id: 'alerts_no', title: 'No, gracias' },
      ],
    };
  }

  // [DESACTIVADO] Handler de ASK_WORK_MODE - Puede reactivarse en el futuro
  // private async handleAskWorkModeState(userId: string, text: string): Promise<BotReply> {
  //   const workMode = normalizeWorkMode(text);
  //
  //   if (!workMode) {
  //     const deviceType = await this.getDeviceType(userId);
  //
  //     if (deviceType === 'MOBILE') {
  //       return {
  //         text: BotMessages.ERROR_WORK_MODE_INVALID,
  //         listTitle: 'Elige modalidad',
  //         listSections: [
  //           {
  //             title: 'Modalidad de Trabajo',
  //             rows: [
  //               { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: '🔄 Híbrido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: '✨ Sin preferencia', description: 'Cualquier modalidad' },
  //             ],
  //           },
  //         ],
  //       };
  //     }
  //
  //     return { text: BotMessages.ERROR_WORK_MODE_INVALID };
  //   }
  //
  //   await this.updateUserProfile(userId, { workMode });
  //   await this.updateSessionState(userId, ConversationState.ASK_JOB_TYPE);
  //
  //   const deviceType = await this.getDeviceType(userId);
  //
  //   if (deviceType === 'MOBILE') {
  //     return {
  //       text: BotMessages.ASK_JOB_TYPE,
  //       listTitle: 'Seleccionar tipo',
  //       listSections: [
  //         {
  //           title: 'Tipo de Empleo',
  //           rows: [
  //             { id: 'full_time', title: 'Tiempo completo', description: 'Jornada laboral completa (8 horas)' },
  //             { id: 'part_time', title: 'Medio tiempo', description: 'Jornada parcial (4-6 horas)' },
  //             { id: 'internship', title: 'Pasantía', description: 'Prácticas profesionales' },
  //             { id: 'freelance', title: 'Freelance', description: 'Trabajo por proyectos' },
  //           ],
  //         },
  //       },
  //     };
  //   }
  //
  //   return { text: BotMessages.ASK_JOB_TYPE_DESKTOP };
  // }

  // [DESACTIVADO] Estado ASK_JOB_TYPE - No aporta valor significativo
  // private async handleAskJobTypeState(userId: string, text: string): Promise<BotReply> { ... }

  // [DESACTIVADO] Estado ASK_MIN_SALARY - No aporta valor significativo
  // private async handleAskMinSalaryState(userId: string, text: string): Promise<BotReply> { ... }

  /**
   * Estado ASK_ALERT_FREQUENCY: Esperando frecuencia de alertas
   * ACTUALIZADO: Siempre muestra lista interactiva
   */
  private async handleAskAlertFrequencyState(userId: string, text: string): Promise<BotReply> {
    const frequency = normalizeAlertFrequency(text);

    if (!frequency) {
      // Siempre mostrar lista interactiva
      return {
        text: BotMessages.ERROR_ALERT_FREQUENCY_INVALID,
        listTitle: 'Seleccionar',
        listSections: [
          {
            title: 'Frecuencia',
            rows: [
              { id: 'freq_daily', title: '☀️ Diariamente' },
              { id: 'freq_every_3_days', title: '📅 Cada 3 días' },
              { id: 'freq_weekly', title: '📆 Semanalmente' },
              { id: 'freq_monthly', title: '🗓️ Mensualmente' },
            ],
          },
        ],
      };
    }

    // Guardar temporalmente en session.data (lo guardamos definitivamente cuando guarde la hora)
    await this.updateSessionData(userId, { alertFrequency: frequency });

    // Transición: ASK_ALERT_FREQUENCY → ASK_ALERT_TIME
    await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);

    // Mostrar lista desplegable con horas comunes
    const timeOptions = generateTimeOptions();

    return {
      text: BotMessages.ASK_ALERT_TIME_MOBILE,
      listTitle: 'Seleccionar hora',
      listSections: [
        {
          title: 'Horas comunes',
          rows: timeOptions,
        },
      ],
    };
  }

  /**
   * Estado ASK_ALERT_TIME: Esperando hora de alertas
   * ACTUALIZADO: Siempre muestra lista interactiva para el menú
   */
  private async handleAskAlertTimeState(userId: string, text: string): Promise<BotReply> {
    const alertTime = normalizeTime(text);

    if (!alertTime) {
      // Mostrar lista de horas cuando no entiende
      const timeOptions = generateTimeOptions();
      return {
        text: BotMessages.ERROR_TIME_INVALID,
        listTitle: 'Seleccionar hora',
        listSections: [
          {
            title: 'Horas comunes',
            rows: timeOptions,
          },
        ],
      };
    }

    // Guardar en AlertPreference (frecuencia siempre diaria)
    await this.upsertAlertPreference(userId, alertTime, 'daily');

    // Transición: ASK_ALERT_TIME → READY
    await this.updateSessionState(userId, ConversationState.READY);

    const confirmationMessage = `¡Listo! ✅
Tus alertas están activadas 🔔
⏰ *Hora:* ${alertTime}

Cuando recibas una alerta, te avisaré que hay nuevas ofertas y podrás tocar "Buscar empleos" para verlas.

ℹ️ *Ten en cuenta:*
Cada vez que presionas "Buscar empleos", se consume 1 búsqueda de tu plan.
📅 *Plan Free:* 5 búsquedas por semana. Cada búsqueda trae hasta 3 ofertas ideales para ti.

👆 *¿Qué quieres hacer ahora?*`;

    // Siempre mostrar lista interactiva con comandos
    return {
      text: confirmationMessage,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: '🔍 Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: '✏️ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: '🔄 Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: '❌ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado READY: Usuario completó onboarding
   * ACTUALIZADO: Siempre usa botones/listas interactivas
   */
  private async handleReadyState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Detectar intención de reiniciar perfil
    if (isRestartIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_RESTART);
      return {
        text: BotMessages.CONFIRM_RESTART,
        buttons: [
          { id: 'confirm_restart', title: 'Sí, reiniciar' },
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Detectar intención de cancelar servicio
    if (isCancelServiceIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_CANCEL_SERVICE);
      return {
        text: BotMessages.CONFIRM_CANCEL_SERVICE,
        buttons: [
          { id: 'confirm_cancel', title: 'Sí, confirmar' },
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Detectar intención de editar perfil
    if (isEditIntent(text)) {
      return await this.showProfileForEditing(userId);
    }

    // Detectar intención de buscar empleos
    if (intent === UserIntent.SEARCH_NOW) {
      // PRIMERO: Verificar si hay alertas pendientes de un template notification
      const pendingAlert = await this.prisma.pendingJobAlert.findFirst({
        where: {
          userId,
          viewedAt: null,  // Aún no vistas
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingAlert) {
        // Hay ofertas pendientes del template → enviarlas
        this.logger.log(`📬 Usuario ${userId} tiene ${pendingAlert.jobCount} ofertas pendientes`);

        // Marcar como vistas
        await this.prisma.pendingJobAlert.update({
          where: { id: pendingAlert.id },
          data: { viewedAt: new Date() },
        });

        // Formatear y enviar ofertas
        const jobs = pendingAlert.jobs as any[];
        const formattedJobs = jobs.map((job: any, index: number) => {
          const cleanUrl = this.jobSearchService.cleanJobUrl(job.url);
          return `*${index + 1}. ${job.title}*\n` +
            `🏢 ${job.company || 'Empresa confidencial'}\n` +
            `📍 ${job.locationRaw || 'Sin ubicación'}\n` +
            `🔗 ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas (evitar duplicados en futuras búsquedas)
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        return {
          text: `🎯 *¡Aquí están tus ofertas de empleo!*\n\n${formattedJobs}\n\n💡 _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }

      // No hay alertas pendientes → hacer búsqueda normal
      // Verificar usos disponibles ANTES de buscar (sin descontar)
      const usageCheck = await this.checkUsageAvailable(userId);

      if (!usageCheck.allowed) {
        // Verificar si es usuario premium sin búsquedas semanales
        const subscription = await this.prisma.subscription.findUnique({
          where: { userId },
        });

        if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
          // Usuario pagado que alcanzó límite semanal: NO cambiar estado
          this.logger.log(`⏳ Usuario pagado ${userId} alcanzó límite semanal, mostrando mensaje de espera`);
          return { text: usageCheck.message || 'Has alcanzado tu límite semanal de búsquedas.' };
        }

        // Usuario freemium agotado: redirigir al flujo de pago
        await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);

        // Guardar timestamp para el recordatorio de 23 horas
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            freemiumExpiredSentAt: new Date(),
            freemiumReminderSent: false,
          },
        });

        return { text: usageCheck.message || BotMessages.FREEMIUM_EXPIRED };
      }

      // Descontar uso PRIMERO para obtener el usesLeft correcto
      const deduction = await this.deductUsage(userId);

      // Ejecutar búsqueda con el usesLeft actualizado
      const searchResult = await this.performJobSearch(userId, deduction.usesLeft);

      // Si hubo error en la búsqueda, el uso ya fue descontado (comportamiento esperado)
      const isError = searchResult.text?.includes('Lo siento, no pude buscar ofertas');
      if (isError) {
        this.logger.log(`⚠️ Búsqueda falló para usuario ${userId}, pero el uso ya fue descontado`);
      }

      return searchResult;
    }

    // Siempre mostrar menú de comandos con lista interactiva
    return {
      text: '¿Qué te gustaría hacer?',
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: '🔍 Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: '✏️ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: '🔄 Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: '❌ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Ejecuta búsqueda de empleos y devuelve resultados formateados
   */
  private async performJobSearch(userId: string, usesLeftAfterDeduction?: number): Promise<BotReply> {
    try {
      this.logger.log(`🔍 Usuario ${userId} solicitó búsqueda de empleos`);

      // Determinar maxResults según el plan (3 para FREE, 5 para PREMIUM/PRO)
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      const maxResults = (subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') ? 5 : 3;

      // Ejecutar búsqueda
      const result = await this.jobSearchService.searchJobsForUser(userId, maxResults);

      // Si no hay ofertas
      if (result.jobs.length === 0) {
        return {
          text: `No encontré ofertas que coincidan con tu perfil en este momento. 😔

Intenta de nuevo más tarde o escribe "reiniciar" para ajustar tus preferencias.`,
        };
      }

      // Formatear ofertas para WhatsApp
      const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(result.jobs);

      // Marcar ofertas como enviadas
      await this.jobSearchService.markJobsAsSent(userId, result.jobs);

      // Mensaje de advertencia si se agotaron las ofertas disponibles
      let exhaustedMessage = '';
      if (result.offersExhausted) {
        exhaustedMessage = `

⚠️ *¡Atención!* Has visto todas las ofertas disponibles para tu perfil actual. Para tu próxima búsqueda puedes:
• Esperar un tiempo mientras se publican nuevas ofertas
• Escribir *"editar"* para ajustar tus preferencias y encontrar más opciones`;
      }

      // Tiempo de espera para mensaje retrasado: 10 segundos
      const DELAY_MS = 10000;

      // Usar usesLeft pasado como parámetro (ya descontado) o consultar DB
      const usesLeft = usesLeftAfterDeduction ?? subscription?.freemiumUsesLeft ?? 0;
      const isPremium = subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO';

      // Construir mensaje retrasado con info de búsquedas
      const planLabel = isPremium ? (subscription?.plan === 'PRO' ? 'Plan Pro' : 'Plan Premium') : 'Plan Free';
      const menuText = `ℹ️ *Búsquedas restantes esta semana:* ${usesLeft} (${planLabel})

Si estas ofertas no se ajustan del todo a lo que buscas, puedes ir a *Editar perfil* y ajustar tu rol, ciudad o preferencias.

⚠️ Recuerda: mañana recibirás nuevas alertas y podrás volver a buscar ofertas.

¿Qué quieres hacer ahora?`;

      return {
        text: formattedJobs + exhaustedMessage,
        delayedMessage: {
          text: menuText,
          delayMs: DELAY_MS,
          listTitle: 'Ver opciones',
          listSections: [
            {
              title: 'Acciones disponibles',
              rows: [
                { id: 'cmd_buscar', title: '🔍 Buscar empleos', description: 'Encontrar más ofertas' },
                { id: 'cmd_editar', title: '✏️ Editar perfil', description: 'Cambiar tus preferencias' },
                { id: 'cmd_reiniciar', title: '🔄 Reiniciar', description: 'Reconfigurar tu perfil' },
                { id: 'cmd_cancelar', title: '❌ Cancelar servicio', description: 'Dejar de usar el CIO' },
              ],
            },
          ],
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error en búsqueda de empleos: ${errorMessage}`);

      return {
        text: `Lo siento, no pude buscar ofertas en este momento. 😔

Por favor intenta de nuevo en unos minutos.`,
      };
    }
  }

  /**
   * Estado OFFER_ALERTS: Pregunta si desea recibir alertas (durante onboarding)
   * ACTUALIZADO: Si acepta, va directamente a ASK_ALERT_TIME (frecuencia siempre diaria)
   */
  private async handleOfferAlertsState(userId: string, text: string): Promise<BotReply> {
    // Verificar si acepta alertas
    if (isAcceptance(text) || text.toLowerCase().includes('activar')) {
      // Usuario quiere activar alertas → Preguntar hora directamente (frecuencia siempre diaria)
      await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);

      // Mostrar lista desplegable con horas comunes
      const timeOptions = generateTimeOptions();

      return {
        text: BotMessages.ASK_ALERT_TIME_MOBILE,
        listTitle: 'Seleccionar hora',
        listSections: [
          {
            title: 'Horas comunes',
            rows: timeOptions,
          },
        ],
      };
    }

    // Verificar si rechaza alertas
    if (isRejection(text) || text.toLowerCase().includes('sin alertas') || text.toLowerCase().includes('no quiero')) {
      // Usuario NO quiere alertas → Crear AlertPreference con enabled=false
      await this.prisma.alertPreference.create({
        data: {
          userId,
          alertFrequency: 'daily', // Siempre diaria
          alertTimeLocal: '09:00', // Valor por defecto (no se usará)
          timezone: 'America/Bogota',
          enabled: false, // ⚠️ DESACTIVADO
        },
      });

      // Volver a READY
      await this.updateSessionState(userId, ConversationState.READY);

      return await this.returnToMainMenu(userId, BotMessages.ALERTS_DISABLED);
    }

    // No entendió la respuesta, mostrar botones (sin emojis)
    return {
      text: `${BotMessages.OFFER_ALERTS}\n\n_Por favor, selecciona una opción:_`,
      buttons: [
        { id: 'accept_alerts', title: 'Sí, activar' },
        { id: 'reject_alerts', title: 'No, gracias' },
      ],
    };
  }

  /**
   * Estado CONFIRM_RESTART: Confirmando reinicio de perfil
   * ACTUALIZADO: Va directamente a ASK_ROLE (sin términos)
   */
  private async handleConfirmRestartState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmó reinicio
      await this.restartUserProfile(userId);
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      // Ir directamente a preguntar rol
      return {
        text: `${BotMessages.RESTARTED}\n\n${BotMessages.ASK_ROLE}`,
      };
    }

    if (isRejection(text)) {
      // Usuario canceló el reinicio
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.RESTART_CANCELLED);
    }

    // No entendió la respuesta, mostrar botones
    return {
      text: `${BotMessages.CONFIRM_RESTART}\n\n_Por favor, selecciona una opción:_`,
      buttons: [
        { id: 'confirm_restart', title: 'Sí, reiniciar' },
        { id: 'cancel_restart', title: 'No, cancelar' },
      ],
    };
  }

  /**
   * Estado CONFIRM_CANCEL_SERVICE: Confirmando cancelación del servicio
   */
  private async handleConfirmCancelServiceState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmó cancelación
      await this.deleteUserCompletely(userId);
      return { text: BotMessages.SERVICE_CANCELLED };
    }

    if (isRejection(text)) {
      // Usuario decidió no cancelar
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.CANCEL_SERVICE_ABORTED);
    }

    // No entendió la respuesta
    return {
      text: `${BotMessages.CONFIRM_CANCEL_SERVICE}\n\n_Por favor, selecciona una opción:_`,
      buttons: [
        { id: 'confirm_cancel', title: 'Sí, confirmar' },
        { id: 'abort_cancel', title: 'No, continuar' },
      ],
    };
  }

  /**
   * Maneja la subida de CV (stub)
   */
  private async handleCVUpload(userId: string, mediaUrl: string): Promise<BotReply> {
    this.logger.log(`📄 CV recibido de usuario ${userId}: ${mediaUrl}`);

    // TODO: Implementar con CvService
    // await this.cvService.processCV(userId, mediaUrl);

    return {
      text: `¡Gracias por enviar tu CV! 📄

Por ahora estoy en pruebas y no puedo procesarlo aún, pero pronto podré extraer información automáticamente.

Continúa con el proceso manual. 👇`,
    };
  }

  // ========================================
  // Métodos de edición de perfil
  // ========================================

  /**
   * Muestra el perfil actual del usuario y transiciona a EDITING_PROFILE
   * ACTUALIZADO: Ya no muestra tipo de empleo ni salario (desactivados)
   */
  private async showProfileForEditing(userId: string): Promise<BotReply> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const alertPref = await this.prisma.alertPreference.findUnique({ where: { userId } });

    if (!profile) {
      return await this.returnToMainMenu(userId, BotMessages.NOT_READY_YET);
    }

    // Formatear valores para mostrar
    const formattedProfile = {
      role: profile.role || 'No configurado',
      experience: this.formatExperienceLevel(profile.experienceLevel),
      location: profile.location || 'No configurado',
      // jobType y minSalary desactivados - no aportan valor significativo
      alertFrequency: alertPref?.alertFrequency
        ? alertFrequencyToText(alertPref.alertFrequency as any)
        : 'No configurado',
      alertTime: alertPref?.alertTimeLocal || 'No configurado',
    };

    // Transicionar a EDITING_PROFILE
    await this.updateSessionState(userId, ConversationState.EDITING_PROFILE);

    // Siempre mostrar lista desplegable con opciones de edición
    return {
      text: `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${formattedProfile.role}
💡 *Experiencia:* ${formattedProfile.experience}
📍 *Ubicación:* ${formattedProfile.location}
⏰ *Horario de alertas:* ${formattedProfile.alertTime}

Selecciona qué quieres editar:`,
      listTitle: 'Editar campo',
      listSections: [
        {
          title: 'Preferencias',
          rows: [
            {
              id: 'edit_rol',
              title: '🔹 Rol',
              description: `Actual: ${formattedProfile.role}`,
            },
            {
              id: 'edit_experiencia',
              title: '💡 Experiencia',
              description: `Actual: ${formattedProfile.experience}`,
            },
            {
              id: 'edit_ubicacion',
              title: '📍 Ubicación',
              description: `Actual: ${formattedProfile.location}`,
            },
            // [DESACTIVADO] Frecuencia - siempre es diaria
            {
              id: 'edit_horario',
              title: '⏰ Horario alertas',
              description: `Actual: ${formattedProfile.alertTime}`,
            },
            {
              id: 'cmd_cancelar',
              title: '❌ Cancelar',
              description: 'Volver al menú principal',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado EDITING_PROFILE: Usuario eligió editar, ahora debe seleccionar qué campo
   * ACTUALIZADO: Siempre usa listas interactivas
   */
  private async handleEditingProfileState(userId: string, text: string): Promise<BotReply> {
    // Permitir cancelar
    if (isRejection(text) || text.toLowerCase().includes('cancelar')) {
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.NOT_READY_YET);
    }

    // Detectar qué campo quiere editar
    const field = detectEditField(text);

    if (!field) {
      // Mostrar lista de campos editables si no entendió
      return await this.showProfileForEditing(userId);
    }

    // Transicionar al estado de edición correspondiente
    switch (field) {
      case 'rol':
        await this.updateSessionState(userId, ConversationState.EDIT_ROLE);
        return { text: BotMessages.ASK_ROLE };

      case 'experiencia':
        await this.updateSessionState(userId, ConversationState.EDIT_EXPERIENCE);
        return {
          text: BotMessages.ASK_EXPERIENCE,
          listTitle: 'Seleccionar nivel',
          listSections: [
            {
              title: 'Nivel de Experiencia',
              rows: [
                {
                  id: 'exp_none',
                  title: 'Sin experiencia',
                  description: 'Recién graduado',
                },
                {
                  id: 'exp_junior',
                  title: 'Junior (1-2 años)',
                  description: 'Experiencia inicial',
                },
                {
                  id: 'exp_mid',
                  title: 'Intermedio (3-5 años)',
                  description: 'Experiencia sólida',
                },
                {
                  id: 'exp_senior',
                  title: 'Senior (5+ años)',
                  description: 'Experto',
                },
                {
                  id: 'exp_lead',
                  title: 'Lead/Expert (7+ años)',
                  description: 'Liderazgo avanzado',
                },
              ],
            },
          ],
        };

      case 'ubicacion':
        await this.updateSessionState(userId, ConversationState.EDIT_LOCATION);
        return { text: BotMessages.ASK_LOCATION };

      // [DESACTIVADO] Casos 'tipo' y 'salario' - No aportan valor significativo
      // case 'tipo':
      //   await this.updateSessionState(userId, ConversationState.EDIT_JOB_TYPE);
      //   return { text: BotMessages.ASK_JOB_TYPE, ... };

      // case 'salario':
      //   await this.updateSessionState(userId, ConversationState.EDIT_MIN_SALARY);
      //   return { text: BotMessages.ASK_MIN_SALARY };

      // [DESACTIVADO] Frecuencia - siempre es diaria
      // case 'frecuencia':
      //   await this.updateSessionState(userId, ConversationState.EDIT_ALERT_FREQUENCY);
      //   return { text: BotMessages.ASK_ALERT_FREQUENCY, ... };

      case 'horario': {
        await this.updateSessionState(userId, ConversationState.EDIT_ALERT_TIME);
        const timeOptions = generateTimeOptions();
        return {
          text: BotMessages.ASK_ALERT_TIME_MOBILE,
          listTitle: 'Seleccionar hora',
          listSections: [
            {
              title: 'Horas comunes',
              rows: timeOptions,
            },
          ],
        };
      }

      default:
        return await this.showProfileForEditing(userId);
    }
  }

  /**
   * Estado EDIT_ROLE: Editando rol
   */
  private async handleEditRoleState(userId: string, text: string): Promise<BotReply> {
    const role = normalizeRole(text);

    if (!role) {
      return { text: BotMessages.ERROR_ROLE_INVALID };
    }

    await this.updateUserProfile(userId, { role });
    await this.updateSessionState(userId, ConversationState.READY);

    // Obtener nombre del usuario para mensaje personalizado
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const firstName = user?.name ? getFirstName(user.name) : null;

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('cargo', role, firstName));
  }

  /**
   * Estado EDIT_EXPERIENCE: Editando nivel de experiencia
   * ACTUALIZADO: Siempre muestra lista interactiva en errores
   */
  private async handleEditExperienceState(userId: string, text: string): Promise<BotReply> {
    const experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      return {
        text: BotMessages.ERROR_EXPERIENCE_INVALID,
        listTitle: 'Seleccionar nivel',
        listSections: [
          {
            title: 'Nivel de Experiencia',
            rows: [
              { id: 'exp_none', title: 'Sin experiencia', description: 'Recién graduado' },
              { id: 'exp_junior', title: 'Junior (1-2 años)', description: 'Experiencia inicial' },
              { id: 'exp_mid', title: 'Intermedio (3-5 años)', description: 'Experiencia sólida' },
              { id: 'exp_senior', title: 'Senior (5+ años)', description: 'Experto' },
              { id: 'exp_lead', title: 'Lead/Expert (7+ años)', description: 'Liderazgo avanzado' },
            ],
          },
        ],
      };
    }

    await this.updateUserProfile(userId, { experienceLevel });
    await this.updateSessionState(userId, ConversationState.READY);

    const experienceLabel = this.formatExperienceLevel(experienceLevel);
    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('experiencia', experienceLabel),
    );
  }

  /**
   * Estado EDIT_LOCATION: Editando ubicación
   */
  private async handleEditLocationState(userId: string, text: string): Promise<BotReply> {
    const validation = validateAndNormalizeLocation(text);

    // Verificar si es una ubicación demasiado vaga
    if (validation.errorType === 'too_vague') {
      return { text: BotMessages.ERROR_LOCATION_TOO_VAGUE };
    }

    if (!validation.isValid || !validation.location) {
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, {
      location: validation.location,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('ubicación', validation.location));
  }

  // [DESACTIVADO] Handler de EDIT_WORK_MODE - Puede reactivarse en el futuro
  // private async handleEditWorkModeState(userId: string, text: string): Promise<BotReply> {
  //   const workMode = normalizeWorkMode(text);
  //
  //   if (!workMode) {
  //     const deviceType = await this.getDeviceType(userId);
  //
  //     if (deviceType === 'MOBILE') {
  //       return {
  //         text: BotMessages.ERROR_WORK_MODE_INVALID,
  //         listTitle: 'Elige modalidad',
  //         listSections: [
  //           {
  //             title: 'Modalidad de Trabajo',
  //             rows: [
  //               { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: '🔄 Híbrido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: '✨ Sin preferencia', description: 'Cualquier modalidad' },
  //             ],
  //           },
  //         ],
  //       };
  //     }
  //
  //     return { text: BotMessages.ERROR_WORK_MODE_INVALID };
  //   }
  //
  //   await this.updateUserProfile(userId, { workMode });
  //   await this.updateSessionState(userId, ConversationState.READY);
  //
  //   const displayMode = this.formatWorkMode(workMode);
  //   return await this.returnToMainMenu(
  //     userId,
  //     BotMessages.FIELD_UPDATED('modalidad de trabajo', displayMode),
  //   );
  // }


  // [DESACTIVADO] Estado EDIT_JOB_TYPE - No aporta valor significativo
  // private async handleEditJobTypeState(userId: string, text: string): Promise<BotReply> { ... }

  // [DESACTIVADO] Estado EDIT_MIN_SALARY - No aporta valor significativo
  // private async handleEditMinSalaryState(userId: string, text: string): Promise<BotReply> { ... }

  /**
   * Estado EDIT_ALERT_FREQUENCY: Editando frecuencia de alertas
   * ACTUALIZADO: Siempre muestra lista interactiva en errores
   */
  private async handleEditAlertFrequencyState(userId: string, text: string): Promise<BotReply> {
    const frequency = normalizeAlertFrequency(text);

    if (!frequency) {
      return {
        text: BotMessages.ERROR_ALERT_FREQUENCY_INVALID,
        listTitle: 'Seleccionar',
        listSections: [
          {
            title: 'Frecuencia',
            rows: [
              { id: 'freq_daily', title: '☀️ Diariamente' },
              { id: 'freq_every_3_days', title: '📅 Cada 3 días' },
              { id: 'freq_weekly', title: '📆 Semanalmente' },
              { id: 'freq_monthly', title: '🗓️ Mensualmente' },
            ],
          },
        ],
      };
    }

    // Obtener alertTime actual para mantenerla
    const alertPref = await this.prisma.alertPreference.findUnique({
      where: { userId },
    });

    const alertTime = alertPref?.alertTimeLocal || '09:00';

    await this.upsertAlertPreference(userId, alertTime, frequency);
    await this.updateSessionState(userId, ConversationState.READY);

    const displayFrequency = alertFrequencyToText(frequency);
    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('frecuencia de alertas', displayFrequency),
    );
  }

  /**
   * Estado EDIT_ALERT_TIME: Editando horario de alertas
   * ACTUALIZADO: Siempre muestra lista interactiva en errores
   */
  private async handleEditAlertTimeState(userId: string, text: string): Promise<BotReply> {
    const alertTime = normalizeTime(text);

    if (!alertTime) {
      const timeOptions = generateTimeOptions();
      return {
        text: BotMessages.ERROR_TIME_INVALID,
        listTitle: 'Seleccionar hora',
        listSections: [
          {
            title: 'Horas comunes',
            rows: timeOptions,
          },
        ],
      };
    }

    // Obtener frecuencia actual para mantenerla
    const alertPref = await this.prisma.alertPreference.findUnique({
      where: { userId },
    });

    const frequency = alertPref?.alertFrequency || 'daily';

    await this.upsertAlertPreference(userId, alertTime, frequency);
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('horario de alertas', alertTime),
    );
  }

  // ========================================
  // HANDLERS DEL SISTEMA DE PLANES
  // ========================================

  /**
   * Verifica si el usuario tiene usos disponibles (por si un admin los añadió)
   * @returns true si el usuario puede usar el servicio, false si no tiene usos
   */
  private async checkIfUserHasUsesAvailable(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) return false;

    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el premium expiró por 30 días
      // CASO 1: Con premiumEndDate
      if (subscription.premiumEndDate && now > subscription.premiumEndDate) {
        return false; // Premium expirado
      }
      // CASO 2: Sin premiumEndDate pero con premiumStartDate (usuarios antiguos)
      if (!subscription.premiumEndDate && subscription.premiumStartDate) {
        const msSinceStart = now.getTime() - subscription.premiumStartDate.getTime();
        if (msSinceStart > thirtyDaysInMs) {
          return false; // Premium expirado (usuario antiguo)
        }
      }

      // Premium activo: verificar si tiene usos o es nueva semana
      const weekStart = subscription.premiumWeekStart;
      if (!weekStart || this.isNewWeek(weekStart, now)) {
        return true; // Nueva semana = nuevos usos
      }
      return subscription.premiumUsesLeft > 0;
    }

    // Freemium: verificar usos disponibles y que no haya expirado por tiempo
    const daysSinceStart = Math.floor(
      (Date.now() - subscription.freemiumStartDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Si tiene usos Y no han pasado 3 días, puede usar
    return subscription.freemiumUsesLeft > 0 && daysSinceStart < 3;
  }

  /**
   * Estado FREEMIUM_EXPIRED: El usuario agotó su freemium
   */
  private async handleFreemiumExpiredState(userId: string, text: string): Promise<BotReply> {
    // PRIMERO: Si el usuario hace clic en "ver ofertas" y tiene alertas pendientes, mostrarlas
    const intent = detectIntent(text);
    if (intent === UserIntent.SEARCH_NOW) {
      const pendingAlert = await this.prisma.pendingJobAlert.findFirst({
        where: {
          userId,
          viewedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingAlert) {
        this.logger.log(`📬 Usuario ${userId} (FREEMIUM_EXPIRED) tiene ${pendingAlert.jobCount} ofertas pendientes`);

        // Marcar como vistas
        await this.prisma.pendingJobAlert.update({
          where: { id: pendingAlert.id },
          data: { viewedAt: new Date() },
        });

        // Formatear ofertas
        const jobs = pendingAlert.jobs as any[];
        const formattedJobs = jobs.map((job: any, index: number) => {
          const cleanUrl = this.jobSearchService.cleanJobUrl(job.url);
          return `*${index + 1}. ${job.title}*\n` +
            `🏢 ${job.company || 'Empresa confidencial'}\n` +
            `📍 ${job.locationRaw || 'Sin ubicación'}\n` +
            `🔗 ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        // Si el usuario tiene usos disponibles, volver a READY
        if (await this.checkIfUserHasUsesAvailable(userId)) {
          await this.updateSessionState(userId, ConversationState.READY);
        }

        return {
          text: `🎯 *¡Aquí están tus ofertas de empleo!*\n\n${formattedJobs}\n\n💡 _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }
    }

    // Verificar el tipo de suscripción
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si es usuario pagado activo (PREMIUM/PRO), NO debería estar aquí - devolverlo a READY
    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`🔄 Usuario pagado ${userId} estaba en FREEMIUM_EXPIRED incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      // Verificar si tiene búsquedas disponibles o está esperando
      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `🎉 ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        // Premium sin búsquedas semanales - mostrar mensaje de espera
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado (para freemium)
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`🔄 Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `🎉 ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
    }

    // Solo para usuarios freemium: transición a pedir email
    await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
    return { text: BotMessages.FREEMIUM_EXPIRED_ASK_EMAIL };
  }

  /**
   * Estado ASK_EMAIL: Pedir email para vincular pago
   */
  private async handleAskEmailState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no debería estar aquí
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`🔄 Usuario pagado ${userId} estaba en ASK_EMAIL incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `🎉 ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`🔄 Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `🎉 ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
    }

    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { text: BotMessages.ERROR_EMAIL_INVALID };
    }

    // Buscar transacción aprobada con ese email que no esté vinculada
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        email,
        wompiStatus: 'APPROVED',
        userId: null, // No vinculada aún
      },
    });

    if (transaction) {
      // ¡Pago encontrado! Vincular y activar premium
      await this.activatePremiumForUser(userId, email, transaction.id);

      await this.updateSessionState(userId, ConversationState.READY);

      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      return {
        text: BotMessages.PAYMENT_CONFIRMED(getFirstName(user?.name)),
      };
    }

    // No hay pago con ese email, guardar email y mostrar enlace de pago
    await this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });

    await this.updateSessionState(userId, ConversationState.WAITING_PAYMENT);

    return {
      text: BotMessages.PAYMENT_LINK(email),
    };
  }

  /**
   * Estado WAITING_PAYMENT: Usuario esperando confirmación de pago
   */
  private async handleWaitingPaymentState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no debería estar aquí
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`🔄 Usuario pagado ${userId} estaba en WAITING_PAYMENT incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `🎉 ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`🔄 Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `🎉 ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
    }

    const lower = text.toLowerCase().trim();

    // Si escribe "verificar", "comprobar" o similar, re-verificar pago
    if (
      lower.includes('verificar') ||
      lower.includes('comprobar') ||
      lower.includes('ya pague') ||
      lower.includes('ya pagué')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      if (!user?.email) {
        await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
        return { text: 'Por favor, primero ingresa tu correo electrónico.' };
      }

      // Buscar transacción aprobada
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          email: user.email,
          wompiStatus: 'APPROVED',
          userId: null,
        },
      });

      if (transaction) {
        await this.activatePremiumForUser(userId, user.email, transaction.id);
        await this.updateSessionState(userId, ConversationState.READY);

        return {
          text: BotMessages.PAYMENT_CONFIRMED(getFirstName(user.name)),
        };
      }

      return {
        text: BotMessages.PAYMENT_NOT_FOUND,
      };
    }

    // Si escribe un email, actualizar
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(text.trim())) {
      const newEmail = text.trim().toLowerCase();

      await this.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      return {
        text: `✅ Email actualizado a *${newEmail}*.\n\nEscribe *"verificar"* cuando hayas realizado el pago.`,
      };
    }

    // Mostrar ayuda con botón de verificar
    return {
      text: BotMessages.WAITING_PAYMENT_HELP,
      buttons: [
        { id: 'cmd_verificar', title: 'Verificar pago' },
      ],
    };
  }

  /**
   * Activa plan premium para un usuario
   */
  private async activatePremiumForUser(
    userId: string,
    email: string,
    transactionId: string,
  ): Promise<void> {
    // Actualizar usuario con email
    await this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });

    // Vincular transacción
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        userId,
        linkedAt: new Date(),
      },
    });

    // Actualizar suscripción a premium con expiración a 30 días
    const now = new Date();
    const premiumEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        premiumStartDate: now,
        premiumEndDate: premiumEndDate,
        premiumUsesLeft: 5,
        premiumWeekStart: now, // Semana empieza desde la compra
      },
    });

    this.logger.log(`👑 Usuario ${userId} activado como PREMIUM (expira: ${premiumEndDate.toISOString()})`);
  }

  /**
   * Verifica si el usuario puede usar el servicio SIN descontar
   * @returns { allowed: boolean, message?: string, currentUses?: number }
   */
  async checkUsageAvailable(
    userId: string,
  ): Promise<{ allowed: boolean; message?: string; currentUses?: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripción, puede usar (se creará freemium después)
    if (!subscription) {
      return { allowed: true, currentUses: 3 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expiró (30 días)
      if (subscription.premiumEndDate && now > subscription.premiumEndDate) {
        return { allowed: false, message: BotMessages.PREMIUM_EXPIRED };
      }

      if (!subscription.premiumEndDate && subscription.premiumStartDate) {
        const msSinceStart = now.getTime() - subscription.premiumStartDate.getTime();
        if (msSinceStart > thirtyDaysInMs) {
          return { allowed: false, message: BotMessages.PREMIUM_EXPIRED };
        }
      }

      // Verificar usos semanales
      const weekStart = subscription.premiumWeekStart;
      const now2 = new Date();

      if (!weekStart || this.isNewWeek(weekStart, now2)) {
        return { allowed: true, currentUses: 5 }; // Nueva semana
      }

      if (subscription.premiumUsesLeft > 0) {
        return { allowed: true, currentUses: subscription.premiumUsesLeft };
      }

      const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { allowed: false, message: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
    }

    // PLAN FREEMIUM
    // Verificar si pasaron 5 días hábiles (expiración por tiempo)
    const businessDays = countBusinessDays(subscription.freemiumStartDate, new Date());

    if (businessDays >= 5 || subscription.freemiumUsesLeft <= 0) {
      return { allowed: false, message: BotMessages.FREEMIUM_EXPIRED };
    }

    return { allowed: true, currentUses: subscription.freemiumUsesLeft };
  }

  /**
   * Descuenta un uso del servicio (llamar SOLO después de una operación exitosa)
   * @returns { usesLeft: number }
   */
  async deductUsage(userId: string): Promise<{ usesLeft: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripción, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usó 1 (de 5 totales)
        },
      });
      return { usesLeft: 4 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const weekStart = subscription.premiumWeekStart;

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 usado
            premiumWeekStart: now,
          },
        });
        return { usesLeft: 4 };
      }

      const newUsesLeft = subscription.premiumUsesLeft - 1;
      await this.prisma.subscription.update({
        where: { userId },
        data: { premiumUsesLeft: newUsesLeft },
      });
      return { usesLeft: newUsesLeft };
    }

    // PLAN FREEMIUM
    const newUsesLeft = subscription.freemiumUsesLeft - 1;
    await this.prisma.subscription.update({
      where: { userId },
      data: { freemiumUsesLeft: newUsesLeft },
    });
    return { usesLeft: newUsesLeft };
  }

  /**
   * [LEGACY] Verifica si el usuario puede usar el servicio y deduce un uso
   * NOTA: Usar checkUsageAvailable + deductUsage para mejor control
   * @returns { allowed: boolean, message?: string, usesLeft?: number }
   */
  async checkAndDeductUsage(
    userId: string,
    usageType: 'search' | 'alert',
  ): Promise<{ allowed: boolean; message?: string; usesLeft?: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripción, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usó 1 (de 5 totales)
        },
      });
      return { allowed: true, usesLeft: 4 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expiró (30 días)
      // CASO 1: Usuarios nuevos con premiumEndDate
      if (subscription.premiumEndDate && now > subscription.premiumEndDate) {
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            status: 'EXPIRED',
            plan: 'FREEMIUM',
            freemiumExpired: true,
          },
        });
        return {
          allowed: false,
          message: BotMessages.PREMIUM_EXPIRED,
        };
      }

      // CASO 2: Usuarios antiguos sin premiumEndDate pero con premiumStartDate
      if (!subscription.premiumEndDate && subscription.premiumStartDate) {
        const msSinceStart = now.getTime() - subscription.premiumStartDate.getTime();
        if (msSinceStart > thirtyDaysInMs) {
          await this.prisma.subscription.update({
            where: { userId },
            data: {
              status: 'EXPIRED',
              plan: 'FREEMIUM',
              freemiumExpired: true,
            },
          });
          return {
            allowed: false,
            message: BotMessages.PREMIUM_EXPIRED,
          };
        }
      }

      // Verificar si es nueva semana (cada 7 días desde premiumWeekStart)
      const weekStart = subscription.premiumWeekStart;

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        // Resetear usos semanales
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 que está usando ahora
            premiumWeekStart: now, // Nueva semana empieza desde ahora
          },
        });
        return { allowed: true, usesLeft: 4 };
      }

      if (subscription.premiumUsesLeft > 0) {
        const newUsesLeft = subscription.premiumUsesLeft - 1;
        await this.prisma.subscription.update({
          where: { userId },
          data: { premiumUsesLeft: newUsesLeft },
        });
        return { allowed: true, usesLeft: newUsesLeft };
      }

      // Calcular fecha de reinicio (7 días desde premiumWeekStart)
      const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);

      return {
        allowed: false,
        message: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate),
      };
    }

    // PLAN FREEMIUM
    // Verificar si pasaron 5 días hábiles (expiración por tiempo)
    const businessDays = countBusinessDays(subscription.freemiumStartDate, new Date());

    if (businessDays >= 5 || subscription.freemiumUsesLeft <= 0) {
      // Marcar freemium como expirado
      await this.prisma.subscription.update({
        where: { userId },
        data: { freemiumExpired: true },
      });

      return {
        allowed: false,
        message: BotMessages.FREEMIUM_EXPIRED,
      };
    }

    // Deducir uso freemium
    const newUsesLeft = subscription.freemiumUsesLeft - 1;
    await this.prisma.subscription.update({
      where: { userId },
      data: { freemiumUsesLeft: newUsesLeft },
    });

    return { allowed: true, usesLeft: newUsesLeft };
  }

  /**
   * Verifica si han pasado 7 días desde el inicio de la semana premium
   */
  private isNewWeek(weekStart: Date, now: Date): boolean {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return now >= weekEnd;
  }

  /**
   * Ya no se usa - mantenido por compatibilidad
   * @deprecated Ahora premiumWeekStart se establece como la fecha actual
   */
  private getWeekStart(date: Date): Date {
    return new Date(date);
  }

  /**
   * Helper: Formatea el tipo de empleo para mostrar
   */
  private formatJobType(jobType: string | null | undefined): string {
    const typeMap: Record<string, string> = {
      full_time: 'Tiempo completo',
      part_time: 'Medio tiempo',
      internship: 'Pasantía',
      freelance: 'Freelance',
    };

    return typeMap[jobType || ''] || 'No configurado';
  }

  private formatExperienceLevel(experienceLevel: string | null | undefined): string {
    const experienceMap: Record<string, string> = {
      none: 'Sin experiencia',
      junior: 'Junior (1-2 años)',
      mid: 'Intermedio (3-5 años)',
      senior: 'Senior (5+ años)',
      lead: 'Lead/Expert (7+ años)',
    };

    return experienceMap[experienceLevel || ''] || 'No configurado';
  }

  // [DESACTIVADO] Formatea el workMode para mostrar al usuario - Puede reactivarse
  // /**
  //  * Formatea el workMode para mostrar al usuario
  //  */
  // private formatWorkMode(workMode: string | null | undefined): string {
  //   const workModeMap: Record<string, string> = {
  //     remoto: '🏠 Remoto',
  //     presencial: '🏢 Presencial',
  //     hibrido: '🔄 Híbrido',
  //     sin_preferencia: '✨ Sin preferencia',
  //   };
  //
  //   return workModeMap[workMode || ''] || 'No configurado';
  // }

  // ========================================
  // Métodos auxiliares de base de datos
  // ========================================

  /**
   * Busca un usuario por teléfono (NO crea si no existe)
   * El registro ahora se hace desde la landing page
   */
  private async findUserByPhone(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { subscription: true },
    });

    return user;
  }

  /**
   * Obtiene o crea un usuario
   * @deprecated Usar findUserByPhone - el registro ahora es desde landing
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

  // [ELIMINADO] getDeviceType ya no se usa, todos son tratados como móvil
  // private async getDeviceType(userId: string): Promise<'MOBILE' | 'DESKTOP'> { ... }

  /**
   * Helper: Regresar al menú principal con opciones interactivas
   * ACTUALIZADO: Siempre muestra lista interactiva (todos tratados como móvil)
   */
  private async returnToMainMenu(_userId: string, message: string): Promise<BotReply> {
    // Siempre retornar lista interactiva
    return {
      text: `${message}\n\n¿Qué te gustaría hacer?`,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: '🔍 Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: '✏️ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: '🔄 Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: '❌ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
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
   * Actualiza datos temporales en la sesión (campo JSON data)
   */
  private async updateSessionData(userId: string, newData: Record<string, any>) {
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const currentData = (session?.data as Record<string, any>) || {};
    const mergedData = { ...currentData, ...newData };

    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        data: mergedData,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(`💾 Datos de sesión actualizados: ${JSON.stringify(newData)}`);
  }

  /**
   * Actualiza o crea el perfil del usuario
   */
  private async updateUserProfile(
    userId: string,
    data: Partial<{
      role: string;
      experienceLevel: string;
      location: string;
      workMode: string;
      jobType: string;
      minSalary: number;
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
  private async upsertAlertPreference(
    userId: string,
    alertTime: string,
    alertFrequency: string = 'daily',
  ) {
    await this.prisma.alertPreference.upsert({
      where: { userId },
      update: {
        alertFrequency,
        alertTimeLocal: alertTime,
        enabled: true,
      },
      create: {
        userId,
        alertFrequency,
        alertTimeLocal: alertTime,
        timezone: 'America/Bogota',
        enabled: true,
      },
    });

    this.logger.debug(`⏰ Alerta configurada para: ${alertTime} con frecuencia ${alertFrequency}`);
  }

  /**
   * Reinicia el perfil del usuario (elimina datos pero mantiene el User)
   */
  private async restartUserProfile(userId: string) {
    // Eliminar UserProfile (1:1 con User)
    try {
      await this.prisma.userProfile.delete({ where: { userId } });
    } catch {
      // No existe, continuar
    }

    // Eliminar AlertPreference (1:1 con User)
    try {
      await this.prisma.alertPreference.delete({ where: { userId } });
    } catch {
      // No existe, continuar
    }

    // Eliminar búsquedas y trabajos enviados (pueden ser múltiples)
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesión a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: { state: ConversationState.NEW, data: {}, updatedAt: new Date() },
    });

    this.logger.log(`🔄 Perfil reiniciado para usuario ${userId}`);
  }

  /**
   * "Cancela" el servicio: elimina preferencias pero mantiene datos de identidad y suscripción
   * Esto evita que el usuario pueda re-registrarse para una nueva prueba gratuita
   */
  private async deleteUserCompletely(userId: string) {
    // Eliminar UserProfile (preferencias de búsqueda)
    try {
      await this.prisma.userProfile.delete({ where: { userId } });
    } catch {
      // No existe, continuar
    }

    // Eliminar AlertPreference
    try {
      await this.prisma.alertPreference.delete({ where: { userId } });
    } catch {
      // No existe, continuar
    }

    // Eliminar búsquedas y trabajos enviados
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesión a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: { state: ConversationState.NEW, data: {}, updatedAt: new Date() },
    });

    // NO eliminar User ni Subscription
    // El usuario mantiene su identidad y estado de suscripción

    this.logger.log(`🗑️ Preferencias eliminadas para usuario ${userId} (usuario NO eliminado)`);
  }
}
