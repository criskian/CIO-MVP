import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { LlmService } from '../llm/llm.service';
import { CvService } from '../cv/cv.service';
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
  isMobileDevice,
  isDesktopDevice,
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

      case ConversationState.ASK_DEVICE:
        return await this.handleAskDeviceState(userId, text);

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

      case ConversationState.CONFIRM_RESTART:
        return await this.handleConfirmRestartState(userId, text);

      case ConversationState.CONFIRM_CANCEL_SERVICE:
        return await this.handleConfirmCancelServiceState(userId, text);

      case ConversationState.EDITING_PROFILE:
        return await this.handleEditingProfileState(userId, text);

      case ConversationState.EDIT_ROLE:
        return await this.handleEditRoleState(userId, text);

      case ConversationState.EDIT_LOCATION:
        return await this.handleEditLocationState(userId, text);

      case ConversationState.EDIT_JOB_TYPE:
        return await this.handleEditJobTypeState(userId, text);

      case ConversationState.EDIT_MIN_SALARY:
        return await this.handleEditMinSalaryState(userId, text);

      case ConversationState.EDIT_ALERT_TIME:
        return await this.handleEditAlertTimeState(userId, text);

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

    // Transición: NEW → ASK_DEVICE
    await this.updateSessionState(userId, ConversationState.ASK_DEVICE);

    return {
      text: `${BotMessages.WELCOME}\n\n${BotMessages.ASK_DEVICE}`,
    };
  }

  /**
   * Estado ASK_DEVICE: Detectar si está en móvil o PC
   */
  private async handleAskDeviceState(userId: string, text: string): Promise<BotReply> {
    let deviceType = 'DESKTOP'; // Por defecto, asumimos desktop

    if (isMobileDevice(text)) {
      deviceType = 'MOBILE';
      this.logger.log(`📱 Usuario en dispositivo móvil`);
    } else if (isDesktopDevice(text)) {
      deviceType = 'DESKTOP';
      this.logger.log(`💻 Usuario en dispositivo desktop`);
    } else {
      // Si no se detecta claramente, pedimos de nuevo
      return {
        text: `Por favor, dime si estás en:

📱 *Celular/Móvil/Teléfono*
💻 *PC/Portátil/Computador*`,
      };
    }

    // Guardar deviceType en la sesión activa
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (session) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { deviceType },
      });
    }

    // Transición: ASK_DEVICE → ASK_TERMS
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    // Enviar términos según el dispositivo
    if (deviceType === 'MOBILE') {
      return {
        text: BotMessages.ASK_TERMS,
        buttons: [
          { id: 'accept_terms', title: 'Sí, acepto' },
          { id: 'reject_terms', title: 'No acepto' },
        ],
      };
    } else {
      return {
        text: BotMessages.ASK_TERMS_DESKTOP,
      };
    }
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
      text: `${BotMessages.ASK_TERMS}\n\n_Por favor, selecciona una opción:_`,
      buttons: [
        { id: 'accept_terms', title: 'Sí, acepto' },
        { id: 'reject_terms', title: 'No acepto' },
      ],
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

    return {
      text: BotMessages.ASK_JOB_TYPE,
      listTitle: 'Seleccionar tipo',
      listSections: [
        {
          title: 'Tipo de Empleo',
          rows: [
            {
              id: 'full_time',
              title: 'Tiempo completo',
              description: 'Jornada laboral completa (8 horas)',
            },
            {
              id: 'part_time',
              title: 'Medio tiempo',
              description: 'Jornada parcial (4-6 horas)',
            },
            { id: 'internship', title: 'Pasantía', description: 'Prácticas profesionales' },
            { id: 'freelance', title: 'Freelance', description: 'Trabajo por proyectos' },
          ],
        },
      ],
    };
  }

  /**
   * Estado ASK_JOB_TYPE: Esperando tipo de jornada
   */
  private async handleAskJobTypeState(userId: string, text: string): Promise<BotReply> {
    const jobType = normalizeJobType(text);

    if (!jobType) {
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.ERROR_JOB_TYPE_INVALID,
          listTitle: 'Seleccionar tipo',
          listSections: [
            {
              title: 'Tipo de Empleo',
              rows: [
                {
                  id: 'full_time',
                  title: 'Tiempo completo',
                  description: 'Jornada laboral completa (8 horas)',
                },
                {
                  id: 'part_time',
                  title: 'Medio tiempo',
                  description: 'Jornada parcial (4-6 horas)',
                },
                { id: 'internship', title: 'Pasantía', description: 'Prácticas profesionales' },
                {
                  id: 'freelance',
                  title: 'Freelance',
                  description: 'Trabajo por proyectos',
                },
              ],
            },
          ],
        };
      } else {
        return {
          text: BotMessages.ASK_JOB_TYPE_DESKTOP,
        };
      }
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

    // Obtener tipo de dispositivo
    const deviceType = await this.getDeviceType(userId);

    // Si es móvil, mostrar lista desplegable con comandos
    if (deviceType === 'MOBILE') {
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
    const deviceType = await this.getDeviceType(userId);

    // Detectar intención de reiniciar perfil
    if (isRestartIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_RESTART);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.CONFIRM_RESTART,
          buttons: [
            { id: 'confirm_restart', title: 'Sí, reiniciar' },
            { id: 'cancel_restart', title: 'No, cancelar' },
          ],
        };
      } else {
        return {
          text: BotMessages.CONFIRM_RESTART_DESKTOP,
        };
      }
    }

    // Detectar intención de cancelar servicio
    if (isCancelServiceIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_CANCEL_SERVICE);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.CONFIRM_CANCEL_SERVICE,
          buttons: [
            { id: 'confirm_cancel', title: 'Sí, confirmar' },
            { id: 'abort_cancel', title: 'No, continuar' },
          ],
        };
      } else {
        return {
          text: BotMessages.CONFIRM_CANCEL_SERVICE_DESKTOP,
        };
      }
    }

    // Detectar intención de editar perfil
    if (isEditIntent(text)) {
      return await this.showProfileForEditing(userId);
    }

    // Detectar intención de buscar empleos
    if (intent === UserIntent.SEARCH_NOW) {
      return await this.performJobSearch(userId);
    }

    // Mostrar menú de comandos disponibles
    if (deviceType === 'MOBILE') {
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
    } else {
      return { text: BotMessages.MENU_READY };
    }
  }

  /**
   * Ejecuta búsqueda de empleos y devuelve resultados formateados
   */
  private async performJobSearch(userId: string): Promise<BotReply> {
    try {
      this.logger.log(`🔍 Usuario ${userId} solicitó búsqueda de empleos`);

      // Ejecutar búsqueda
      const result = await this.jobSearchService.searchJobsForUser(userId);

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

      return { text: formattedJobs };
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
   * Estado CONFIRM_RESTART: Confirmando reinicio de perfil
   */
  private async handleConfirmRestartState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmó reinicio
      await this.restartUserProfile(userId);
      await this.updateSessionState(userId, ConversationState.ASK_TERMS);
      return { text: `${BotMessages.RESTARTED}\n\n${BotMessages.ASK_TERMS}` };
    }

    if (isRejection(text)) {
      // Usuario canceló el reinicio
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.RESTART_CANCELLED);
    }

    // No entendió la respuesta
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
   */
  private async showProfileForEditing(userId: string): Promise<BotReply> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const alertPref = await this.prisma.alertPreference.findUnique({ where: { userId } });
    const deviceType = await this.getDeviceType(userId);

    if (!profile) {
      return { text: BotMessages.NOT_READY_YET };
    }

    // Formatear valores para mostrar
    const formattedProfile = {
      role: profile.role || 'No configurado',
      location: profile.remoteAllowed
        ? `${profile.location || 'No configurado'} (Remoto permitido)`
        : profile.location || 'No configurado',
      jobType: this.formatJobType(profile.jobType),
      minSalary: profile.minSalary
        ? `$${profile.minSalary.toLocaleString('es-CO')} COP`
        : 'Sin filtro',
      alertTime: alertPref?.alertTimeLocal || 'No configurado',
    };

    // Transicionar a EDITING_PROFILE
    await this.updateSessionState(userId, ConversationState.EDITING_PROFILE);

    if (deviceType === 'DESKTOP') {
      return { text: BotMessages.EDITING_PROFILE_DESKTOP(formattedProfile) };
    } else {
      // Móvil: mostrar lista desplegable con opciones de edición
      return {
        text: `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${formattedProfile.role}
🔹 *Ubicación:* ${formattedProfile.location}
🔹 *Tipo de empleo:* ${formattedProfile.jobType}
🔹 *Salario mínimo:* ${formattedProfile.minSalary}
🔹 *Horario de alertas:* ${formattedProfile.alertTime}

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
                id: 'edit_ubicacion',
                title: '📍 Ubicación',
                description: `Actual: ${formattedProfile.location.substring(0, 50)}`,
              },
              {
                id: 'edit_tipo',
                title: '💼 Tipo de empleo',
                description: `Actual: ${formattedProfile.jobType}`,
              },
              {
                id: 'edit_salario',
                title: '💰 Salario mínimo',
                description: `Actual: ${formattedProfile.minSalary}`,
              },
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
  }

  /**
   * Estado EDITING_PROFILE: Usuario eligió editar, ahora debe seleccionar qué campo
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
      return { text: BotMessages.EDIT_FIELD_NOT_FOUND };
    }

    // Transicionar al estado de edición correspondiente
    switch (field) {
      case 'rol':
        await this.updateSessionState(userId, ConversationState.EDIT_ROLE);
        return { text: BotMessages.ASK_ROLE };

      case 'ubicacion':
        await this.updateSessionState(userId, ConversationState.EDIT_LOCATION);
        return { text: BotMessages.ASK_LOCATION };

      case 'tipo':
        await this.updateSessionState(userId, ConversationState.EDIT_JOB_TYPE);
        return {
          text: BotMessages.ASK_JOB_TYPE,
          listTitle: 'Seleccionar tipo',
          listSections: [
            {
              title: 'Tipo de Empleo',
              rows: [
                {
                  id: 'full_time',
                  title: 'Tiempo completo',
                  description: 'Jornada laboral completa (8 horas)',
                },
                {
                  id: 'part_time',
                  title: 'Medio tiempo',
                  description: 'Jornada parcial (4-6 horas)',
                },
                { id: 'internship', title: 'Pasantía', description: 'Prácticas profesionales' },
                { id: 'freelance', title: 'Freelance', description: 'Trabajo por proyectos' },
              ],
            },
          ],
        };

      case 'salario':
        await this.updateSessionState(userId, ConversationState.EDIT_MIN_SALARY);
        return { text: BotMessages.ASK_MIN_SALARY };

      case 'horario':
        await this.updateSessionState(userId, ConversationState.EDIT_ALERT_TIME);
        return { text: BotMessages.ASK_ALERT_TIME };

      default:
        return { text: BotMessages.EDIT_FIELD_NOT_FOUND };
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

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('rol', role));
  }

  /**
   * Estado EDIT_LOCATION: Editando ubicación
   */
  private async handleEditLocationState(userId: string, text: string): Promise<BotReply> {
    const location = normalizeLocation(text);

    if (!location) {
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    const isRemote = text.toLowerCase().includes('remoto') || text.toLowerCase().includes('remote');

    await this.updateUserProfile(userId, {
      location,
      remoteAllowed: isRemote,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    const displayLocation = isRemote ? `${location} (Remoto)` : location;
    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('ubicación', displayLocation));
  }

  /**
   * Estado EDIT_JOB_TYPE: Editando tipo de empleo
   */
  private async handleEditJobTypeState(userId: string, text: string): Promise<BotReply> {
    const jobType = normalizeJobType(text);

    if (!jobType) {
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.ERROR_JOB_TYPE_INVALID,
          listTitle: 'Seleccionar tipo',
          listSections: [
            {
              title: 'Tipo de Empleo',
              rows: [
                {
                  id: 'full_time',
                  title: 'Tiempo completo',
                  description: 'Jornada laboral completa (8 horas)',
                },
                {
                  id: 'part_time',
                  title: 'Medio tiempo',
                  description: 'Jornada parcial (4-6 horas)',
                },
                { id: 'internship', title: 'Pasantía', description: 'Prácticas profesionales' },
                { id: 'freelance', title: 'Freelance', description: 'Trabajo por proyectos' },
              ],
            },
          ],
        };
      } else {
        return {
          text: BotMessages.ASK_JOB_TYPE_DESKTOP,
        };
      }
    }

    await this.updateUserProfile(userId, { jobType });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('tipo de empleo', this.formatJobType(jobType)));
  }

  /**
   * Estado EDIT_MIN_SALARY: Editando salario mínimo
   */
  private async handleEditMinSalaryState(userId: string, text: string): Promise<BotReply> {
    if (text.trim() === '0') {
      await this.updateUserProfile(userId, { minSalary: 0 });
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('salario mínimo', 'Sin filtro'));
    }

    const minSalary = normalizeSalary(text);

    if (!minSalary) {
      return { text: BotMessages.ERROR_SALARY_INVALID };
    }

    await this.updateUserProfile(userId, { minSalary });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED(
        'salario mínimo',
        `$${minSalary.toLocaleString('es-CO')} COP`,
      ),
    );
  }

  /**
   * Estado EDIT_ALERT_TIME: Editando horario de alertas
   */
  private async handleEditAlertTimeState(userId: string, text: string): Promise<BotReply> {
    const alertTime = normalizeTime(text);

    if (!alertTime) {
      return { text: BotMessages.ERROR_TIME_INVALID };
    }

    await this.upsertAlertPreference(userId, alertTime);
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('horario de alertas', alertTime));
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
   * Obtiene el tipo de dispositivo del usuario (MOBILE o DESKTOP)
   */
  private async getDeviceType(userId: string): Promise<'MOBILE' | 'DESKTOP'> {
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return (session?.deviceType as 'MOBILE' | 'DESKTOP') || 'DESKTOP';
  }

  /**
   * Helper: Regresar al menú principal con opciones interactivas si está en móvil
   */
  private async returnToMainMenu(userId: string, message: string): Promise<BotReply> {
    const deviceType = await this.getDeviceType(userId);

    if (deviceType === 'MOBILE') {
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

    return { text: `${message}\n\n${BotMessages.MENU_READY}` };
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
   * Elimina completamente al usuario y todos sus datos
   */
  private async deleteUserCompletely(userId: string) {
    // Prisma Cascade Delete eliminará automáticamente:
    // - UserProfile
    // - Session
    // - AlertPreference
    // - JobSearchLog
    // - SentJob
    await this.prisma.user.delete({ where: { id: userId } });

    this.logger.log(`🗑️ Usuario eliminado completamente: ${userId}`);
  }
}
