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
  normalizeExperienceLevel,
  normalizeLocation,
  normalizeWorkMode,
  normalizeJobType,
  normalizeSalary,
  normalizeTime,
  normalizeAlertFrequency,
  alertFrequencyToText,
  generateTimeOptions,
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

      case ConversationState.ASK_EXPERIENCE:
        return await this.handleAskExperienceState(userId, text);

      case ConversationState.ASK_LOCATION:
        return await this.handleAskLocationState(userId, text);

      case ConversationState.ASK_WORK_MODE:
        return await this.handleAskWorkModeState(userId, text);

      case ConversationState.ASK_JOB_TYPE:
        return await this.handleAskJobTypeState(userId, text);

      case ConversationState.ASK_MIN_SALARY:
        return await this.handleAskMinSalaryState(userId, text);

      case ConversationState.ASK_ALERT_FREQUENCY:
        return await this.handleAskAlertFrequencyState(userId, text);

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

      case ConversationState.EDIT_EXPERIENCE:
        return await this.handleEditExperienceState(userId, text);

      case ConversationState.EDIT_LOCATION:
        return await this.handleEditLocationState(userId, text);

      case ConversationState.EDIT_WORK_MODE:
        return await this.handleEditWorkModeState(userId, text);

      case ConversationState.EDIT_JOB_TYPE:
        return await this.handleEditJobTypeState(userId, text);

      case ConversationState.EDIT_MIN_SALARY:
        return await this.handleEditMinSalaryState(userId, text);

      case ConversationState.EDIT_ALERT_FREQUENCY:
        return await this.handleEditAlertFrequencyState(userId, text);

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

    // Transición: ASK_ROLE → ASK_EXPERIENCE
    await this.updateSessionState(userId, ConversationState.ASK_EXPERIENCE);

    // Obtener tipo de dispositivo para usar lista en móvil
    const deviceType = await this.getDeviceType(userId);

    if (deviceType === 'MOBILE') {
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
    } else {
      return { text: BotMessages.ASK_EXPERIENCE };
    }
  }

  /**
   * Estado ASK_EXPERIENCE: Esperando nivel de experiencia
   */
  private async handleAskExperienceState(userId: string, text: string): Promise<BotReply> {
    const experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      return { text: BotMessages.ERROR_EXPERIENCE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { experienceLevel });

    // Transición: ASK_EXPERIENCE → ASK_LOCATION
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

    // Guardar ubicación en UserProfile
    await this.updateUserProfile(userId, {
      location,
    });

    // Transición: ASK_LOCATION → ASK_WORK_MODE
    await this.updateSessionState(userId, ConversationState.ASK_WORK_MODE);

    const deviceType = await this.getDeviceType(userId);

    // Si es móvil, mostrar lista desplegable (4 opciones)
    if (deviceType === 'MOBILE') {
      return {
        text: BotMessages.ASK_WORK_MODE,
        listTitle: 'Elige modalidad',
        listSections: [
          {
            title: 'Modalidad de Trabajo',
            rows: [
              { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
              { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
              {
                id: 'work_hibrido',
                title: '🔄 Híbrido',
                description: 'Mixto (remoto + presencial)',
              },
              {
                id: 'work_sin_preferencia',
                title: '✨ Sin preferencia',
                description: 'Cualquier modalidad',
              },
            ],
          },
        ],
      };
    }

    // Si es desktop, mensaje simple
    return { text: BotMessages.ASK_WORK_MODE_DESKTOP };
  }

  /**
   * Estado ASK_WORK_MODE: Esperando modalidad (remoto/presencial/híbrido/sin preferencia)
   */
  private async handleAskWorkModeState(userId: string, text: string): Promise<BotReply> {
    const workMode = normalizeWorkMode(text);

    if (!workMode) {
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.ERROR_WORK_MODE_INVALID,
          listTitle: 'Elige modalidad',
          listSections: [
            {
              title: 'Modalidad de Trabajo',
              rows: [
                { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
                { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
                {
                  id: 'work_hibrido',
                  title: '🔄 Híbrido',
                  description: 'Mixto (remoto + presencial)',
                },
                {
                  id: 'work_sin_preferencia',
                  title: '✨ Sin preferencia',
                  description: 'Cualquier modalidad',
                },
              ],
            },
          ],
        };
      }

      return { text: BotMessages.ERROR_WORK_MODE_INVALID };
    }

    // Guardar modalidad en UserProfile
    await this.updateUserProfile(userId, {
      workMode,
    });

    // Transición: ASK_WORK_MODE → ASK_JOB_TYPE
    await this.updateSessionState(userId, ConversationState.ASK_JOB_TYPE);

    const deviceType = await this.getDeviceType(userId);

    if (deviceType === 'MOBILE') {
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

    return { text: BotMessages.ASK_JOB_TYPE_DESKTOP };
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
      await this.updateSessionState(userId, ConversationState.ASK_ALERT_FREQUENCY);

      // Obtener tipo de dispositivo para mostrar lista en móvil
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.ASK_ALERT_FREQUENCY,
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

      return { text: BotMessages.ASK_ALERT_FREQUENCY };
    }

    const minSalary = normalizeSalary(text);

    if (!minSalary) {
      return { text: BotMessages.ERROR_SALARY_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { minSalary });

    // Transición: ASK_MIN_SALARY → ASK_ALERT_FREQUENCY
    await this.updateSessionState(userId, ConversationState.ASK_ALERT_FREQUENCY);

    // Obtener tipo de dispositivo para mostrar lista en móvil
    const deviceType = await this.getDeviceType(userId);

    if (deviceType === 'MOBILE') {
      return {
        text: BotMessages.ASK_ALERT_FREQUENCY,
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

    return { text: BotMessages.ASK_ALERT_FREQUENCY };
  }

  /**
   * Estado ASK_ALERT_FREQUENCY: Esperando frecuencia de alertas
   */
  private async handleAskAlertFrequencyState(userId: string, text: string): Promise<BotReply> {
    const frequency = normalizeAlertFrequency(text);

    if (!frequency) {
      // Obtener tipo de dispositivo para mostrar lista o texto
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
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

      return { text: BotMessages.ERROR_ALERT_FREQUENCY_INVALID };
    }

    // Guardar temporalmente en session.data (lo guardamos definitivamente cuando guarde la hora)
    await this.updateSessionData(userId, { alertFrequency: frequency });

    // Transición: ASK_ALERT_FREQUENCY → ASK_ALERT_TIME
    await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);

    // Obtener tipo de dispositivo para mostrar lista de horas en móvil
    const deviceType = await this.getDeviceType(userId);

    if (deviceType === 'MOBILE') {
      // Mostrar lista desplegable con horas comunes (6:00 AM - 4:00 PM)
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

    // Obtener frecuencia guardada en session.data
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const alertFrequency = (session?.data as any)?.alertFrequency || 'daily';

    // Guardar en AlertPreference
    await this.upsertAlertPreference(userId, alertTime, alertFrequency);

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

      // Agregar menú de opciones al final
      const menuText = `

---

¿Qué quieres hacer ahora?

• Escribe *"buscar"* para buscar más ofertas
• Escribe *"editar"* para cambiar tus preferencias
• Escribe *"reiniciar"* para reconfigurar tu perfil
• Escribe *"cancelar"* para dejar de usar el servicio`;

      return { text: formattedJobs + menuText };
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
      experience: this.formatExperienceLevel(profile.experienceLevel),
      location: profile.location || 'No configurado',
      workMode: this.formatWorkMode(profile.workMode),
      jobType: this.formatJobType(profile.jobType),
      minSalary: profile.minSalary
        ? `$${profile.minSalary.toLocaleString('es-CO')} COP`
        : 'Sin filtro',
      alertFrequency: alertPref?.alertFrequency
        ? alertFrequencyToText(alertPref.alertFrequency as any)
        : 'No configurado',
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
💡 *Experiencia:* ${formattedProfile.experience}
📍 *Ubicación:* ${formattedProfile.location}
🏠 *Modalidad:* ${formattedProfile.workMode}
💼 *Tipo de empleo:* ${formattedProfile.jobType}
💰 *Salario mínimo:* ${formattedProfile.minSalary}
🔔 *Frecuencia:* ${formattedProfile.alertFrequency}
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
              {
                id: 'edit_modalidad',
                title: '🏠 Modalidad',
                description: `Actual: ${formattedProfile.workMode}`,
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
                id: 'edit_frecuencia',
                title: '🔔 Frecuencia',
                description: `Actual: ${formattedProfile.alertFrequency}`,
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

      case 'experiencia': {
        await this.updateSessionState(userId, ConversationState.EDIT_EXPERIENCE);
        const deviceType = await this.getDeviceType(userId);

        if (deviceType === 'MOBILE') {
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
        }

        return { text: BotMessages.ASK_EXPERIENCE };
      }

      case 'ubicacion':
        await this.updateSessionState(userId, ConversationState.EDIT_LOCATION);
        return { text: BotMessages.ASK_LOCATION };

      case 'modalidad': {
        await this.updateSessionState(userId, ConversationState.EDIT_WORK_MODE);
        const deviceType = await this.getDeviceType(userId);

        if (deviceType === 'MOBILE') {
          return {
            text: BotMessages.ASK_WORK_MODE,
            listTitle: 'Elige modalidad',
            listSections: [
              {
                title: 'Modalidad de Trabajo',
                rows: [
                  { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
                  { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
                  {
                    id: 'work_hibrido',
                    title: '🔄 Híbrido',
                    description: 'Mixto (remoto + presencial)',
                  },
                  {
                    id: 'work_sin_preferencia',
                    title: '✨ Sin preferencia',
                    description: 'Cualquier modalidad',
                  },
                ],
              },
            ],
          };
        }

        return { text: BotMessages.ASK_WORK_MODE_DESKTOP };
      }

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

      case 'frecuencia': {
        await this.updateSessionState(userId, ConversationState.EDIT_ALERT_FREQUENCY);
        const deviceType = await this.getDeviceType(userId);

        if (deviceType === 'MOBILE') {
          return {
            text: BotMessages.ASK_ALERT_FREQUENCY,
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

        return { text: BotMessages.ASK_ALERT_FREQUENCY };
      }

      case 'horario': {
        await this.updateSessionState(userId, ConversationState.EDIT_ALERT_TIME);
        const deviceType = await this.getDeviceType(userId);

        if (deviceType === 'MOBILE') {
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

        return { text: BotMessages.ASK_ALERT_TIME };
      }

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
   * Estado EDIT_EXPERIENCE: Editando nivel de experiencia
   */
  private async handleEditExperienceState(userId: string, text: string): Promise<BotReply> {
    const experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      return { text: BotMessages.ERROR_EXPERIENCE_INVALID };
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
    const location = normalizeLocation(text);

    if (!location) {
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, {
      location,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('ubicación', location));
  }

  /**
   * Estado EDIT_WORK_MODE: Editando modalidad de trabajo
   */
  private async handleEditWorkModeState(userId: string, text: string): Promise<BotReply> {
    const workMode = normalizeWorkMode(text);

    if (!workMode) {
      const deviceType = await this.getDeviceType(userId);

      if (deviceType === 'MOBILE') {
        return {
          text: BotMessages.ERROR_WORK_MODE_INVALID,
          listTitle: 'Elige modalidad',
          listSections: [
            {
              title: 'Modalidad de Trabajo',
              rows: [
                { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
                { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
                {
                  id: 'work_hibrido',
                  title: '🔄 Híbrido',
                  description: 'Mixto (remoto + presencial)',
                },
                {
                  id: 'work_sin_preferencia',
                  title: '✨ Sin preferencia',
                  description: 'Cualquier modalidad',
                },
              ],
            },
          ],
        };
      }

      return { text: BotMessages.ERROR_WORK_MODE_INVALID };
    }

    await this.updateUserProfile(userId, {
      workMode,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    const displayMode = this.formatWorkMode(workMode);
    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('modalidad de trabajo', displayMode),
    );
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

    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('tipo de empleo', this.formatJobType(jobType)),
    );
  }

  /**
   * Estado EDIT_MIN_SALARY: Editando salario mínimo
   */
  private async handleEditMinSalaryState(userId: string, text: string): Promise<BotReply> {
    if (text.trim() === '0') {
      await this.updateUserProfile(userId, { minSalary: 0 });
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(
        userId,
        BotMessages.FIELD_UPDATED('salario mínimo', 'Sin filtro'),
      );
    }

    const minSalary = normalizeSalary(text);

    if (!minSalary) {
      return { text: BotMessages.ERROR_SALARY_INVALID };
    }

    await this.updateUserProfile(userId, { minSalary });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(
      userId,
      BotMessages.FIELD_UPDATED('salario mínimo', `$${minSalary.toLocaleString('es-CO')} COP`),
    );
  }

  /**
   * Estado EDIT_ALERT_FREQUENCY: Editando frecuencia de alertas
   */
  private async handleEditAlertFrequencyState(userId: string, text: string): Promise<BotReply> {
    const frequency = normalizeAlertFrequency(text);

    if (!frequency) {
      return { text: BotMessages.ERROR_ALERT_FREQUENCY_INVALID };
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
   */
  private async handleEditAlertTimeState(userId: string, text: string): Promise<BotReply> {
    const alertTime = normalizeTime(text);

    if (!alertTime) {
      return { text: BotMessages.ERROR_TIME_INVALID };
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

  /**
   * Formatea el workMode para mostrar al usuario
   */
  private formatWorkMode(workMode: string | null | undefined): string {
    const workModeMap: Record<string, string> = {
      remoto: '🏠 Remoto',
      presencial: '🏢 Presencial',
      hibrido: '🔄 Híbrido',
      sin_preferencia: '✨ Sin preferencia',
    };

    return workModeMap[workMode || ''] || 'No configurado';
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
