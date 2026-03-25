import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { LlmService } from '../llm/llm.service';
import { CvService } from '../cv/cv.service';
import { ChatHistoryService } from './chat-history.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  // isMobileDevice, // [ELIMINADO] Ya no se usa, todos son tratados como mÃ³vil
  // isDesktopDevice, // [ELIMINADO] Ya no se usa, todos son tratados como mÃ³vil
  normalizeRole,
  isNonRoleInput,
  isPreferenceUpdateIntent,
  normalizeExperienceLevel,
  normalizeLocation,
  validateAndNormalizeLocation,
  extractNormalizedLocations,
  // normalizeWorkMode, // [DESACTIVADO] FunciÃ³n comentada
  normalizeJobType,
  normalizeSalary,
  normalizeTime,
  normalizeAlertFrequency,
  alertFrequencyToText,
  generateTimeOptions,
  getFirstName,
} from './helpers/input-validators';
import {
  shouldExpireFreemium,
} from './helpers/date-utils';

type FlowVariant = 'legacy' | 'freemium_v2';

/**
 * Servicio de conversaciÃ³n (Orquestador)
 * Implementa la mÃ¡quina de estados del flujo conversacional con el usuario
 * NO se comunica directamente con WhatsApp, solo procesa y devuelve respuestas
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly defaultOnboardingAlertTime = '07:00';
  private readonly defaultFlowVariant: FlowVariant = 'legacy';
  private readonly v2FlowVariant: FlowVariant = 'freemium_v2';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobSearchService: JobSearchService,
    private readonly llmService: LlmService,
    private readonly cvService: CvService,
    private readonly chatHistoryService: ChatHistoryService,
    private readonly notificationsService: NotificationsService,
  ) { }

  /**
   * Punto de entrada principal: procesa un mensaje entrante y devuelve una respuesta
   */
  async handleIncomingMessage(message: NormalizedIncomingMessage): Promise<BotReply> {
    try {
      const { phone, text, mediaUrl, messageType } = message;

      this.logger.log(`ðŸ’¬ Procesando mensaje de ${phone}: ${text || '[media]'}`);

      // 1. Buscar usuario por telÃ©fono (NO crear, debe registrarse en landing)
      const user = await this.findUserByPhone(phone);

      // 2. Si no estÃ¡ registrado, iniciar registro in-bot
      if (!user) {
        this.logger.log(`ðŸ“ Usuario no registrado: ${phone} â€” iniciando registro in-bot`);

        // Crear usuario mÃ­nimo con solo el telÃ©fono
        const newUser = await this.prisma.user.create({
          data: { phone },
          include: { subscription: true },
        });

        // Crear sesiÃ³n con estado WA_ASK_NAME
        await this.prisma.session.create({
          data: {
            userId: newUser.id,
            state: ConversationState.LEAD_COLLECT_PROFILE,
            data: {
              flowVariant: this.v2FlowVariant,
              skipAlertConfigOnboarding: true,
              defaultOnboardingAlertTime: this.defaultOnboardingAlertTime,
            },
          },
        });

        return { text: BotMessages.V2_WELCOME_ROLE };
      }

      // 3. Si tiene user pero no tiene nombre (registro in-bot en progreso), continuar flujo
      if (!user.name || !user.email) {
        const session = await this.getOrCreateSession(user.id, this.v2FlowVariant);
        const flowVariant = await this.ensureSessionFlowVariant(
          user.id,
          session,
          this.v2FlowVariant,
        );
        if (flowVariant === this.v2FlowVariant) {
          if (!this.isV2LeadState(session.state)) {
            await this.updateSessionState(user.id, ConversationState.LEAD_COLLECT_PROFILE);
            return { text: BotMessages.V2_WELCOME_ROLE };
          }

          const intent = detectIntent(text || '');
          return await this.handleStateTransition(user.id, session.state, text || '', intent);
        }
        // Si por alguna razÃ³n no tiene sesiÃ³n en WA_ASK_NAME, ponerlo ahÃ­
        if (session.state !== ConversationState.WA_ASK_NAME && session.state !== ConversationState.WA_ASK_EMAIL) {
          await this.updateSessionState(user.id, ConversationState.WA_ASK_NAME);
          return { text: BotMessages.NOT_REGISTERED };
        }
        // Continuar con el flujo normal de estados
        return await this.handleStateTransition(user.id, session.state, text || '', detectIntent(text || ''));
      }

      // 4. Obtener o crear sesiÃ³n activa
      const session = await this.getOrCreateSession(user.id);
      const flowVariant = await this.ensureSessionFlowVariant(
        user.id,
        session,
        this.defaultFlowVariant,
      );
      this.logger.debug(`Variante de flujo para ${user.id}: ${flowVariant}`);

      // NOTA: Los mensajes entrantes y salientes se guardan centralizadamente en WhatsappService

      // 5. Si hay media (documento/imagen), podrÃ­a ser un CV
      if (mediaUrl && messageType === 'document') {
        const response = await this.handleCVUpload(user.id, mediaUrl);
        return response;
      }

      // 6. Si no hay texto, no podemos procesar - mostrar menÃº de ayuda
      if (!text) {
        const response = await this.returnToMainMenu(user.id, BotMessages.UNKNOWN_INTENT);
        return response;
      }

      // 7. Detectar intenciÃ³n general (para comandos especiales)
      let intent = detectIntent(text);

      // 7.25. Seguridad: frases como "quiero remoto" deben ir a editar perfil
      if (session.state === ConversationState.READY && isPreferenceUpdateIntent(text)) {
        intent = UserIntent.CHANGE_PREFERENCES;
      }

      // 7.5. Si regex no detectÃ³ nada y estamos en READY, preguntar al LLM
      if (intent === UserIntent.UNKNOWN && session.state === ConversationState.READY) {
        const aiIntent = await this.llmService.detectIntent(text, session.state);
        if (aiIntent && aiIntent !== UserIntent.UNKNOWN) {
          intent = aiIntent;
          this.logger.log(`ðŸ§  Intent detectado por IA: ${intent}`);
        }
      }

      // 7.6. Si estamos en onboarding y el texto no parece una respuesta vÃ¡lida, manejar out-of-flow
      const outOfFlowResponse = await this.tryHandleOutOfFlow(user.id, text, session.state, intent);
      if (outOfFlowResponse) {
        return outOfFlowResponse;
      }

      // 8. Manejar comandos especiales independientes del estado
      if (intent === UserIntent.HELP) {
        return { text: BotMessages.HELP_MESSAGE };
      }

      // 9. Procesar segÃºn el estado actual
      const response = await this.handleStateTransition(user.id, session.state, text, intent);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error procesando mensaje: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // ðŸ’¾ GUARDAR ERROR EN HISTORIAL
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
   * Maneja las transiciones de estado segÃºn la mÃ¡quina de estados
   */
  private async handleStateTransition(
    userId: string,
    currentState: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    this.logger.debug(`Estado actual: ${currentState}, Intent: ${intent}`);

    switch (currentState) {
      case ConversationState.LEAD_COLLECT_PROFILE:
        return await this.handleLeadCollectProfileState(userId, text);

      case ConversationState.LEAD_ASK_LOCATION:
        return await this.handleLeadAskLocationState(userId, text);

      case ConversationState.LEAD_ASK_EXPERIENCE:
        return await this.handleLeadAskExperienceState(userId, text);

      case ConversationState.LEAD_SHOW_FIRST_VACANCY:
        return await this.handleLeadShowFirstVacancyState(userId);

      case ConversationState.LEAD_WAIT_INTEREST:
        return await this.handleLeadWaitInterestState(userId, text, intent);

      case ConversationState.LEAD_WAIT_REJECTION_REASON:
        return await this.handleLeadWaitRejectionReasonState(userId, text);

      case ConversationState.LEAD_REGISTER_NAME:
        return await this.handleLeadRegisterNameState(userId, text);

      case ConversationState.LEAD_REGISTER_EMAIL:
        return await this.handleLeadRegisterEmailState(userId, text);

      case ConversationState.LEAD_TERMS_CONSENT:
        return await this.handleLeadTermsConsentState(userId, text, intent);

      case ConversationState.WA_ASK_NAME:
        return await this.handleWaAskNameState(userId, text);

      case ConversationState.WA_ASK_EMAIL:
        return await this.handleWaAskEmailState(userId, text);

      case ConversationState.NEW:
        return await this.handleNewState(userId);

      // [ELIMINADO] ASK_DEVICE - Ya no se pregunta por dispositivo, siempre usamos botones interactivos
      // case ConversationState.ASK_DEVICE:
      //   return await this.handleAskDeviceState(userId, text);

      case ConversationState.ASK_TERMS:
        return await this.handleAskTermsState(userId, text, intent);

      case ConversationState.ASK_ROLE:
        return await this.handleAskRoleState(userId, text);

      // [DESACTIVADO] Pregunta de remoto eliminada del flujo
      // case ConversationState.ASK_REMOTE:
      //   return await this.handleAskRemoteState(userId, text);

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
   * Intenta manejar mensajes fuera de flujo durante onboarding.
   * Si el usuario escribe algo inesperado (preguntas, saludos, etc.),
   * el LLM intenta responder contextualmente o extraer la respuesta real.
   * Retorna null si no aplica o si el mensaje parece ser una respuesta vÃ¡lida.
   */
  private async tryHandleOutOfFlow(
    userId: string,
    text: string,
    currentState: string,
    intent: UserIntent,
  ): Promise<BotReply | null> {
    // Solo aplica en estados donde esperamos respuesta especÃ­fica
    const interactiveStates = [
      ConversationState.LEAD_COLLECT_PROFILE,
      ConversationState.LEAD_ASK_LOCATION,
      ConversationState.LEAD_ASK_EXPERIENCE,
      ConversationState.LEAD_WAIT_INTEREST,
      ConversationState.LEAD_WAIT_REJECTION_REASON,
      ConversationState.LEAD_REGISTER_NAME,
      ConversationState.LEAD_REGISTER_EMAIL,
      ConversationState.LEAD_TERMS_CONSENT,
      ConversationState.ASK_ROLE,
      ConversationState.ASK_LOCATION,
      ConversationState.ASK_EXPERIENCE,
      ConversationState.OFFER_ALERTS,
      ConversationState.EDITING_PROFILE,
      ConversationState.EDIT_ROLE,
      ConversationState.EDIT_LOCATION,
      ConversationState.READY,
    ];

    if (!interactiveStates.includes(currentState as ConversationState)) return null;

    if (currentState === ConversationState.READY && this.shouldRedirectToEditFlow(text, intent)) {
      return await this.redirectReadyUserToEditFlow(userId);
    }

    // Si el regex ya detectÃ³ un intent conocido, no es out-of-flow
    if (intent !== UserIntent.UNKNOWN) return null;

    // En selecciÃ³n de campo de ediciÃ³n, pasar siempre por IA si la respuesta no coincide con un campo.
    if (currentState === ConversationState.EDITING_PROFILE) {
      if (detectEditField(text) || isRejection(text) || text.toLowerCase().includes('cancelar')) {
        return null;
      }

      const aiResponse = await this.llmService.generateConversationalResponse(text, currentState);
      const editReply = await this.showProfileForEditing(userId);
      const cleanAiResponse = this.normalizeConversationalMessage(aiResponse);

      if (cleanAiResponse) {
        return {
          ...editReply,
          text: `${cleanAiResponse}\n\n${editReply.text}`,
        };
      }

      return {
        ...editReply,
        text: `Entiendo. Para continuar, elige que campo quieres editar: cargo, ubicacion, nivel de experiencia u horario de alertas.\n\n${editReply.text}`,
      };
    }

    // Solo interceptar si parece un mensaje conversacional (no respuesta vÃ¡lida)
    if (!isNonRoleInput(text)) return null;

    // PRIORIDAD 1: Respuesta conversacional Ãºnica del LLM
    const aiResponse = await this.llmService.generateConversationalResponse(text, currentState);
    if (aiResponse) {
      this.logger.log(`ðŸ—£ï¸ Respuesta conversacional IA en ${currentState}: "${text}"`);
      return { text: this.normalizeConversationalMessage(aiResponse) || aiResponse };
    }

    // PRIORIDAD 2: HeurÃ­stico variado (LLM caÃ­do)
    const stateMessages: Record<string, string[]> = {
      [ConversationState.ASK_ROLE]: [
        `Â¡Hola! ðŸ˜Š Estoy aquÃ­ para ayudarte a encontrar empleo.\n\nNecesito saber: *Â¿cuÃ¡l es tu cargo o profesiÃ³n?*\n\nðŸ‘‰ Ejemplo: _Desarrollador web_, _Vendedor_, _Auxiliar administrativo_`,
        `Â¡Entiendo! Pero primero necesito que me digas *en quÃ© trabajas o quieres trabajar*.\n\nEscribe solo *un rol*, por ejemplo: _DiseÃ±ador grÃ¡fico_, _Contador_, _Marketing_`,
        `Â¡Sin problema! ðŸ˜‰ Para encontrarte las mejores ofertas, dime *tu profesiÃ³n principal*.\n\nPor ejemplo: _Ingeniero industrial_, _Analista de datos_, _Recepcionista_`,
      ],
      [ConversationState.ASK_LOCATION]: [
        `Â¡Claro! Pero necesito saber *dÃ³nde quieres buscar empleo*. ðŸ“\n\nðŸ‘‰ Escribe una *ciudad* o *paÃ­s*: _BogotÃ¡_, _Colombia_, _MedellÃ­n_`,
        `Entiendo tu mensaje. ðŸ˜Š Ahora dime, *Â¿en quÃ© ciudad o paÃ­s* te gustarÃ­a trabajar?\n\nEjemplo: _Lima_, _MÃ©xico_, _BogotÃ¡_`,
      ],
      [ConversationState.ASK_EXPERIENCE]: [
        `Â¡Gracias por escribir! Pero necesito saber *tu nivel de experiencia*. ðŸ‘‡\n\nUsa el botÃ³n de abajo para seleccionarlo.`,
        `Entiendo. ðŸ˜Š Para continuar, selecciona *tu nivel de experiencia* con el botÃ³n de abajo.`,
      ],
      [ConversationState.OFFER_ALERTS]: [
        `Â¡Solo necesito una respuesta rÃ¡pida! *Â¿Quieres recibir alertas diarias* de nuevas ofertas?\n\nResponde *SÃ­* o *No*.`,
      ],
      [ConversationState.LEAD_COLLECT_PROFILE]: [
        `Estoy contigo. Para empezar, dime *el cargo o rol* que estas buscando.`,
      ],
      [ConversationState.LEAD_ASK_LOCATION]: [
        `Perfecto. Ahora dime *donde* quieres trabajar. Puede ser ciudad, pais o remoto.`,
      ],
      [ConversationState.LEAD_ASK_EXPERIENCE]: [
        `Gracias. Para continuar, selecciona *tu nivel de experiencia* en el rol.`,
      ],
      [ConversationState.LEAD_WAIT_INTEREST]: [
        `Solo necesito que elijas una opcion para seguir: *Si, me intereso* o *No me intereso*.`,
      ],
      [ConversationState.LEAD_WAIT_REJECTION_REASON]: [
        `Gracias. Elige el motivo principal para ajustar la siguiente oferta.`,
      ],
      [ConversationState.LEAD_REGISTER_NAME]: [
        `Para continuar con tu registro, escribeme tu *nombre completo*.`,
      ],
      [ConversationState.LEAD_REGISTER_EMAIL]: [
        `Ahora necesito tu *correo electronico* para completar el registro.`,
      ],
      [ConversationState.LEAD_TERMS_CONSENT]: [
        `Para activar tu prueba, necesito que elijas: *Acepto* o *No acepto*.`,
      ],
      [ConversationState.READY]: [
        `Â¡Hola! ðŸ˜Š Puedo ayudarte a *buscar empleo*, *editar tu perfil*, o *ver tu perfil actual*.\n\nEscribe lo que necesites o usa el menÃº de abajo. ðŸ‘‡`,
      ],
    };

    const messages = stateMessages[currentState];
    if (messages) {
      // Elegir mensaje aleatorio para variedad
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      this.logger.log(`ðŸ›¡ï¸ HeurÃ­stico variado en ${currentState}: "${text}"`);
      return { text: randomMessage };
    }

    return null;
  }

  private normalizeConversationalMessage(message: string | null): string | null {
    if (!message) return null;

    let normalized = message
      .replace(/\*{2,}/g, '*')
      .replace(/_{2,}/g, '_')
      .trim();

    const boldMarks = (normalized.match(/\*/g) || []).length;
    if (boldMarks % 2 !== 0) {
      normalized = normalized.replace(/\*/g, '');
    }

    const italicMarks = (normalized.match(/_/g) || []).length;
    if (italicMarks % 2 !== 0) {
      normalized = normalized.replace(/_/g, '');
    }

    return normalized;
  }

  private shouldRedirectToEditFlow(text: string, intent: UserIntent): boolean {
    if (isEditIntent(text)) return true;
    if (intent === UserIntent.CHANGE_PREFERENCES) return true;
    return isPreferenceUpdateIntent(text);
  }

  private async redirectReadyUserToEditFlow(userId: string): Promise<BotReply> {
    const editReply = await this.showProfileForEditing(userId);
    return {
      ...editReply,
      text: `Perfecto, te ayudo con ese ajuste antes de buscar de nuevo.\n\n${editReply.text}`,
    };
  }

  private isV2LeadState(state: string): boolean {
    const v2States: ConversationState[] = [
      ConversationState.LEAD_COLLECT_PROFILE,
      ConversationState.LEAD_ASK_LOCATION,
      ConversationState.LEAD_ASK_EXPERIENCE,
      ConversationState.LEAD_SHOW_FIRST_VACANCY,
      ConversationState.LEAD_WAIT_INTEREST,
      ConversationState.LEAD_WAIT_REJECTION_REASON,
      ConversationState.LEAD_REGISTER_NAME,
      ConversationState.LEAD_REGISTER_EMAIL,
      ConversationState.LEAD_TERMS_CONSENT,
    ];

    return v2States.includes(state as ConversationState);
  }

  private getLeadExperienceListSections(): Array<{
    title: string;
    rows: Array<{ id: string; title: string; description: string }>;
  }> {
    return [
      {
        title: 'Nivel de Experiencia',
        rows: [
          {
            id: 'exp_none',
            title: 'Sin experiencia',
            description: 'Recien graduado o sin experiencia laboral',
          },
          {
            id: 'exp_junior',
            title: 'Junior (1-2 anos)',
            description: 'Experiencia inicial en el campo',
          },
          {
            id: 'exp_mid',
            title: 'Intermedio (3-5 anos)',
            description: 'Experiencia solida',
          },
          {
            id: 'exp_senior',
            title: 'Senior (5+ anos)',
            description: 'Experto en el area',
          },
          {
            id: 'exp_lead',
            title: 'Lead/Expert (7+ anos)',
            description: 'Liderazgo y expertise avanzado',
          },
        ],
      },
    ];
  }

  private async routeLeadToNextMissingField(userId: string): Promise<BotReply> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true, location: true, experienceLevel: true },
    });

    if (!profile?.role) {
      await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
      return { text: BotMessages.V2_WELCOME_ROLE };
    }

    if (!profile.location) {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_LOCATION);
      return { text: BotMessages.V2_ASK_LOCATION };
    }

    if (!profile.experienceLevel) {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_EXPERIENCE);
      return {
        text: BotMessages.V2_ASK_EXPERIENCE,
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    return await this.handleLeadShowFirstVacancyState(userId);
  }

  private normalizeExtractedExperienceLevel(level: string | null | undefined): string | null {
    if (!level) return null;

    const normalized = level.toLowerCase().trim();
    const allowed = ['none', 'junior', 'mid', 'senior', 'lead'];
    if (allowed.includes(normalized)) {
      return normalized;
    }

    return null;
  }

  private mapYearsToExperienceLevel(years: number | null | undefined): string | null {
    if (typeof years !== 'number' || Number.isNaN(years)) return null;
    if (years <= 0) return 'none';
    if (years <= 2) return 'junior';
    if (years <= 5) return 'mid';
    if (years <= 6) return 'senior';
    return 'lead';
  }

  private extractMultipleLocationChoices(text: string): string[] {
    return extractNormalizedLocations(text).slice(0, 5);
  }

  private buildSingleLocationChoiceMessage(choices: string[]): string {
    if (choices.length === 0) {
      return `Escribe solo una ubicaci\u00f3n por b\u00fasqueda.`;
    }

    const options = choices.map((choice) => `- ${choice}`).join('\n');
    return `Veo que escribiste varias ubicaciones. Para continuar, elige solo una:\n\n${options}\n\nEscr\u00edbela de nuevo exactamente como la prefieres.`;
  }

  private async inferLeadSignals(text: string): Promise<{
    role: string | null;
    location: string | null;
    modality: 'remote' | 'hybrid' | 'onsite' | null;
    experienceLevel: string | null;
    confidence: number;
  }> {
    const extracted = await this.llmService.extractInitialProfileFromFreeText(text);
    if (!extracted) {
      return {
        role: null,
        location: null,
        modality: null,
        experienceLevel: null,
        confidence: 0,
      };
    }

    return {
      role: extracted.role?.trim() || null,
      location: extracted.location?.trim() || null,
      modality: extracted.modality,
      experienceLevel:
        this.normalizeExtractedExperienceLevel(extracted.experienceLevel)
        || this.mapYearsToExperienceLevel(extracted.experienceYears),
      confidence: typeof extracted.confidence === 'number' ? extracted.confidence : 0,
    };
  }

  private async handleLeadCollectProfileState(userId: string, text: string): Promise<BotReply> {
    const minConfidence = 0.55;
    const profileUpdates: Record<string, string> = {};

    const inferred = await this.inferLeadSignals(text);
    const multipleLocationChoices = this.extractMultipleLocationChoices(text);
    const normalizedText = text.toLowerCase().trim();
    const remotePatterns = ['remoto', 'remote', 'trabajo remoto', 'home office', 'teletrabajo'];
    const isRemoteIntent = remotePatterns.some((pattern) => normalizedText.includes(pattern));
    const remoteRequested = inferred.modality === 'remote' || isRemoteIntent;

    if (inferred.experienceLevel && inferred.confidence >= minConfidence) {
      profileUpdates.experienceLevel = inferred.experienceLevel;
    } else {
      const regexExperience = normalizeExperienceLevel(text);
      if (regexExperience) {
        profileUpdates.experienceLevel = regexExperience;
      }
    }

    if (multipleLocationChoices.length > 1) {
      // Hay varias ubicaciones en el mismo mensaje: no fijar location aun.
    } else if (remoteRequested) {
      profileUpdates.location = 'Remoto';
    } else if (inferred.location && inferred.confidence >= minConfidence) {
      const locationValidation = validateAndNormalizeLocation(inferred.location);
      if (locationValidation.isValid && locationValidation.location) {
        profileUpdates.location = locationValidation.location;
      } else {
        const aiLocation = await this.llmService.validateAndCorrectLocation(inferred.location);
        if (aiLocation?.isValid && aiLocation.location) {
          profileUpdates.location = aiLocation.location;
        }
      }
    }

    let roleCandidate: string | null = null;
    let roleWarning: string | null = null;

    const roleAiFromText = await this.llmService.validateAndCorrectRole(text);
    if (roleAiFromText) {
      if (roleAiFromText.isValid && roleAiFromText.role) {
        roleCandidate = roleAiFromText.role;
      } else {
        roleWarning = roleAiFromText.warning || roleAiFromText.suggestion || null;
      }
    }

    if (!roleCandidate) {
      if (inferred.role && inferred.confidence >= minConfidence) {
        roleCandidate = inferred.role;
      } else {
        roleCandidate = normalizeRole(text);
      }

      if (roleCandidate) {
        const roleAi = await this.llmService.validateAndCorrectRole(roleCandidate);
        if (roleAi) {
          if (roleAi.isValid && roleAi.role) {
            roleCandidate = roleAi.role;
          } else {
            roleWarning = roleAi.warning || roleAi.suggestion || null;
            roleCandidate = null;
          }
        }
      }
    }

    if (roleCandidate && remoteRequested && !/\b(remoto|remote)\b/i.test(roleCandidate)) {
      roleCandidate = `${roleCandidate} remoto`;
    }

    if (roleCandidate) {
      profileUpdates.role = roleCandidate;
    }

    if (Object.keys(profileUpdates).length > 0) {
      await this.updateUserProfile(userId, profileUpdates);
    }

    if (!roleCandidate) {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { location: true, experienceLevel: true },
      });

      const hasHints = Boolean(
        profileUpdates.location
        || profileUpdates.experienceLevel
        || profile?.location
        || profile?.experienceLevel,
      );

      if (hasHints) {
        return {
          text: `Perfecto, ya tome parte de tu info. Ahora dime *solo el cargo o rol* que estas buscando.`,
        };
      }

      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.LEAD_COLLECT_PROFILE,
      );
      return {
        text:
          roleWarning
          || this.normalizeConversationalMessage(conversational)
          || BotMessages.ERROR_ROLE_INVALID,
      };
    }

    if (multipleLocationChoices.length > 1) {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_LOCATION);
      return {
        text: this.buildSingleLocationChoiceMessage(multipleLocationChoices),
      };
    }

    return await this.routeLeadToNextMissingField(userId);
  }

  private async handleLeadAskLocationState(userId: string, text: string): Promise<BotReply> {
    const minConfidence = 0.55;
    const inferred = await this.inferLeadSignals(text);
    const multipleLocationChoices = this.extractMultipleLocationChoices(text);
    const validation = validateAndNormalizeLocation(text);
    const resolvedMultipleChoices =
      multipleLocationChoices.length > 1
        ? multipleLocationChoices
        : validation.errorType === 'multiple' && validation.options
          ? validation.options
          : [];
    const normalizedText = text.toLowerCase().trim();
    const remotePatterns = ['remoto', 'remote', 'trabajo remoto', 'home office', 'teletrabajo'];
    const isRemoteIntent = remotePatterns.some((pattern) => normalizedText.includes(pattern));
    const remoteRequested = inferred.modality === 'remote' || isRemoteIntent;

    if (resolvedMultipleChoices.length > 1) {
      return {
        text: this.buildSingleLocationChoiceMessage(resolvedMultipleChoices),
      };
    }

    let finalLocation: string | null = null;
    if (remoteRequested) {
      finalLocation = 'Remoto';
    } else {
      const preferredLocationInput =
        inferred.location && inferred.confidence >= minConfidence ? inferred.location : text;

      const aiResult = await this.llmService.validateAndCorrectLocation(preferredLocationInput);
      if (aiResult?.isValid && aiResult.location) {
        finalLocation = aiResult.location;
      } else if (validation.isValid && validation.location) {
        finalLocation = validation.location;
      }
    }

    if (!finalLocation) {
      if (validation.errorType === 'too_vague') {
        return { text: this.getTooVagueLocationMessage(text) };
      }
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    const profileUpdates: Record<string, string> = { location: finalLocation };

    if (inferred.experienceLevel && inferred.confidence >= minConfidence) {
      profileUpdates.experienceLevel = inferred.experienceLevel;
    }

    if (Object.keys(profileUpdates).length > 0) {
      await this.updateUserProfile(userId, profileUpdates);
    }

    return await this.routeLeadToNextMissingField(userId);
  }

  private async handleLeadAskExperienceState(userId: string, text: string): Promise<BotReply> {
    let experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      const inferred = await this.inferLeadSignals(text);
      if (inferred.experienceLevel) {
        experienceLevel = inferred.experienceLevel as any;
      }
    }

    if (!experienceLevel) {
      return {
        text: BotMessages.ERROR_EXPERIENCE_INVALID,
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    await this.updateUserProfile(userId, { experienceLevel });
    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    return await this.handleLeadShowFirstVacancyState(userId);
  }

  private buildLeadVacancyMessage(job: any): string {
    const company = job?.company || 'una empresa';
    const title = job?.title || 'un cargo';
    const location = job?.locationRaw || 'una ubicacion sin especificar';
    const source = job?.source || 'un portal de empleo';
    const cleanUrl = this.jobSearchService.cleanJobUrl(job?.url || '');

    let snippet = (job?.snippet || '').trim();
    if (snippet.length > 220) {
      snippet = `${snippet.slice(0, 217)}...`;
    }

    const summary = snippet || 'Esta vacante puede encajar con tu perfil.';

    return `Hola, te cuento que ${company} esta buscando ${title} en ${location}.\n\nPosteada por ${source}\n\n${summary}\n\n${cleanUrl}`;
  }

  private async handleLeadShowFirstVacancyState(userId: string): Promise<BotReply> {
    try {
      const result = await this.jobSearchService.searchJobsForUser(userId, 1);
      const firstJob = result.jobs[0];

      if (!firstJob) {
        const profile = await this.prisma.userProfile.findUnique({
          where: { userId },
          select: { role: true },
        });

        const role = profile?.role || 'tu perfil';
        const suggestions = await this.llmService.suggestRelatedRoles(role);
        const suggestionsText = suggestions.length > 0
          ? `\n\nPuedes probar con: ${suggestions.slice(0, 3).join(', ')}.`
          : '';

        await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);

        return {
          text: `No encontre ofertas para "${role}" en este momento.${suggestionsText}\n\nEscribeme otro rol para intentarlo de nuevo.`,
        };
      }

      await this.jobSearchService.markJobsAsSent(userId, [firstJob]);
      await this.updateSessionData(userId, {
        leadCurrentVacancy: {
          title: firstJob.title,
          company: firstJob.company,
          locationRaw: firstJob.locationRaw,
          url: firstJob.url,
          source: firstJob.source,
        },
      });
      await this.updateSessionState(userId, ConversationState.LEAD_WAIT_INTEREST);

      return {
        text: this.buildLeadVacancyMessage(firstJob),
        buttons: [
          { id: 'lead_interest_yes', title: 'Si, me intereso' },
          { id: 'lead_interest_no', title: 'No me intereso' },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error mostrando primera vacante V2 para ${userId}: ${errorMessage}`);
      return {
        text: `No pude buscar una vacante en este momento. Intenta de nuevo en unos minutos.`,
      };
    }
  }

  private resolveLeadRejectionReason(text: string): 'role' | 'location' | 'company' | 'salary' | 'remote' | 'other' {
    const normalized = text.toLowerCase();

    if (normalized.includes('cargo') || normalized.includes('rol') || normalized.includes('puesto')) return 'role';
    if (normalized.includes('ciudad') || normalized.includes('ubicacion') || normalized.includes('ubicaciÃ³n')) return 'location';
    if (normalized.includes('empresa')) return 'company';
    if (normalized.includes('salario') || normalized.includes('sueldo')) return 'salary';
    if (normalized.includes('remoto') || normalized.includes('remote') || normalized.includes('casa')) return 'remote';

    return 'other';
  }

  private async handleLeadWaitInterestState(
    userId: string,
    text: string,
    _intent: UserIntent,
  ): Promise<BotReply> {
    if (isAcceptance(text)) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      if (user?.name && user?.email) {
        const onboardingFlags = await this.getOnboardingFlags(userId);
        await this.activateFreemiumTrialFromLead(userId, onboardingFlags.defaultOnboardingAlertTime);
        await this.updateSessionState(userId, ConversationState.READY);

        return await this.returnToMainMenu(
          userId,
          `Perfecto, seguimos con tu busqueda y ya puedes explorar mas ofertas.`,
        );
      }

      await this.updateSessionState(userId, ConversationState.LEAD_REGISTER_NAME);
      return { text: BotMessages.V2_REGISTER_NAME };
    }

    if (isRejection(text)) {
      await this.updateSessionState(userId, ConversationState.LEAD_WAIT_REJECTION_REASON);
      return {
        text: BotMessages.V2_REJECTION_REASON,
        listTitle: 'Elegir motivo',
        listSections: [
          {
            title: 'Motivo principal',
            rows: [
              { id: 'reason_role', title: 'No me gusto el cargo' },
              { id: 'reason_location', title: 'No me gusto la ciudad' },
              { id: 'reason_company', title: 'No me gusto la empresa' },
              { id: 'reason_salary', title: 'No me gusto el salario' },
              { id: 'reason_remote', title: 'Busco algo remoto' },
              { id: 'reason_other', title: 'Otro motivo' },
            ],
          },
        ],
      };
    }

    return {
      text: `Para seguir, elige una opcion:`,
      buttons: [
        { id: 'lead_interest_yes', title: 'Si, me intereso' },
        { id: 'lead_interest_no', title: 'No me intereso' },
      ],
    };
  }

  private async handleLeadWaitRejectionReasonState(userId: string, text: string): Promise<BotReply> {
    const reason = this.resolveLeadRejectionReason(text);
    await this.updateSessionData(userId, { leadLastRejectionReason: reason });

    if (reason === 'role') {
      await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
      return { text: `Entendido. Dime el rol que quieres priorizar y ajusto la busqueda.` };
    }

    if (reason === 'location') {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_LOCATION);
      return { text: BotMessages.V2_ASK_LOCATION };
    }

    if (reason === 'remote') {
      await this.updateUserProfile(userId, { location: 'Remoto' });
    }

    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    const nextVacancyReply = await this.handleLeadShowFirstVacancyState(userId);
    return {
      ...nextVacancyReply,
      text: `Gracias, sigo ajustando la busqueda segun tu perfil.\n\n${nextVacancyReply.text}`,
    };
  }

  private async handleLeadRegisterNameState(userId: string, text: string): Promise<BotReply> {
    const name = text.trim();

    if (name.length < 2 || name.length > 50 || !/[a-zA-Z]/.test(name)) {
      return {
        text: `Por favor escribe tu nombre completo (entre 2 y 50 caracteres).`,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { name },
    });

    await this.updateSessionState(userId, ConversationState.LEAD_REGISTER_EMAIL);
    return { text: BotMessages.V2_REGISTER_EMAIL(getFirstName(name)) };
  }

  private async handleLeadRegisterEmailState(userId: string, text: string): Promise<BotReply> {
    const email = text.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return {
        text: `Ese correo no parece valido. Escribelo de nuevo, por favor.`,
      };
    }

    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (existingByEmail) {
      return {
        text: `Ese correo ya esta en uso con otro numero. Escribe un correo diferente.`,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });

    await this.updateSessionState(userId, ConversationState.LEAD_TERMS_CONSENT);

    return {
      text: BotMessages.V2_TERMS_CONSENT,
      buttons: [
        { id: 'lead_terms_accept', title: 'Acepto' },
        { id: 'lead_terms_reject', title: 'No acepto' },
      ],
    };
  }

  private async activateFreemiumTrialFromLead(
    userId: string,
    defaultAlertTime: string,
  ): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 5,
          freemiumStartDate: new Date(),
          freemiumExpired: false,
          status: 'ACTIVE',
        },
      });
    }

    const alertPreference = await this.prisma.alertPreference.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!alertPreference) {
      await this.upsertAlertPreference(userId, defaultAlertTime, 'daily');
    }
  }

  private async handleLeadTermsConsentState(
    userId: string,
    text: string,
    _intent: UserIntent,
  ): Promise<BotReply> {
    if (isAcceptance(text)) {
      const onboardingFlags = await this.getOnboardingFlags(userId);
      await this.activateFreemiumTrialFromLead(userId, onboardingFlags.defaultOnboardingAlertTime);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      await this.sendOnboardingEmailSafely(userId, user?.email || null, user?.name || null);
      await this.updateSessionState(userId, ConversationState.READY);

      return await this.returnToMainMenu(
        userId,
        `Listo. Active tu prueba gratuita por 7 dias.`,
      );
    }

    if (isRejection(text)) {
      await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
      const nextVacancyReply = await this.handleLeadShowFirstVacancyState(userId);
      return {
        ...nextVacancyReply,
        text: `${BotMessages.V2_TERMS_REJECTED}\n\n${nextVacancyReply.text}`,
      };
    }

    return {
      text: BotMessages.V2_TERMS_CONSENT,
      buttons: [
        { id: 'lead_terms_accept', title: 'Acepto' },
        { id: 'lead_terms_reject', title: 'No acepto' },
      ],
    };
  }

  // ========================================
  // ESTADOS DE REGISTRO IN-BOT
  // ========================================

  /**
   * Estado WA_ASK_NAME: Usuario no registrado, pidiendo nombre
   */
  private async handleWaAskNameState(userId: string, text: string): Promise<BotReply> {
    const name = text.trim();

    // Validar nombre: mÃ­nimo 2 caracteres, mÃ¡ximo 50, solo letras y espacios
    if (name.length < 2 || name.length > 50) {
      return {
        text: 'Por favor, escribe tu *nombre completo* (entre 2 y 50 caracteres).\n\nðŸ“ Ejemplo: Juan PÃ©rez',
      };
    }

    // Validar que contenga al menos letras
    if (!/[a-zÃ¡Ã©Ã­Ã³ÃºÃ±]/i.test(name)) {
      return {
        text: 'Hmm, eso no parece un nombre vÃ¡lido. ðŸ¤”\n\nPor favor, escribe tu *nombre completo*:',
      };
    }

    // Guardar nombre en la DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: name },
    });

    this.logger.log(`ðŸ“ Nombre guardado para usuario ${userId}: "${name}"`);

    // TransiciÃ³n a WA_ASK_EMAIL
    await this.updateSessionState(userId, ConversationState.WA_ASK_EMAIL);

    return { text: BotMessages.WA_ASK_EMAIL(getFirstName(name)) };
  }

  /**
   * Estado WA_ASK_EMAIL: Usuario proporcionÃ³ nombre, pidiendo email
   */
  private async handleWaAskEmailState(userId: string, text: string): Promise<BotReply> {
    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        text: 'Ese no parece un correo vÃ¡lido. ðŸ¤”\n\nPor favor, escribe tu *correo electrÃ³nico*:\n\nðŸ“§ Ejemplo: tu.correo@ejemplo.com',
      };
    }

    // Verificar si el email ya estÃ¡ registrado por otro usuario
    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email: email,
        NOT: { id: userId },
      },
    });

    if (existingByEmail) {
      return {
        text: 'Este correo ya estÃ¡ registrado con otro nÃºmero. ðŸ˜•\n\nPor favor, usa un *correo diferente*:',
      };
    }

    // Guardar email
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: email },
    });

    // Crear suscripciÃ³n FREEMIUM
    const existingSub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!existingSub) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 5,
          freemiumStartDate: new Date(),
          freemiumExpired: false,
          status: 'ACTIVE',
        },
      });
    }

    // Obtener nombre para el mensaje
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    this.logger.log(`âœ… Registro in-bot completado para usuario ${userId}: ${user?.name} (${email})`);
    await this.sendOnboardingEmailSafely(userId, email, user?.name || null);

    // TransiciÃ³n a NEW para iniciar onboarding normal
    await this.updateSessionState(userId, ConversationState.NEW);

    // Retornar mensaje de registro completo + proceder con onboarding
    const registrationMsg = BotMessages.WA_REGISTRATION_COMPLETE(getFirstName(user?.name));
    const onboardingReply = await this.handleNewState(userId);

    return {
      text: `${registrationMsg}\n\n${onboardingReply.text}`,
      buttons: onboardingReply.buttons,
      listTitle: onboardingReply.listTitle,
      listSections: onboardingReply.listSections,
    };
  }

  /**
   * Estado NEW: Usuario registrado que inicia el onboarding
   * NOTA: Solo llegan aquÃ­ usuarios ya registrados desde la landing
   * ACTUALIZADO: Ya no se pregunta por dispositivo, siempre se usan botones interactivos
   */
  private async handleNewState(userId: string): Promise<BotReply> {
    this.logger.log(`ðŸ‘¤ Procesando estado NEW para usuario: ${userId}`);

    // Obtener usuario con su suscripciÃ³n
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    // CASO 1: Usuario pagado activo (PREMIUM o PRO)
    if ((user?.subscription?.plan === 'PREMIUM' || user?.subscription?.plan === 'PRO') && user?.subscription?.status === 'ACTIVE') {
      this.logger.log(`ðŸ‘‘ Usuario pagado ${userId}`);
      await this.updateSessionState(userId, ConversationState.ASK_TERMS);
      return {
        text: BotMessages.WELCOME_BACK_PREMIUM(getFirstName(user.name)),
        buttons: [
          { id: 'continue', title: 'Â¡A buscar empleo!' },
        ],
      };
    }

    // CASO 2: Usuario con freemium expirado
    if (user?.subscription?.freemiumExpired) {
      this.logger.log(`â° Usuario ${userId} con freemium expirado`);
      await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);
      return {
        text: BotMessages.FREEMIUM_EXPIRED_RETURNING_USER(getFirstName(user?.name)),
        buttons: [
          { id: 'cmd_pagar', title: 'Quiero pagar' },
          { id: 'cmd_ofertas', title: 'Ver ofertas gratis' },
        ],
      };
    }

    // CASO 3: Usuario sin suscripciÃ³n â†’ crear freemium
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

    const onboardingFlags = await this.getOnboardingFlags(userId);
    if (onboardingFlags.flowVariant === this.v2FlowVariant) {
      this.logger.log(`Usuario ${userId} onboarding freemium_v2`);
      await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
      return { text: BotMessages.V2_WELCOME_ROLE };
    }

    // CASO 4: Usuario freemium activo â†’ dar bienvenida con botÃ³n Continuar
    this.logger.log(`ðŸ†• Usuario ${userId} iniciando onboarding`);
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    return {
      text: BotMessages.WELCOME_REGISTERED(getFirstName(user?.name)),
      buttons: [
        { id: 'continue', title: 'Â¡A buscar empleo!' },
      ],
    };
  }

  // [ELIMINADO] Estado ASK_DEVICE - Ya no se pregunta por dispositivo
  // Todos los usuarios ahora reciben botones interactivos automÃ¡ticamente
  // private async handleAskDeviceState(userId: string, text: string): Promise<BotReply> { ... }

  /**
   * Estado ASK_TERMS: Esperando que el usuario presione Continuar
   * ACTUALIZADO: Ya no pide aceptar tÃ©rminos, solo un botÃ³n para continuar
   */
  private async handleAskTermsState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Cualquier interacciÃ³n (botÃ³n o texto) avanza al siguiente paso
    if (isAcceptance(text) || intent === UserIntent.ACCEPT || text.toLowerCase().includes('continu')) {
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.ASK_ROLE };
    }

    // Si el usuario escribe cualquier cosa, tambiÃ©n continuar
    await this.updateSessionState(userId, ConversationState.ASK_ROLE);
    return { text: BotMessages.ASK_ROLE };
  }

  /**
   * Estado ASK_ROLE: Esperando rol/cargo
   * ACTUALIZADO: Siempre muestra lista interactiva
   */
  private async handleAskRoleState(userId: string, text: string): Promise<BotReply> {
    // Paso 1: Intentar con regex (gratis)
    let role = normalizeRole(text);

    // Paso 2: Si regex falla, pedir ayuda al LLM
    if (!role) {
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        // Si la IA detectÃ³ un problema especÃ­fico (genÃ©rico, mÃºltiples roles, etc.), mostrar su mensaje
        if (!aiResult.isValid) {
          return { text: aiResult.warning || aiResult.suggestion || BotMessages.ERROR_ROLE_INVALID };
        }
        role = aiResult.role;
      }
    } else {
      // Regex dio resultado â€” validar con IA para posibles mejoras (typos, genÃ©rico)
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        if (!aiResult.isValid && aiResult.warning) {
          return { text: aiResult.warning };
        }
        if (!aiResult.isValid && aiResult.suggestion) {
          return { text: aiResult.suggestion };
        }
        // Si la IA corrigiÃ³/mejorÃ³ el rol, usar la versiÃ³n de la IA
        if (aiResult.isValid && aiResult.role) {
          role = aiResult.role;
        }
      }
    }

    if (!role) {
      // Intentar respuesta conversacional Ãºnica
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.ASK_ROLE);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_ROLE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { role });

    // TransiciÃ³n: ASK_ROLE â†’ ASK_EXPERIENCE (ASK_REMOTE eliminado del flujo)
    await this.updateSessionState(userId, ConversationState.ASK_EXPERIENCE);

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
              description: 'ReciÃ©n graduado o sin experiencia laboral',
            },
            {
              id: 'exp_junior',
              title: 'Junior (1-2 aÃ±os)',
              description: 'Experiencia inicial en el campo',
            },
            {
              id: 'exp_mid',
              title: 'Intermedio (3-5 aÃ±os)',
              description: 'Experiencia sÃ³lida',
            },
            {
              id: 'exp_senior',
              title: 'Senior (5+ aÃ±os)',
              description: 'Experto en el Ã¡rea',
            },
            {
              id: 'exp_lead',
              title: 'Lead/Expert (7+ aÃ±os)',
              description: 'Liderazgo y expertise avanzado',
            },
          ],
        },
      ],
    };
  }

  // [DESACTIVADO] Pregunta de remoto eliminada del flujo de onboarding
  // /**
  //  * Estado ASK_REMOTE: Pregunta rÃ¡pida si quiere remoto
  //  * Si dice SÃ­ â†’ agrega "remoto" al rol para la bÃºsqueda
  //  * Si dice No â†’ mantiene el rol tal cual
  //  * Luego transiciona a ASK_EXPERIENCE
  //  */
  // private async handleAskRemoteState(userId: string, text: string): Promise<BotReply> {
  /*
    const normalizedText = text.trim().toLowerCase();
    const isYes = ['sÃ­', 'si', 'yes', 'remote_yes'].includes(normalizedText);
    const isNo = ['no', 'remote_no'].includes(normalizedText);

    if (!isYes && !isNo) {
      return {
        text: `Solo necesito saber: Â¿te interesa trabajar *remoto*? ðŸ `,
        buttons: [
          { id: 'remote_yes', title: 'SÃ­' },
          { id: 'remote_no', title: 'No' },
        ],
      };
    }

    if (isYes) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      const currentRole = user?.profile?.role;
      if (currentRole && !currentRole.toLowerCase().includes('remoto')) {
        await this.updateUserProfile(userId, { role: `${currentRole} remoto` });
        this.logger.log(`ðŸ  Rol actualizado con remoto: "${currentRole}" â†’ "${currentRole} remoto"`);
      }
    }

    await this.updateSessionState(userId, ConversationState.ASK_EXPERIENCE);

    return {
      text: BotMessages.ASK_EXPERIENCE,
      listTitle: 'Seleccionar nivel',
      listSections: [
        {
          title: 'Nivel de Experiencia',
          rows: [
            { id: 'exp_none', title: 'Sin experiencia', description: 'ReciÃ©n graduado o sin experiencia laboral' },
            { id: 'exp_junior', title: 'Junior (1-2 aÃ±os)', description: 'Experiencia inicial en el campo' },
            { id: 'exp_mid', title: 'Intermedio (3-5 aÃ±os)', description: 'Experiencia sÃ³lida' },
            { id: 'exp_senior', title: 'Senior (5+ aÃ±os)', description: 'Experto en el Ã¡rea' },
            { id: 'exp_lead', title: 'Lead/Expert (7+ aÃ±os)', description: 'Liderazgo y expertise avanzado' },
          ],
        },
      ],
    };
  }
  */

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
                description: 'ReciÃ©n graduado o sin experiencia laboral',
              },
              {
                id: 'exp_junior',
                title: 'Junior (1-2 aÃ±os)',
                description: 'Experiencia inicial en el campo',
              },
              {
                id: 'exp_mid',
                title: 'Intermedio (3-5 aÃ±os)',
                description: 'Experiencia sÃ³lida',
              },
              {
                id: 'exp_senior',
                title: 'Senior (5+ aÃ±os)',
                description: 'Experto en el Ã¡rea',
              },
              {
                id: 'exp_lead',
                title: 'Lead/Expert (7+ aÃ±os)',
                description: 'Liderazgo y expertise avanzado',
              },
            ],
          },
        ],
      };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { experienceLevel });

    // TransiciÃ³n: ASK_EXPERIENCE â†’ ASK_LOCATION
    await this.updateSessionState(userId, ConversationState.ASK_LOCATION);

    return { text: BotMessages.ASK_LOCATION };
  }

  /**
   * Estado ASK_LOCATION: Esperando ciudad/ubicaciÃ³n
   * ACTUALIZADO: Para usuarios nuevos, omite preguntas de alertas y configura 07:00 por defecto.
   * Para usuarios existentes, mantiene flujo anterior de OFFER_ALERTS.
   */
  private async handleAskLocationState(userId: string, text: string): Promise<BotReply> {
    const multipleLocationChoices = this.extractMultipleLocationChoices(text);
    const validation = validateAndNormalizeLocation(text);
    const resolvedMultipleChoices =
      multipleLocationChoices.length > 1
        ? multipleLocationChoices
        : validation.errorType === 'multiple' && validation.options
          ? validation.options
          : [];
    if (resolvedMultipleChoices.length > 1) {
      return {
        text: this.buildSingleLocationChoiceMessage(resolvedMultipleChoices),
      };
    }

    const normalizedText = text.toLowerCase().trim();
    const remotePatterns = ['remoto', 'remote', 'trabajo remoto', 'home office', 'teletrabajo'];
    const isRemoteIntent = remotePatterns.some((pattern) => normalizedText.includes(pattern));

    let finalLocation: string | null = null;

    // Siempre pasar por IA primero para ubicaciï¿½n.
    const aiResult = await this.llmService.validateAndCorrectLocation(text);
    if (aiResult) {
      if (!aiResult.isValid) {
        return {
          text: aiResult.suggestion
            || (isRemoteIntent ? BotMessages.ERROR_LOCATION_REMOTE_INVALID : BotMessages.ERROR_LOCATION_INVALID),
        };
      }
      finalLocation = aiResult.location;
    } else if (validation.isValid && validation.location) {
      // LLM no disponible: fallback local.
      finalLocation = validation.location;
    } else {
      if (isRemoteIntent) {
        return { text: BotMessages.ERROR_LOCATION_REMOTE_INVALID };
      }
      if (validation.errorType === 'too_vague') {
        return { text: this.getTooVagueLocationMessage(text) };
      }
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    if (!finalLocation) {
      // Intentar respuesta conversacional ï¿½nica
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.ASK_LOCATION);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, { location: finalLocation });

    const onboardingFlags = await this.getOnboardingFlags(userId);
    if (onboardingFlags.skipAlertConfigOnboarding) {
      // [PAUSADO] Flujo de preguntas de alertas para nuevos registros.
      // Se configura por defecto y se pasa directo a READY.
      this.logger.log(
        `Onboarding sin preguntas de alertas para ${userId}. Hora por defecto: ${onboardingFlags.defaultOnboardingAlertTime}`,
      );
      await this.upsertAlertPreference(userId, onboardingFlags.defaultOnboardingAlertTime, 'daily');
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.NOT_READY_YET);
    }

    // [LEGACY] Se mantiene para usuarios ya registrados (sin cambios).
    // [ACTUALIZADO] Flujo: ASK_LOCATION ? OFFER_ALERTS (preguntar si quiere alertas antes de buscar)
    await this.updateSessionState(userId, ConversationState.OFFER_ALERTS);

    // Preguntar si desea recibir alertas con botones interactivos (sin emojis)
    return {
      text: BotMessages.OFFER_ALERTS,
      buttons: [
        { id: 'alerts_yes', title: 'SÃ­, activar' },
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
  //               { id: 'work_remoto', title: 'ðŸ  Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: 'ðŸ¢ Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: 'ðŸ”„ HÃ­brido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: 'âœ¨ Sin preferencia', description: 'Cualquier modalidad' },
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
  //             { id: 'internship', title: 'PasantÃ­a', description: 'PrÃ¡cticas profesionales' },
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
              { id: 'freq_daily', title: 'â˜€ï¸ Diariamente' },
              { id: 'freq_every_3_days', title: 'ðŸ“… Cada 3 dÃ­as' },
              { id: 'freq_weekly', title: 'ðŸ“† Semanalmente' },
              { id: 'freq_monthly', title: 'ðŸ—“ï¸ Mensualmente' },
            ],
          },
        ],
      };
    }

    // Guardar temporalmente en session.data (lo guardamos definitivamente cuando guarde la hora)
    await this.updateSessionData(userId, { alertFrequency: frequency });

    // TransiciÃ³n: ASK_ALERT_FREQUENCY â†’ ASK_ALERT_TIME
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
   * ACTUALIZADO: Siempre muestra lista interactiva para el menÃº
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

    // TransiciÃ³n: ASK_ALERT_TIME â†’ READY
    await this.updateSessionState(userId, ConversationState.READY);

    const confirmationMessage = `Â¡Listo! âœ…
Alertas activadas ðŸ”” a las ${alertTime}

Cuando te llegue la notificaciÃ³n, toca *â€œBuscar empleosâ€* para ver las ofertas.

â„¹ï¸ Ten en cuenta:

ðŸ“Œ Cada vez que le des clic en â€œBuscar empleosâ€ consumes 1 BÃºsqueda.

Actualmente tienes el Plan Free: 5 bÃºsquedas por una semana.

Â¿QuÃ© quieres hacer ahora?`;

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
              title: 'ðŸ” Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'âœï¸ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'ðŸ”„ Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'âŒ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado READY: Usuario completÃ³ onboarding
   * ACTUALIZADO: Siempre usa botones/listas interactivas
   */
  private async handleReadyState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Detectar intenciÃ³n de reiniciar perfil
    if (isRestartIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_RESTART);
      return {
        text: BotMessages.CONFIRM_RESTART,
        buttons: [
          { id: 'confirm_restart', title: 'SÃ­, reiniciar' },
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Detectar intenciÃ³n de cancelar servicio
    if (isCancelServiceIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_CANCEL_SERVICE);
      return {
        text: BotMessages.CONFIRM_CANCEL_SERVICE,
        buttons: [
          { id: 'confirm_cancel', title: 'SÃ­, confirmar' },
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Detectar intenciÃ³n de editar/cambiar preferencias
    if (this.shouldRedirectToEditFlow(text, intent)) {
      return await this.redirectReadyUserToEditFlow(userId);
    }

    // Detectar intenciÃ³n de buscar empleos
    if (intent === UserIntent.SEARCH_NOW) {
      // PRIMERO: Verificar si hay alertas pendientes de un template notification
      const pendingAlert = await this.getLatestNonStalePendingAlert(userId);

      if (pendingAlert) {
        // Hay ofertas pendientes del template â†’ enviarlas
        this.logger.log(`ðŸ“¬ Usuario ${userId} tiene ${pendingAlert.jobCount} ofertas pendientes`);

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
            `ðŸ¢ ${job.company || 'Empresa confidencial'}\n` +
            `ðŸ“ ${job.locationRaw || 'Sin ubicaciÃ³n'}\n` +
            `ðŸ”— ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas (evitar duplicados en futuras bÃºsquedas)
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        return {
          text: `ðŸŽ¯ *Â¡AquÃ­ estÃ¡n tus ofertas de empleo!*\n\n${formattedJobs}\n\nðŸ’¡ _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }

      // No hay alertas pendientes â†’ hacer bÃºsqueda normal
      // Verificar usos disponibles ANTES de buscar (sin descontar)
      const usageCheck = await this.checkUsageAvailable(userId);

      if (!usageCheck.allowed) {
        // Verificar si es usuario premium sin bÃºsquedas semanales
        const subscription = await this.prisma.subscription.findUnique({
          where: { userId },
        });

        if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
          // Usuario pagado que alcanzÃ³ lÃ­mite semanal: NO cambiar estado
          this.logger.log(`â³ Usuario pagado ${userId} alcanzÃ³ lÃ­mite semanal, mostrando mensaje de espera`);
          return { text: usageCheck.message || 'Has alcanzado tu lÃ­mite semanal de bÃºsquedas.' };
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

      // Ejecutar bÃºsqueda con el usesLeft actualizado
      const searchResult = await this.performJobSearch(userId, deduction.usesLeft);

      // Si hubo error en la bÃºsqueda, el uso ya fue descontado (comportamiento esperado)
      const isError = searchResult.text?.includes('Lo siento, no pude buscar ofertas');
      if (isError) {
        this.logger.log(`âš ï¸ BÃºsqueda fallÃ³ para usuario ${userId}, pero el uso ya fue descontado`);
      }

      return searchResult;
    }

    // Siempre mostrar menÃº de comandos con lista interactiva
    return {
      text: 'Â¿QuÃ© te gustarÃ­a hacer?',
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: 'ðŸ” Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'âœï¸ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'ðŸ”„ Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'âŒ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Ejecuta bÃºsqueda de empleos y devuelve resultados formateados
   */
  private async performJobSearch(userId: string, usesLeftAfterDeduction?: number): Promise<BotReply> {
    try {
      this.logger.log(`ðŸ” Usuario ${userId} solicitÃ³ bÃºsqueda de empleos`);

      // Determinar maxResults segÃºn el plan (3 para FREE, 5 para PREMIUM/PRO)
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      const maxResults = (subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') ? 5 : 3;

      // Ejecutar bÃºsqueda
      const result = await this.jobSearchService.searchJobsForUser(userId, maxResults);

      // Si no hay ofertas â€” sugerir roles alternativos con IA
      if (result.jobs.length === 0) {
        // Obtener perfil para el rol actual
        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const currentRole = profile?.role || 'tu perfil';

        // Pedir sugerencias al LLM
        const suggestions = await this.llmService.suggestRelatedRoles(currentRole);
        const suggestionsText = suggestions.length > 0
          ? `\n\nðŸ’¡ *Roles relacionados que podrÃ­as probar:*\n${suggestions.map(s => `â€¢ ${s}`).join('\n')}\n\nPuedes escribir *"editar"* para cambiar tu cargo.`
          : `\n\nIntenta de nuevo mÃ¡s tarde o escribe *"editar"* para ajustar tus preferencias.`;

        return {
          text: `No encontrÃ© ofertas que coincidan con *"${currentRole}"* en este momento. ðŸ˜”${suggestionsText}`,
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

âš ï¸ *Â¡AtenciÃ³n!* Has visto todas las ofertas disponibles para tu perfil actual. Para tu prÃ³xima bÃºsqueda puedes:
â€¢ Esperar un tiempo mientras se publican nuevas ofertas
â€¢ Escribir *"editar"* para ajustar tus preferencias y encontrar mÃ¡s opciones`;
      }

      // Tiempo de espera para mensaje retrasado: 10 segundos
      const DELAY_MS = 10000;

      // Usar usesLeft pasado como parÃ¡metro (ya descontado) o consultar DB
      const usesLeft = usesLeftAfterDeduction ?? subscription?.freemiumUsesLeft ?? 0;
      const isPremium = subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO';

      // Construir mensaje retrasado con info de bÃºsquedas
      const planLabel = isPremium ? (subscription?.plan === 'PRO' ? 'Plan Pro' : 'Plan Premium') : 'Plan Free';

      let menuText: string;

      if (usesLeft === 0 && !isPremium) {
        // Mensaje especial cuando se agotan las bÃºsquedas del Plan Free
        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const userRole = profile?.role || 'tu perfil';
        const checkoutLink = process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ';

        menuText = `*BÃºsquedas restantes esta semana:* 0 (Plan Free)

ðŸš€ Hay muchas ofertas que podemos cazar por ti en internet para tu rol (*${userRole}*).
Si quieres seguir recibiÃ©ndolas de forma automÃ¡tica y filtradas segÃºn tu perfil, activa CIO por solo *$20.000 COP al mes* y continÃºa tu bÃºsqueda sin lÃ­mites.
ðŸŽ¯ ActÃ­valo aquÃ­:

ðŸ‘‰ ${checkoutLink}

Estoy lista para ayudarte a cazar tu prÃ³xima oportunidad.`;
      } else {
        const searchWord = usesLeft === 1 ? 'bÃºsqueda' : 'bÃºsquedas';
        menuText = `ðŸ“Œ Te quedan *${usesLeft} ${searchWord} esta semana* (${planLabel}).

âš ï¸ Â¿Las ofertas no encajan del todo?

Puedes ir a *Editar perfil* y ajustar tu rol, ciudad o preferencias.

Â¿QuÃ© quieres hacer ahora?`;
      }

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
                { id: 'cmd_buscar', title: 'ðŸ” Buscar empleos', description: 'Encontrar mÃ¡s ofertas' },
                { id: 'cmd_editar', title: 'âœï¸ Editar perfil', description: 'Cambiar tus preferencias' },
                { id: 'cmd_reiniciar', title: 'ðŸ”„ Reiniciar', description: 'Reconfigurar tu perfil' },
                { id: 'cmd_cancelar', title: 'âŒ Cancelar servicio', description: 'Dejar de usar el CIO' },
              ],
            },
          ],
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error en bÃºsqueda de empleos: ${errorMessage}`);

      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
      });

      // Fallback heurÃ­stico rÃ¡pido para problemas obvios de parÃ¡metros.
      const heuristicDiagnosis = this.detectSearchProfileIssue(profile);
      if (heuristicDiagnosis) {
        return { text: heuristicDiagnosis };
      }

      // DiagnÃ³stico con IA para explicar causa probable y siguiente acciÃ³n.
      const diagnosis = await this.llmService.diagnoseSearchFailure({
        errorMessage,
        role: profile?.role,
        location: profile?.location,
        experienceLevel: profile?.experienceLevel,
        jobType: profile?.jobType,
        minSalary: profile?.minSalary,
      });

      if (diagnosis?.userMessage) {
        return { text: diagnosis.userMessage };
      }

      return {
        text: `Lo siento, no pude buscar ofertas en este momento. ðŸ˜”

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
      // Usuario quiere activar alertas â†’ Preguntar hora directamente (frecuencia siempre diaria)
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
      // Usuario NO quiere alertas â†’ Crear AlertPreference con enabled=false
      await this.prisma.alertPreference.create({
        data: {
          userId,
          alertFrequency: 'daily', // Siempre diaria
          alertTimeLocal: '09:00', // Valor por defecto (no se usarÃ¡)
          timezone: 'America/Bogota',
          enabled: false, // âš ï¸ DESACTIVADO
        },
      });

      // Volver a READY
      await this.updateSessionState(userId, ConversationState.READY);

      return await this.returnToMainMenu(userId, BotMessages.ALERTS_DISABLED);
    }

    // No entendiÃ³ la respuesta, mostrar botones (sin emojis)
    return {
      text: `${BotMessages.OFFER_ALERTS}\n\n_Por favor, selecciona una opciÃ³n:_`,
      buttons: [
        { id: 'accept_alerts', title: 'SÃ­, activar' },
        { id: 'reject_alerts', title: 'No, gracias' },
      ],
    };
  }

  /**
   * Estado CONFIRM_RESTART: Confirmando reinicio de perfil
   * ACTUALIZADO: Va directamente a ASK_ROLE (sin tÃ©rminos)
   */
  private async handleConfirmRestartState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmÃ³ reinicio
      await this.restartUserProfile(userId);
      const onboardingFlags = await this.getOnboardingFlags(userId);
      if (onboardingFlags.flowVariant === this.v2FlowVariant) {
        await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
        return {
          text: `${BotMessages.RESTARTED}\n\n${BotMessages.V2_WELCOME_ROLE}`,
        };
      }

      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      // Ir directamente a preguntar rol
      return {
        text: `${BotMessages.RESTARTED}\n\n${BotMessages.ASK_ROLE}`,
      };
    }

    if (isRejection(text)) {
      // Usuario cancelÃ³ el reinicio
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.RESTART_CANCELLED);
    }

    // Respuesta ambigua â€” intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_RESTART);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_restart', title: 'SÃ­, reiniciar' },
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `${BotMessages.CONFIRM_RESTART}\n\n_Por favor, selecciona una opciÃ³n:_`,
      buttons: [
        { id: 'confirm_restart', title: 'SÃ­, reiniciar' },
        { id: 'cancel_restart', title: 'No, cancelar' },
      ],
    };
  }

  /**
   * Estado CONFIRM_CANCEL_SERVICE: Confirmando cancelaciÃ³n del servicio
   */
  private async handleConfirmCancelServiceState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmÃ³ cancelaciÃ³n
      await this.deleteUserCompletely(userId);
      return { text: BotMessages.SERVICE_CANCELLED };
    }

    if (isRejection(text)) {
      // Usuario decidiÃ³ no cancelar
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.CANCEL_SERVICE_ABORTED);
    }

    // Respuesta ambigua â€” intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_CANCEL_SERVICE);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_cancel', title: 'SÃ­, confirmar' },
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `${BotMessages.CONFIRM_CANCEL_SERVICE}\n\n_Por favor, selecciona una opciÃ³n:_`,
      buttons: [
        { id: 'confirm_cancel', title: 'SÃ­, confirmar' },
        { id: 'abort_cancel', title: 'No, continuar' },
      ],
    };
  }

  /**
   * Maneja la subida de CV (stub)
   */
  private async handleCVUpload(userId: string, mediaUrl: string): Promise<BotReply> {
    this.logger.log(`ðŸ“„ CV recibido de usuario ${userId}: ${mediaUrl}`);

    // TODO: Implementar con CvService
    // await this.cvService.processCV(userId, mediaUrl);

    return {
      text: `Â¡Gracias por enviar tu CV! ðŸ“„

Por ahora estoy en pruebas y no puedo procesarlo aÃºn, pero pronto podrÃ© extraer informaciÃ³n automÃ¡ticamente.

ContinÃºa con el proceso manual. ðŸ‘‡`,
    };
  }

  // ========================================
  // MÃ©todos de ediciÃ³n de perfil
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

    // Siempre mostrar lista desplegable con opciones de ediciÃ³n
    return {
      text: `ðŸ“ *Tus preferencias actuales:*

ðŸ”¹ *Rol:* ${formattedProfile.role}
ðŸ’¡ *Experiencia:* ${formattedProfile.experience}
ðŸ“ *UbicaciÃ³n:* ${formattedProfile.location}
â° *Horario de alertas:* ${formattedProfile.alertTime}

Selecciona quÃ© quieres editar:`,
      listTitle: 'Editar campo',
      listSections: [
        {
          title: 'Preferencias',
          rows: [
            {
              id: 'edit_rol',
              title: 'ðŸ”¹ Rol',
              description: `Actual: ${formattedProfile.role}`,
            },
            {
              id: 'edit_experiencia',
              title: 'ðŸ’¡ Experiencia',
              description: `Actual: ${formattedProfile.experience}`,
            },
            {
              id: 'edit_ubicacion',
              title: 'ðŸ“ UbicaciÃ³n',
              description: `Actual: ${formattedProfile.location}`,
            },
            // [DESACTIVADO] Frecuencia - siempre es diaria
            {
              id: 'edit_horario',
              title: 'â° Horario alertas',
              description: `Actual: ${formattedProfile.alertTime}`,
            },
            {
              id: 'cmd_cancelar',
              title: 'âŒ Cancelar',
              description: 'Volver al menÃº principal',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado EDITING_PROFILE: Usuario eligiÃ³ editar, ahora debe seleccionar quÃ© campo
   * ACTUALIZADO: Siempre usa listas interactivas
   */
  private async handleEditingProfileState(userId: string, text: string): Promise<BotReply> {
    // Permitir cancelar
    if (isRejection(text) || text.toLowerCase().includes('cancelar')) {
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.NOT_READY_YET);
    }

    // Detectar quÃ© campo quiere editar
    const field = detectEditField(text);

    if (!field) {
      // Mostrar lista de campos editables si no entendiÃ³
      return await this.showProfileForEditing(userId);
    }

    // Transicionar al estado de ediciÃ³n correspondiente
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
                  description: 'ReciÃ©n graduado',
                },
                {
                  id: 'exp_junior',
                  title: 'Junior (1-2 aÃ±os)',
                  description: 'Experiencia inicial',
                },
                {
                  id: 'exp_mid',
                  title: 'Intermedio (3-5 aÃ±os)',
                  description: 'Experiencia sÃ³lida',
                },
                {
                  id: 'exp_senior',
                  title: 'Senior (5+ aÃ±os)',
                  description: 'Experto',
                },
                {
                  id: 'exp_lead',
                  title: 'Lead/Expert (7+ aÃ±os)',
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
    // Si el usuario responde algo conversacional (ej: "no se"), reintegrarlo al paso de rol.
    if (isNonRoleInput(text)) {
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.EDIT_ROLE);
      return {
        text: this.normalizeConversationalMessage(conversational)
          || 'Entiendo. Para continuar, escribeme tu nuevo cargo o profesion principal (solo uno).',
      };
    }

    // Paso 1: Regex
    let role = normalizeRole(text);

    // Paso 2: IA como fallback/mejora
    if (!role) {
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        if (!aiResult.isValid) {
          return { text: aiResult.warning || aiResult.suggestion || BotMessages.ERROR_ROLE_INVALID };
        }
        role = aiResult.role;
      }
    } else {
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult && aiResult.isValid && aiResult.role) {
        role = aiResult.role;
      } else if (aiResult && !aiResult.isValid) {
        return { text: aiResult.warning || aiResult.suggestion || BotMessages.ERROR_ROLE_INVALID };
      }
    }

    if (role) {
      // Blindaje extra: si la IA devolvio algo conversacional, no actualizar perfil.
      role = normalizeRole(role);
    }

    if (!role) {
      // Intentar respuesta conversacional Ãºnica
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.EDIT_ROLE);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_ROLE_INVALID };
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
              { id: 'exp_none', title: 'Sin experiencia', description: 'ReciÃ©n graduado' },
              { id: 'exp_junior', title: 'Junior (1-2 aÃ±os)', description: 'Experiencia inicial' },
              { id: 'exp_mid', title: 'Intermedio (3-5 aÃ±os)', description: 'Experiencia sÃ³lida' },
              { id: 'exp_senior', title: 'Senior (5+ aÃ±os)', description: 'Experto' },
              { id: 'exp_lead', title: 'Lead/Expert (7+ aÃ±os)', description: 'Liderazgo avanzado' },
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
   * Estado EDIT_LOCATION: Editando ubicaciÃ³n
   */
  private async handleEditLocationState(userId: string, text: string): Promise<BotReply> {
    const multipleLocationChoices = this.extractMultipleLocationChoices(text);
    const validation = validateAndNormalizeLocation(text);
    const resolvedMultipleChoices =
      multipleLocationChoices.length > 1
        ? multipleLocationChoices
        : validation.errorType === 'multiple' && validation.options
          ? validation.options
          : [];
    if (resolvedMultipleChoices.length > 1) {
      return {
        text: this.buildSingleLocationChoiceMessage(resolvedMultipleChoices),
      };
    }

    const normalizedText = text.toLowerCase().trim();
    const remotePatterns = ['remoto', 'remote', 'trabajo remoto', 'home office', 'teletrabajo'];
    const isRemoteIntent = remotePatterns.some((pattern) => normalizedText.includes(pattern));

    let finalLocation: string | null = null;

    // Siempre pasar por IA primero en ediciï¿½n de ubicaciï¿½n.
    const aiResult = await this.llmService.validateAndCorrectLocation(text);
    if (aiResult) {
      if (!aiResult.isValid) {
        return {
          text: aiResult.suggestion
            || (isRemoteIntent ? BotMessages.ERROR_LOCATION_REMOTE_INVALID : BotMessages.ERROR_LOCATION_INVALID),
        };
      }
      finalLocation = aiResult.location;
    } else if (validation.isValid && validation.location) {
      // LLM no disponible: fallback local.
      finalLocation = validation.location;
    } else {
      if (isRemoteIntent) {
        return { text: BotMessages.ERROR_LOCATION_REMOTE_INVALID };
      }
      if (validation.errorType === 'too_vague') {
        return { text: this.getTooVagueLocationMessage(text) };
      }
      return { text: BotMessages.ERROR_LOCATION_INVALID };
    }

    if (!finalLocation) {
      // Intentar respuesta conversacional ï¿½nica
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.EDIT_LOCATION);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, {
      location: finalLocation,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('ubicaci\u00f3n', finalLocation));
  }

  private getTooVagueLocationMessage(input: string): string {
    const normalized = input.toLowerCase();

    if (
      normalized.includes('europa') ||
      normalized.includes('europe') ||
      normalized.includes('union europea') ||
      normalized.includes('uniÃ³n europea')
    ) {
      return `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒ

Por favor escribe una *ciudad* o *paÃ­s* de Europa.

Ejemplo: "Oporto", "Lisboa", "Madrid", "Portugal", "EspaÃ±a".`;
    }

    if (normalized.includes('asia')) {
      return `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒ

Por favor escribe una *ciudad* o *paÃ­s* de Asia.

Ejemplo: "Tokio", "Singapur", "Bangkok", "JapÃ³n", "India".`;
    }

    if (normalized.includes('africa') || normalized.includes('Ã¡frica')) {
      return `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒ

Por favor escribe una *ciudad* o *paÃ­s* de Ãfrica.

Ejemplo: "Nairobi", "Ciudad del Cabo", "El Cairo", "Kenia", "SudÃ¡frica".`;
    }

    if (normalized.includes('oceania') || normalized.includes('oceanÃ­a')) {
      return `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒ

Por favor escribe una *ciudad* o *paÃ­s* de OceanÃ­a.

Ejemplo: "SÃ­dney", "Melbourne", "Auckland", "Australia", "Nueva Zelanda".`;
    }

    if (
      normalized.includes('norteamerica') ||
      normalized.includes('norteamÃ©rica') ||
      normalized.includes('north america')
    ) {
      return `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒŽ

Por favor escribe una *ciudad* o *paÃ­s* de NorteamÃ©rica.

Ejemplo: "Toronto", "Miami", "New York", "CanadÃ¡", "Estados Unidos".`;
    }

    return BotMessages.ERROR_LOCATION_TOO_VAGUE;
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
  //               { id: 'work_remoto', title: 'ðŸ  Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: 'ðŸ¢ Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: 'ðŸ”„ HÃ­brido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: 'âœ¨ Sin preferencia', description: 'Cualquier modalidad' },
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
              { id: 'freq_daily', title: 'â˜€ï¸ Diariamente' },
              { id: 'freq_every_3_days', title: 'ðŸ“… Cada 3 dÃ­as' },
              { id: 'freq_weekly', title: 'ðŸ“† Semanalmente' },
              { id: 'freq_monthly', title: 'ðŸ—“ï¸ Mensualmente' },
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
   * Verifica si el usuario tiene usos disponibles (por si un admin los aÃ±adiÃ³)
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

      // Verificar si el premium expirÃ³ por 30 dÃ­as
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

    // Freemium: usar la misma regla canÃ³nica en todo el sistema.
    return !shouldExpireFreemium(
      subscription.freemiumStartDate,
      subscription.freemiumUsesLeft,
    );
  }

  /**
   * Estado FREEMIUM_EXPIRED: El usuario agotÃ³ su freemium
   */
  private async handleFreemiumExpiredState(userId: string, text: string): Promise<BotReply> {
    // PRIMERO: Si el usuario hace clic en "ver ofertas" y tiene alertas pendientes, mostrarlas
    const intent = detectIntent(text);
    if (intent === UserIntent.SEARCH_NOW) {
      const pendingAlert = await this.getLatestNonStalePendingAlert(userId);

      if (pendingAlert) {
        this.logger.log(`ðŸ“¬ Usuario ${userId} (FREEMIUM_EXPIRED) tiene ${pendingAlert.jobCount} ofertas pendientes`);

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
            `ðŸ¢ ${job.company || 'Empresa confidencial'}\n` +
            `ðŸ“ ${job.locationRaw || 'Sin ubicaciÃ³n'}\n` +
            `ðŸ”— ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        // Si el usuario tiene usos disponibles, volver a READY
        if (await this.checkIfUserHasUsesAvailable(userId)) {
          await this.updateSessionState(userId, ConversationState.READY);
        }

        return {
          text: `ðŸŽ¯ *Â¡AquÃ­ estÃ¡n tus ofertas de empleo!*\n\n${formattedJobs}\n\nðŸ’¡ _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }
    }

    // Verificar el tipo de suscripciÃ³n
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si es usuario pagado activo (PREMIUM/PRO), NO deberÃ­a estar aquÃ­ - devolverlo a READY
    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ðŸ”„ Usuario pagado ${userId} estaba en FREEMIUM_EXPIRED incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      // Verificar si tiene bÃºsquedas disponibles o estÃ¡ esperando
      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles.`);
      } else {
        // Premium sin bÃºsquedas semanales - mostrar mensaje de espera
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃ±adiÃ³ usos mientras estaba en este estado (para freemium)
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ðŸ”„ Usuario ${userId} recuperÃ³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles nuevamente.`);
    }

    // Solo para usuarios freemium: transiciÃ³n a pedir email
    await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
    return { text: BotMessages.FREEMIUM_EXPIRED_ASK_EMAIL };
  }

  /**
   * Estado ASK_EMAIL: Pedir email para vincular pago
   */
  private async handleAskEmailState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no deberÃ­a estar aquÃ­
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ðŸ”„ Usuario pagado ${userId} estaba en ASK_EMAIL incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃ±adiÃ³ usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ðŸ”„ Usuario ${userId} recuperÃ³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles nuevamente.`);
    }

    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { text: BotMessages.ERROR_EMAIL_INVALID };
    }

    // Buscar transacciÃ³n aprobada con ese email que no estÃ© vinculada
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        email,
        wompiStatus: 'APPROVED',
        userId: null, // No vinculada aÃºn
      },
    });

    if (transaction) {
      // Â¡Pago encontrado! Vincular y activar premium
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
   * Estado WAITING_PAYMENT: Usuario esperando confirmaciÃ³n de pago
   */
  private async handleWaitingPaymentState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no deberÃ­a estar aquÃ­
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ðŸ”„ Usuario pagado ${userId} estaba en WAITING_PAYMENT incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃ±adiÃ³ usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ðŸ”„ Usuario ${userId} recuperÃ³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ðŸŽ‰ Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃºsquedas disponibles nuevamente.`);
    }

    const lower = text.toLowerCase().trim();

    // Si escribe "verificar", "comprobar" o similar, re-verificar pago
    if (
      lower.includes('verificar') ||
      lower.includes('comprobar') ||
      lower.includes('ya pague') ||
      lower.includes('ya paguÃ©')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      if (!user?.email) {
        await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
        return { text: 'Por favor, primero ingresa tu correo electrÃ³nico.' };
      }

      // Buscar transacciÃ³n aprobada
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
        text: `âœ… Email actualizado a *${newEmail}*.\n\nEscribe *"verificar"* cuando hayas realizado el pago.`,
      };
    }

    // Mostrar ayuda con botÃ³n de verificar
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

    // Vincular transacciÃ³n
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        userId,
        linkedAt: new Date(),
      },
    });

    // Actualizar suscripciÃ³n a premium con expiraciÃ³n a 30 dÃ­as
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

    this.logger.log(`ðŸ‘‘ Usuario ${userId} activado como PREMIUM (expira: ${premiumEndDate.toISOString()})`);
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

    // Si no tiene suscripciÃ³n, puede usar (se crearÃ¡ freemium despuÃ©s)
    if (!subscription) {
      return { allowed: true, currentUses: 3 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expirÃ³ (30 dÃ­as)
      if (subscription.premiumEndDate && now > subscription.premiumEndDate) {
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            status: 'EXPIRED',
            plan: 'FREEMIUM',
            freemiumExpired: true,
          },
        });
        return { allowed: false, message: BotMessages.PREMIUM_EXPIRED };
      }

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
    if (shouldExpireFreemium(subscription.freemiumStartDate, subscription.freemiumUsesLeft)) {
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: 'EXPIRED',
          freemiumExpired: true,
        },
      });
      return { allowed: false, message: BotMessages.FREEMIUM_EXPIRED };
    }

    return { allowed: true, currentUses: subscription.freemiumUsesLeft };
  }

  /**
   * Descuenta un uso del servicio (llamar SOLO despuÃ©s de una operaciÃ³n exitosa)
   * @returns { usesLeft: number }
   */
  async deductUsage(userId: string): Promise<{ usesLeft: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripciÃ³n, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usÃ³ 1 (de 5 totales)
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

    // Si no tiene suscripciÃ³n, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usÃ³ 1 (de 5 totales)
        },
      });
      return { allowed: true, usesLeft: 4 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expirÃ³ (30 dÃ­as)
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

      // Verificar si es nueva semana (cada 7 dÃ­as desde premiumWeekStart)
      const weekStart = subscription.premiumWeekStart;

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        // Resetear usos semanales
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 que estÃ¡ usando ahora
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

      // Calcular fecha de reinicio (7 dÃ­as desde premiumWeekStart)
      const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);

      return {
        allowed: false,
        message: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate),
      };
    }

    // PLAN FREEMIUM
    if (shouldExpireFreemium(subscription.freemiumStartDate, subscription.freemiumUsesLeft)) {
      // Marcar freemium como expirado
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          freemiumExpired: true,
          status: 'EXPIRED',
        },
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
   * Verifica si han pasado 7 dÃ­as desde el inicio de la semana premium
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
      internship: 'PasantÃ­a',
      freelance: 'Freelance',
    };

    return typeMap[jobType || ''] || 'No configurado';
  }

  private formatExperienceLevel(experienceLevel: string | null | undefined): string {
    const experienceMap: Record<string, string> = {
      none: 'Sin experiencia',
      junior: 'Junior (1-2 aÃ±os)',
      mid: 'Intermedio (3-5 aÃ±os)',
      senior: 'Senior (5+ aÃ±os)',
      lead: 'Lead/Expert (7+ aÃ±os)',
    };

    return experienceMap[experienceLevel || ''] || 'No configurado';
  }

  /**
   * Detecta errores comunes en parÃ¡metros de perfil que suelen romper la bÃºsqueda.
   */
  private detectSearchProfileIssue(profile: {
    role: string | null;
    location: string | null;
  } | null): string | null {
    if (!profile) return null;

    const role = (profile.role || '').trim();
    const location = (profile.location || '').trim();

    const hasMultipleRoles = /[,/;]|(\s-\s)|(\sy\s)|(\so\s)/i.test(role);
    if (hasMultipleRoles) {
      return `No pude completar la bÃºsqueda porque tu *cargo parece tener varios roles al mismo tiempo*.

Para obtener mejores resultados, entra a *Editar perfil* y deja solo *un rol principal* (ej: _Asesor comercial_).

DespuÃ©s vuelve a escribir *buscar*.`;
    }

    if (!role || role.length < 2) {
      return `No pude completar la bÃºsqueda porque tu *cargo* no estÃ¡ bien definido.

Entra a *Editar perfil*, ajusta tu cargo principal y vuelve a buscar.`;
    }

    if (!location || location.length < 2) {
      return `No pude completar la bÃºsqueda porque tu *ubicaciÃ³n* no estÃ¡ bien definida.

Entra a *Editar perfil*, ajusta tu ciudad o paÃ­s y vuelve a buscar.`;
    }

    return null;
  }

  // [DESACTIVADO] Formatea el workMode para mostrar al usuario - Puede reactivarse
  // /**
  //  * Formatea el workMode para mostrar al usuario
  //  */
  // private formatWorkMode(workMode: string | null | undefined): string {
  //   const workModeMap: Record<string, string> = {
  //     remoto: 'ðŸ  Remoto',
  //     presencial: 'ðŸ¢ Presencial',
  //     hibrido: 'ðŸ”„ HÃ­brido',
  //     sin_preferencia: 'âœ¨ Sin preferencia',
  //   };
  //
  //   return workModeMap[workMode || ''] || 'No configurado';
  // }

  private async sendOnboardingEmailSafely(
    userId: string,
    email: string | null,
    name: string | null,
  ): Promise<void> {
    if (!email || !name) {
      this.logger.warn(
        `No se envio onboarding email al usuario ${userId}: faltan email o nombre`,
      );
      return;
    }

    try {
      await this.notificationsService.sendOnboardingEmail(email, name, { userId });
      this.logger.log(`ðŸ“§ Onboarding email enviado automatico (registro chat) a ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error enviando onboarding email automatico (registro chat) a ${email} (usuario ${userId}): ${errorMessage}`,
      );
    }
  }

  // ========================================
  // MÃ©todos auxiliares de base de datos
  // ========================================

  /**
   * Busca un usuario por telÃ©fono (NO crea si no existe)
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
      this.logger.log(`âœ… Usuario creado: ${phone}`);
    }

    return user;
  }

  /**
   * Obtiene o crea una sesiÃ³n activa
   */
  private async getOrCreateSession(
    userId: string,
    flowVariantOnCreate: FlowVariant = this.defaultFlowVariant,
  ) {
    let session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await this.prisma.session.create({
        data: {
          userId,
          state: ConversationState.NEW,
          data: {
            flowVariant: flowVariantOnCreate,
          },
        },
      });
      this.logger.log(`âœ… SesiÃ³n creada para usuario ${userId}`);
    }

    return session;
  }

  private parseFlowVariant(value: unknown): FlowVariant | null {
    if (value === 'legacy' || value === 'freemium_v2') {
      return value;
    }
    return null;
  }

  /**
   * Garantiza que la sesiÃ³n tenga una variante de flujo explÃ­cita.
   * - Si ya tiene variante vÃ¡lida, la respeta.
   * - Si no tiene, persiste la variante preferida.
   */
  private async ensureSessionFlowVariant(
    userId: string,
    session: { id: string; data: any },
    preferredVariant: FlowVariant,
  ): Promise<FlowVariant> {
    const currentData = (session.data as Record<string, any>) || {};
    const existingVariant = this.parseFlowVariant(currentData.flowVariant);

    if (existingVariant) {
      return existingVariant;
    }

    const nextData = {
      ...currentData,
      flowVariant: preferredVariant,
    };

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        data: nextData,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Variante de flujo inicializada para ${userId}: ${preferredVariant}`,
    );

    return preferredVariant;
  }

  // [ELIMINADO] getDeviceType ya no se usa, todos son tratados como mÃ³vil
  // private async getDeviceType(userId: string): Promise<'MOBILE' | 'DESKTOP'> { ... }

  /**
   * Helper: Regresar al menÃº principal con opciones interactivas
   * ACTUALIZADO: Siempre muestra lista interactiva (todos tratados como mÃ³vil)
   */
  private async returnToMainMenu(_userId: string, message: string): Promise<BotReply> {
    // Siempre retornar lista interactiva
    return {
      text: `${message}\n\nÂ¿QuÃ© te gustarÃ­a hacer?`,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: 'ðŸ” Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'âœï¸ Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'ðŸ”„ Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'âŒ Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Actualiza el estado de la sesiÃ³n
   */
  private async updateSessionState(userId: string, newState: ConversationState) {
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        state: newState,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(`ðŸ“Š Estado actualizado a: ${newState}`);
  }

  /**
   * Actualiza datos temporales en la sesiÃ³n (campo JSON data)
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

    this.logger.debug(`ðŸ’¾ Datos de sesiÃ³n actualizados: ${JSON.stringify(newData)}`);
  }

  private async getOnboardingFlags(userId: string): Promise<{
    flowVariant: FlowVariant;
    skipAlertConfigOnboarding: boolean;
    defaultOnboardingAlertTime: string;
  }> {
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    });

    const sessionData = (session?.data as Record<string, any>) || {};
    const flowVariant = this.parseFlowVariant(sessionData.flowVariant) || this.defaultFlowVariant;

    return {
      flowVariant,
      skipAlertConfigOnboarding: sessionData.skipAlertConfigOnboarding === true,
      defaultOnboardingAlertTime:
        typeof sessionData.defaultOnboardingAlertTime === 'string'
          ? sessionData.defaultOnboardingAlertTime
          : this.defaultOnboardingAlertTime,
    };
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

    const invalidatesPendingAlerts =
      data.role !== undefined ||
      data.experienceLevel !== undefined ||
      data.location !== undefined ||
      data.workMode !== undefined ||
      data.jobType !== undefined ||
      data.minSalary !== undefined;

    if (invalidatesPendingAlerts) {
      const deleted = await this.prisma.pendingJobAlert.deleteMany({
        where: {
          userId,
          viewedAt: null,
        },
      });

      if (deleted.count > 0) {
        this.logger.log(
          `Descartadas ${deleted.count} ofertas pendientes de ${userId} por actualizaciÃ³n de perfil`,
        );
      }
    }

    this.logger.debug(`âœ… Perfil actualizado: ${JSON.stringify(data)}`);
  }

  private async getLatestNonStalePendingAlert(userId: string) {
    const pendingAlert = await this.prisma.pendingJobAlert.findFirst({
      where: {
        userId,
        viewedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingAlert) {
      return null;
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });

    if (profile?.updatedAt && profile.updatedAt > pendingAlert.createdAt) {
      const deleted = await this.prisma.pendingJobAlert.deleteMany({
        where: {
          userId,
          viewedAt: null,
          createdAt: { lte: profile.updatedAt },
        },
      });

      this.logger.log(
        `Descartadas ${deleted.count} ofertas pendientes obsoletas para ${userId} (perfil actualizado)`,
      );
      return null;
    }

    return pendingAlert;
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

    this.logger.debug(`â° Alerta configurada para: ${alertTime} con frecuencia ${alertFrequency}`);
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

    // Eliminar bÃºsquedas y trabajos enviados (pueden ser mÃºltiples)
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesiÃ³n a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        state: ConversationState.NEW,
        data: {
          flowVariant: this.v2FlowVariant,
          skipAlertConfigOnboarding: true,
          defaultOnboardingAlertTime: this.defaultOnboardingAlertTime,
        },
        updatedAt: new Date(),
      },
    });

    this.logger.log(`ðŸ”„ Perfil reiniciado para usuario ${userId}`);
  }

  /**
   * "Cancela" el servicio: elimina preferencias pero mantiene datos de identidad y suscripciÃ³n
   * Esto evita que el usuario pueda re-registrarse para una nueva prueba gratuita
   */
  private async deleteUserCompletely(userId: string) {
    // Eliminar UserProfile (preferencias de bÃºsqueda)
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

    // Eliminar bÃºsquedas y trabajos enviados
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesiÃ³n a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: { state: ConversationState.NEW, data: {}, updatedAt: new Date() },
    });

    // NO eliminar User ni Subscription
    // El usuario mantiene su identidad y estado de suscripciÃ³n

    this.logger.log(`ðŸ—‘ï¸ Preferencias eliminadas para usuario ${userId} (usuario NO eliminado)`);
  }
}


