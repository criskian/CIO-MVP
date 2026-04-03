import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { JobPosting, JobSearchResult } from '../job-search/types/job-posting';
import { LlmService } from '../llm/llm.service';
import { CvService, type CvProfileExtractionResult } from '../cv/cv.service';
import { ChatHistoryService } from './chat-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NormalizedIncomingMessage,
  BotReply,
} from '../whatsapp/interfaces/whatsapp-provider.interface';
import { ConversationState, UserIntent } from './types/conversation-states';
import { BotMessages } from './helpers/bot-messages';
import { repairMojibakeText } from '../../common/text/mojibake.util';
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
  isNonRoleInput,
  isPreferenceUpdateIntent,
  normalizeExperienceLevel,
  normalizeLocation,
  validateAndNormalizeLocation,
  extractNormalizedLocations,
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
  FREEMIUM_POLICY_V2,
  shouldExpireFreemiumByPolicy,
} from './helpers/date-utils';

type FlowVariant = 'legacy' | 'freemium_v2';
type PremiumOnboardingSource = 'restart' | 'direct_payment';
type PremiumOnboardingMode = 'cv' | 'no_cv';
type LeadRejectionReason = 'role' | 'location' | 'company' | 'salary' | 'remote' | 'experience' | 'other';
type LeadVacancySearchMode = 'default' | 'reuse_cache' | 'force_fresh';
type LeadRejectionReasonSource = 'button' | 'free_text' | 'llm';
type JobSearchOutcome = 'success' | 'no_results' | 'error';

interface JobSearchExecutionResult {
  reply: BotReply;
  outcome: JobSearchOutcome;
}

/**
 * Servicio de conversación (Orquestador)
 * Implementa la máquina de estados del flujo conversacional con el usuario
 * NO se comunica directamente con WhatsApp, solo procesa y devuelve respuestas
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly defaultOnboardingAlertTime = '07:00';
  private readonly leadPolicyVersion =
    process.env.PRIVACY_POLICY_VERSION || '2026-03-25';
  private readonly defaultFlowVariant: FlowVariant = 'legacy';
  private readonly v2FlowVariant: FlowVariant = 'freemium_v2';
  private readonly leadReuseScoreThreshold = 0.65;
  private readonly leadReuseCandidateLimit = 4;

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

      this.logger.log(`📨 Procesando mensaje de ${phone}: ${text || '[media]'}`);

      // 1. Buscar usuario por teléfono (NO crear, debe registrarse en landing)
      const user = await this.findUserByPhone(phone);

      // 2. Si no está registrado, iniciar registro in-bot
      if (!user) {
      this.logger.log(`👤 Usuario no registrado: ${phone} → iniciando registro in-bot`);

        // Crear usuario mínimo con solo el teléfono
        const newUser = await this.prisma.user.create({
          data: { phone },
          include: { subscription: true },
        });

        // Crear sesión con estado WA_ASK_NAME
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
          if (!this.isV2LeadState(session.state) && !this.isV2PreRegistrationSupportState(session.state)) {
            await this.updateSessionState(user.id, ConversationState.LEAD_COLLECT_PROFILE);
            return { text: BotMessages.V2_WELCOME_ROLE };
          }

          const intent = detectIntent(text || '');
          const forcedSearchReply = await this.tryHandleGlobalSearchNowOverride(
            user.id,
            session.state,
            text || '',
            intent,
          );
          if (forcedSearchReply) {
            return forcedSearchReply;
          }
          return await this.handleStateTransition(user.id, session.state, text || '', intent);
        }
        // Si por alguna razón no tiene sesión en WA_ASK_NAME, ponerlo ahí
        if (session.state !== ConversationState.WA_ASK_NAME && session.state !== ConversationState.WA_ASK_EMAIL) {
          await this.updateSessionState(user.id, ConversationState.WA_ASK_NAME);
          return { text: BotMessages.NOT_REGISTERED };
        }
        // Continuar con el flujo normal de estados
        const preRegistrationIntent = detectIntent(text || '');
        const forcedSearchReply = await this.tryHandleGlobalSearchNowOverride(
          user.id,
          session.state,
          text || '',
          preRegistrationIntent,
        );
        if (forcedSearchReply) {
          return forcedSearchReply;
        }
        return await this.handleStateTransition(user.id, session.state, text || '', preRegistrationIntent);
      }

      // 4. Obtener o crear sesión activa
      const session = await this.getOrCreateSession(user.id);
      const flowVariant = await this.ensureSessionFlowVariant(
        user.id,
        session,
        this.defaultFlowVariant,
      );
      const isPaidPlanActive = this.isPaidPlanActive(user.subscription);
      await this.ensurePremiumOnboardingV2ForPaidUserInNewState(
        user.id,
        session,
        isPaidPlanActive,
      );
      this.logger.debug(`Variante de flujo para ${user.id}: ${flowVariant}`);

      // NOTA: Los mensajes entrantes y salientes se guardan centralizadamente en WhatsappService

      // 5. Si hay media (documento/imagen), podría ser un CV
      if (mediaUrl && (messageType === 'document' || messageType === 'image')) {
        const mediaReply = await this.handleMediaUploadByState(
          user.id,
          session.state,
          messageType,
          mediaUrl,
        );
        if (mediaReply) {
          return mediaReply;
        }
      }

      // 6. Si no hay texto, no podemos procesar - mostrar menú de ayuda
      if (!text) {
        const response = await this.returnToMainMenu(user.id, BotMessages.UNKNOWN_INTENT);
        return response;
      }

      // 7. Detectar intención general (para comandos especiales)
      let intent = detectIntent(text);

      // 7.25. Seguridad: frases como "quiero remoto" deben ir a editar perfil
      if (session.state === ConversationState.READY && isPreferenceUpdateIntent(text)) {
        intent = UserIntent.CHANGE_PREFERENCES;
      }

      // 7.5. Si regex no detectó nada y estamos en READY, preguntar al LLM
      if (intent === UserIntent.UNKNOWN && session.state === ConversationState.READY) {
        const aiIntent = await this.llmService.detectIntent(text, session.state);
        if (aiIntent && aiIntent !== UserIntent.UNKNOWN) {
          intent = aiIntent;
          this.logger.log(`🤖 Intent detectado por IA: ${intent}`);
        }
      }

      const forcedSearchReply = await this.tryHandleGlobalSearchNowOverride(
        user.id,
        session.state,
        text,
        intent,
      );
      if (forcedSearchReply) {
        return forcedSearchReply;
      }

      // 7.6. Si estamos en onboarding y el texto no parece una respuesta válida, manejar out-of-flow
      const outOfFlowResponse = await this.tryHandleOutOfFlow(user.id, text, session.state, intent);
      if (outOfFlowResponse) {
        return outOfFlowResponse;
      }

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

      // ⚠️ GUARDAR ERROR EN HISTORIAL
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

      case ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT:
        return await this.handleLeadWaitRejectionOtherTextState(userId, text);

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

      case ConversationState.PREMIUM_ASK_CV:
        return await this.handlePremiumAskCvState(userId, text, intent);

      case ConversationState.PREMIUM_WAITING_CV_FILE:
        return await this.handlePremiumWaitingCvFileState(userId, text, intent);

      case ConversationState.PREMIUM_PROCESSING_CV:
        return {
          text: BotMessages.PREMIUM_PROCESSING_CV,
        };

      case ConversationState.PREMIUM_CONFIRM_CV_PROFILE:
        return await this.handlePremiumConfirmCvProfileState(userId, text);

      case ConversationState.PREMIUM_DIAGNOSIS:
        return await this.handlePremiumDiagnosisState(userId);

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
   * Retorna null si no aplica o si el mensaje parece ser una respuesta valida.
   */
  private async tryHandleOutOfFlow(
    userId: string,
    text: string,
    currentState: string,
    intent: UserIntent,
  ): Promise<BotReply | null> {
    const interactiveStates = new Set<string>([
      ConversationState.LEAD_COLLECT_PROFILE,
      ConversationState.LEAD_ASK_LOCATION,
      ConversationState.LEAD_ASK_EXPERIENCE,
      ConversationState.LEAD_SHOW_FIRST_VACANCY,
      ConversationState.LEAD_WAIT_INTEREST,
      ConversationState.LEAD_WAIT_REJECTION_REASON,
      ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT,
      ConversationState.LEAD_REGISTER_NAME,
      ConversationState.LEAD_REGISTER_EMAIL,
      ConversationState.LEAD_TERMS_CONSENT,
      ConversationState.WA_ASK_NAME,
      ConversationState.WA_ASK_EMAIL,
      ConversationState.ASK_TERMS,
      ConversationState.PREMIUM_ASK_CV,
      ConversationState.PREMIUM_WAITING_CV_FILE,
      ConversationState.PREMIUM_PROCESSING_CV,
      ConversationState.PREMIUM_CONFIRM_CV_PROFILE,
      ConversationState.PREMIUM_DIAGNOSIS,
      ConversationState.ASK_ROLE,
      ConversationState.ASK_EXPERIENCE,
      ConversationState.ASK_LOCATION,
      ConversationState.OFFER_ALERTS,
      ConversationState.ASK_ALERT_TIME,
      ConversationState.CONFIRM_RESTART,
      ConversationState.CONFIRM_CANCEL_SERVICE,
      ConversationState.EDITING_PROFILE,
      ConversationState.EDIT_ROLE,
      ConversationState.EDIT_EXPERIENCE,
      ConversationState.EDIT_LOCATION,
      ConversationState.EDIT_ALERT_TIME,
      ConversationState.ASK_EMAIL,
      ConversationState.WAITING_PAYMENT,
      ConversationState.FREEMIUM_EXPIRED,
      ConversationState.READY,
    ]);

    if (!interactiveStates.has(currentState)) return null;
    if (this.isCriticalCommandBeforeAi(text, intent)) return null;
    if (this.isLikelyValidAnswerForState(currentState, text, intent)) return null;

    if (currentState === ConversationState.READY && this.shouldRedirectToEditFlow(text, intent)) {
      return await this.redirectReadyUserToEditFlow(userId);
    }

    const outOfFlow = await this.llmService.handleOutOfFlowMessage(text, currentState);
    if (outOfFlow?.isValidAnswer && outOfFlow.extractedAnswer) {
      const extracted = outOfFlow.extractedAnswer.trim();
      if (extracted.length > 0) {
        const extractedIntent = detectIntent(extracted);
        this.logger.log(`IA extrajo respuesta valida en ${currentState}: "${extracted}"`);
        return await this.handleStateTransition(userId, currentState, extracted, extractedIntent);
      }
    }

    const aiResponse = outOfFlow?.response
      || await this.llmService.generateConversationalResponse(text, currentState);
    const fallback = this.getOutOfFlowFallbackMessage(currentState);
    const message = this.normalizeConversationalMessage(aiResponse) || fallback;
    const conciseMessage = this.clampToMaxLines(message, 5);
    return await this.buildOutOfFlowReinforcementReply(userId, currentState, conciseMessage);
  }

  private normalizeConversationalMessage(message: string | null): string | null {
    if (!message) return null;

    let normalized = repairMojibakeText(message)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`/g, '')
      .replace(/\*{2,}/g, '*')
      .replace(/_{2,}/g, '_')
      .replace(/\s{3,}/g, '\n\n')
      .trim();

    const boldMarks = (normalized.match(/\*/g) || []).length;
    if (boldMarks % 2 !== 0) {
      normalized = normalized.replace(/\*/g, '');
    }

    const italicMarks = (normalized.match(/_/g) || []).length;
    if (italicMarks % 2 !== 0) {
      normalized = normalized.replace(/_/g, '');
    }

    normalized = normalized
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return normalized;
  }

  private clampToMaxLines(message: string, maxLines: number): string {
    const normalizedLines = message
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (normalizedLines.length <= maxLines) {
      return normalizedLines.join('\n');
    }

    return normalizedLines.slice(0, maxLines).join('\n');
  }

  private isCriticalCommandBeforeAi(text: string, intent: UserIntent): boolean {
    if (intent === UserIntent.SEARCH_NOW) return true;
    if (intent === UserIntent.UPLOAD_CV) return true;
    if (isEditIntent(text) || isRestartIntent(text) || isCancelServiceIntent(text)) return true;

    const normalized = this.normalizeLeadSignalToken(text);
    const criticalPatterns = [
      'buscar',
      'editar',
      'reiniciar',
      'cancelar servicio',
      'cancelar suscripcion',
      'verificar',
      'quiero pagar',
      'cmd_buscar',
      'cmd_editar',
      'cmd_reiniciar',
      'cmd_cancelar',
      'cmd_adjuntar_hv',
      'cmd_verificar',
      'cmd_pagar',
      'cmd_ofertas',
      'ver ofertas',
      'adjuntar hv',
      'adjuntar_hv',
    ];

    return criticalPatterns.some((pattern) => normalized.includes(pattern));
  }

  private async tryHandleGlobalSearchNowOverride(
    userId: string,
    currentState: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply | null> {
    if (intent !== UserIntent.SEARCH_NOW) return null;
    if (currentState === ConversationState.READY) return null;

    this.logger.log(
      `Comando de busqueda detectado en estado ${currentState}. Se cancela el flujo activo y se redirige a READY.`,
    );

    await this.updateSessionState(userId, ConversationState.READY);
    return await this.handleReadyState(userId, text, UserIntent.SEARCH_NOW);
  }

  private isLikelyValidAnswerForState(
    currentState: string,
    text: string,
    intent: UserIntent,
  ): boolean {
    const normalized = this.normalizeLeadSignalToken(text);
    const trimmed = text.trim();
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.toLowerCase());
    const hasName = trimmed.length >= 2 && trimmed.length <= 50 && /[a-zA-Z\u00C0-\u017F]/.test(trimmed);

    if (currentState === ConversationState.EDITING_PROFILE) {
      return Boolean(detectEditField(text)) || normalized === 'cancelar';
    }

    if (currentState === ConversationState.LEAD_WAIT_INTEREST) {
      // normalized elimina diacríticos, entonces "interesó" → "intereso"
      return normalized === 'lead_interest_yes'
        || normalized === 'lead_interest_no'
        || isAcceptance(text)
        || isRejection(text)
        || normalized.includes('me intereso');
    }

    if (currentState === ConversationState.LEAD_WAIT_REJECTION_REASON) {
      const reasonIds = new Set([
        'reason_role',
        'reason_location',
        'reason_company',
        'reason_salary',
        'reason_remote',
        'reason_other',
        'cargo',
        'ciudad',
        'empresa',
        'salario',
        'remoto',
        'otro motivo',
      ]);
      return reasonIds.has(normalized) || this.resolveLeadRejectionReason(text) !== 'other';
    }

    if (currentState === ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT) {
      return trimmed.length >= 3;
    }

    if (currentState === ConversationState.PREMIUM_ASK_CV) {
      return isAcceptance(text)
        || isRejection(text)
        || intent === UserIntent.UPLOAD_CV
        || normalized === 'premium_cv_yes'
        || normalized === 'premium_cv_no';
    }

    if (currentState === ConversationState.PREMIUM_WAITING_CV_FILE) {
      return isRejection(text)
        || intent === UserIntent.UPLOAD_CV
        || normalized === 'premium_cv_skip_manual'
        || normalized === 'premium_cv_back_menu'
        || normalized === 'volver al menu'
        || normalized.includes('cv')
        || normalized.includes('hoja de vida')
        || normalized.includes('curriculum');
    }

    if (currentState === ConversationState.PREMIUM_CONFIRM_CV_PROFILE) {
      return isAcceptance(text)
        || isRejection(text)
        || normalized === 'premium_cv_confirm'
        || normalized === 'premium_cv_manual';
    }

    if (currentState === ConversationState.PREMIUM_PROCESSING_CV) {
      return true;
    }

    if (currentState === ConversationState.PREMIUM_DIAGNOSIS) {
      return true;
    }

    if (currentState === ConversationState.LEAD_ASK_EXPERIENCE
      || currentState === ConversationState.ASK_EXPERIENCE
      || currentState === ConversationState.EDIT_EXPERIENCE) {
      return Boolean(normalizeExperienceLevel(text)) || normalized.startsWith('exp_');
    }

    if (currentState === ConversationState.LEAD_ASK_LOCATION
      || currentState === ConversationState.ASK_LOCATION
      || currentState === ConversationState.EDIT_LOCATION) {
      const locationValidation = validateAndNormalizeLocation(text);
      return locationValidation.isValid
        || extractNormalizedLocations(text).length > 0
        || normalized.includes('remoto')
        || normalized.includes('remote');
    }

    if (currentState === ConversationState.LEAD_COLLECT_PROFILE
      || currentState === ConversationState.ASK_ROLE
      || currentState === ConversationState.EDIT_ROLE) {
      return Boolean(normalizeRole(text)) && !isNonRoleInput(text);
    }

    if (currentState === ConversationState.LEAD_REGISTER_EMAIL
      || currentState === ConversationState.WA_ASK_EMAIL
      || currentState === ConversationState.ASK_EMAIL
      || currentState === ConversationState.WAITING_PAYMENT) {
      return hasEmail;
    }

    // En estado EDITING_PROFILE, toda respuesta es valida (seleccion de campo a editar)
    if (currentState === ConversationState.EDITING_PROFILE) {
      return true;
    }

    if (currentState === ConversationState.LEAD_REGISTER_NAME
      || currentState === ConversationState.WA_ASK_NAME) {
      return hasName;
    }

    if (currentState === ConversationState.LEAD_TERMS_CONSENT
      || currentState === ConversationState.ASK_TERMS
      || currentState === ConversationState.CONFIRM_RESTART
      || currentState === ConversationState.CONFIRM_CANCEL_SERVICE
      || currentState === ConversationState.OFFER_ALERTS) {
      return isAcceptance(text)
        || isRejection(text)
        || normalized === 'lead_terms_accept'
        || normalized === 'lead_terms_reject'
        || normalized === 'confirm_restart'
        || normalized === 'cancel_restart'
        || normalized === 'confirm_cancel'
        || normalized === 'abort_cancel'
        || normalized === 'accept_alerts'
        || normalized === 'reject_alerts';
    }

    if (currentState === ConversationState.ASK_ALERT_TIME || currentState === ConversationState.EDIT_ALERT_TIME) {
      return Boolean(normalizeTime(text));
    }

    return false;
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

  private getOutOfFlowFallbackMessage(currentState: string): string {
    const prompts: Record<string, string> = {
      [ConversationState.LEAD_COLLECT_PROFILE]: 'Entiendo. Para continuar, dime el cargo o rol que buscas.',
      [ConversationState.LEAD_ASK_LOCATION]: 'Perfecto. Ahora dime una ciudad, país o si prefieres remoto.',
      [ConversationState.LEAD_ASK_EXPERIENCE]: 'Para continuar, selecciona tu nivel de experiencia.',
      [ConversationState.LEAD_SHOW_FIRST_VACANCY]: 'Estoy ajustando tu siguiente oferta. Un momento y te la comparto.',
      [ConversationState.LEAD_WAIT_INTEREST]: 'Para continuar, elige: "Sí, me interesó" o "No me interesó".',
      [ConversationState.LEAD_WAIT_REJECTION_REASON]: 'Elige un motivo principal para ajustar la siguiente oferta.',
      [ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT]: 'Cuéntame en una frase por qué no te interesó esta oferta.',
      [ConversationState.LEAD_REGISTER_NAME]: 'Para continuar con el registro, escríbeme tu nombre completo.',
      [ConversationState.LEAD_REGISTER_EMAIL]: 'Ahora necesito tu correo para completar el registro.',
      [ConversationState.LEAD_TERMS_CONSENT]: 'Para activar tu prueba, elige Acepto o No acepto.',
      [ConversationState.PREMIUM_ASK_CV]: 'Responde si tienes hoja de vida para leerla ahora.',
      [ConversationState.PREMIUM_WAITING_CV_FILE]: 'Envia tu hoja de vida en PDF, Word o foto para continuar.',
      [ConversationState.PREMIUM_PROCESSING_CV]: 'Estoy procesando tu hoja de vida. Dame un momento.',
      [ConversationState.PREMIUM_CONFIRM_CV_PROFILE]: 'Confirma si seguimos con el perfil detectado de tu hoja de vida.',
      [ConversationState.PREMIUM_DIAGNOSIS]: 'Estoy preparando tu oferta de diagnostico premium.',
      [ConversationState.ASK_ROLE]: 'Para continuar, dime tu cargo o rol principal.',
      [ConversationState.ASK_LOCATION]: 'Para continuar, escribe una sola ubicación (ciudad o país).',
      [ConversationState.ASK_EXPERIENCE]: 'Selecciona tu nivel de experiencia para continuar.',
      [ConversationState.OFFER_ALERTS]: 'Elige si quieres activar alertas diarias.',
      [ConversationState.ASK_ALERT_TIME]: 'Escribe la hora en que quieres recibir alertas.',
      [ConversationState.CONFIRM_RESTART]: 'Para confirmar, responde "Sí, reiniciar" o "No, cancelar".',
      [ConversationState.CONFIRM_CANCEL_SERVICE]: 'Para confirmar, responde "Sí, confirmar" o "No, continuar".',
      [ConversationState.EDITING_PROFILE]: 'Para continuar, elige qué campo quieres editar.',
      [ConversationState.EDIT_ROLE]: 'Escribe el nuevo cargo o rol que quieres usar.',
      [ConversationState.EDIT_EXPERIENCE]: 'Selecciona tu nuevo nivel de experiencia.',
      [ConversationState.EDIT_LOCATION]: 'Escribe la nueva ubicación (ciudad o país).',
      [ConversationState.EDIT_ALERT_TIME]: 'Escribe la nueva hora para tus alertas.',
      [ConversationState.READY]: 'Puedes buscar ofertas, editar perfil, reiniciar o cancelar servicio.',
      [ConversationState.ASK_EMAIL]: 'Escribe el correo con el que realizaste el pago.',
      [ConversationState.WAITING_PAYMENT]: 'Escribe el correo de pago o selecciona verificar pago.',
      [ConversationState.FREEMIUM_EXPIRED]: 'Puedes activar Premium o Pro para continuar.',
    };

    return prompts[currentState] || 'Entiendo. Sigamos en este paso para poder ayudarte mejor.';
  }

  private async buildOutOfFlowReinforcementReply(
    userId: string,
    currentState: string,
    message: string,
  ): Promise<BotReply> {
    if (currentState === ConversationState.EDITING_PROFILE) {
      const editReply = await this.showProfileForEditing(userId);
      return {
        ...editReply,
        text: `${message}\n\n${editReply.text}`,
      };
    }

    if (currentState === ConversationState.LEAD_ASK_EXPERIENCE) {
      return {
        text: message,
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    if (currentState === ConversationState.PREMIUM_ASK_CV) {
      return {
        text: message,
        buttons: [
          { id: 'premium_cv_yes', title: 'Si tengo CV' },
          { id: 'premium_cv_no', title: 'No tengo CV' },
        ],
      };
    }

    if (currentState === ConversationState.PREMIUM_WAITING_CV_FILE) {
      const buttons = await this.getPremiumCvWaitingButtons(userId);
      return {
        text: message,
        buttons,
      };
    }

    if (currentState === ConversationState.PREMIUM_CONFIRM_CV_PROFILE) {
      return {
        text: message,
        buttons: [
          { id: 'premium_cv_confirm', title: 'Si, continuar' },
          { id: 'premium_cv_manual', title: 'Ajustar manual' },
        ],
      };
    }

    if (currentState === ConversationState.LEAD_WAIT_INTEREST) {
      return {
        text: message,
        buttons: [
          { id: 'lead_interest_yes', title: 'Sí, me interesó' },
          { id: 'lead_interest_no', title: 'No me interesó' },
        ],
      };
    }

    if (currentState === ConversationState.LEAD_WAIT_REJECTION_REASON) {
      return {
        text: message,
        listTitle: 'Elegir motivo',
        listSections: [
          {
            title: 'Motivo principal',
            rows: [
              { id: 'reason_role', title: 'Cargo' },
              { id: 'reason_location', title: 'Ciudad' },
              { id: 'reason_company', title: 'Empresa' },
              { id: 'reason_salary', title: 'Salario' },
              { id: 'reason_remote', title: 'Remoto' },
              { id: 'reason_other', title: 'Otro motivo' },
            ],
          },
        ],
      };
    }

    if (currentState === ConversationState.LEAD_TERMS_CONSENT) {
      const termsReply = this.buildLeadTermsConsentReply();
      return { ...termsReply, text: message };
    }

    if (currentState === ConversationState.OFFER_ALERTS) {
      return {
        text: message,
        buttons: [
          { id: 'accept_alerts', title: 'Sí, activar' },
          { id: 'reject_alerts', title: 'No, gracias' },
        ],
      };
    }

    if (currentState === ConversationState.CONFIRM_RESTART) {
      return {
        text: message,
        buttons: [
          { id: 'confirm_restart', title: 'Sí, reiniciar' },
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    if (currentState === ConversationState.CONFIRM_CANCEL_SERVICE) {
      return {
        text: message,
        buttons: [
          { id: 'confirm_cancel', title: 'Sí, confirmar' },
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    return { text: message };
  }

  private shouldRedirectToEditFlow(text: string, intent: UserIntent): boolean {
    if (isEditIntent(text)) return true;
    if (intent === UserIntent.CHANGE_PREFERENCES) return true;
    return isPreferenceUpdateIntent(text);
  }

  private isAttachHvCommand(text: string): boolean {
    const normalized = this.normalizeLeadSignalToken(text);
    return normalized === 'adjuntar hv'
      || normalized === 'adjuntar_hv'
      || normalized === 'cmd_adjuntar_hv'
      || normalized.includes('adjuntar hoja de vida')
      || normalized.includes('adjuntar hv');
  }

  private async isPremiumPlanActiveForUser(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });
    return this.isPaidPlanActive(subscription);
  }

  private async buildMainMenuRows(
    userId: string,
    options?: {
      searchDescription?: string;
      restartDescription?: string;
      cancelDescription?: string;
    },
  ): Promise<Array<{ id: string; title: string; description: string }>> {
    const rows: Array<{ id: string; title: string; description: string }> = [
      {
        id: 'cmd_buscar',
        title: 'Buscar empleos',
        description: options?.searchDescription || 'Encontrar ofertas ahora',
      },
      {
        id: 'cmd_editar',
        title: 'Editar perfil',
        description: 'Cambiar tus preferencias',
      },
      {
        id: 'cmd_reiniciar',
        title: 'Reiniciar',
        description: options?.restartDescription || 'Reconfigurar desde cero',
      },
      {
        id: 'cmd_cancelar',
        title: 'Cancelar servicio',
        description: options?.cancelDescription || 'Dejar de usar el servicio',
      },
    ];

    if (await this.isPremiumPlanActiveForUser(userId)) {
      rows.push({
        id: 'cmd_adjuntar_hv',
        title: 'Adjuntar HV',
        description: 'Enviar hoja de vida',
      });
    }

    return rows;
  }

  private async getPremiumCvWaitingButtons(
    userId: string,
  ): Promise<Array<{ id: string; title: string }>> {
    const sessionData = await this.getLatestSessionData(userId);
    const isFromReadyMenu = sessionData.premiumCvEntryPoint === 'ready_menu';

    if (isFromReadyMenu) {
      return [{ id: 'premium_cv_back_menu', title: 'Volver al menu' }];
    }

    return [{ id: 'premium_cv_skip_manual', title: 'Seguir sin CV' }];
  }

  private async startPremiumAttachHvFromReady(userId: string): Promise<BotReply> {
    await this.updateSessionData(userId, {
      premiumOnboardingMode: 'cv',
      premiumCvEntryPoint: 'ready_menu',
    });
    await this.updateSessionState(userId, ConversationState.PREMIUM_WAITING_CV_FILE);

    return {
      text: BotMessages.PREMIUM_WAITING_CV_FILE,
      buttons: await this.getPremiumCvWaitingButtons(userId),
    };
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
      ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT,
      ConversationState.LEAD_REGISTER_NAME,
      ConversationState.LEAD_REGISTER_EMAIL,
      ConversationState.LEAD_TERMS_CONSENT,
    ];

    return v2States.includes(state as ConversationState);
  }

  private isV2PreRegistrationSupportState(state: string): boolean {
    const supportStates: ConversationState[] = [
      ConversationState.EDITING_PROFILE,
      ConversationState.EDIT_ROLE,
      ConversationState.EDIT_EXPERIENCE,
      ConversationState.EDIT_LOCATION,
      ConversationState.EDIT_ALERT_TIME,
      ConversationState.CONFIRM_RESTART,
      ConversationState.CONFIRM_CANCEL_SERVICE,
      ConversationState.READY,
    ];

    return supportStates.includes(state as ConversationState);
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
            title: 'Lead/Expert (7+ a\u00F1os)',
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


  private extractMultipleLocationChoices(text: string): string[] {
    return extractNormalizedLocations(text).slice(0, 5);
  }

  private buildSingleLocationChoiceMessage(choices: string[]): string {
    if (choices.length === 0) {
      return `Escribe solo una ubicación por búsqueda.`;
    }

    const options = choices.map((choice) => `- ${choice}`).join('\n');
    return `Veo que escribiste varias ubicaciones. Para continuar, elige solo una:\n\n${options}\n\nEscríbela de nuevo exactamente como la prefieres.`;
  }

  private toRoleTitleCase(value: string): string {
    const lowercaseWords = new Set([
      'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'con', 'por', 'a', 'al',
    ]);

    return value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        const clean = word.toLowerCase();
        if (index > 0 && lowercaseWords.has(clean)) {
          return clean;
        }
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      })
      .join(' ');
  }

  private extractRoleChoicesFromText(text: string): string[] {
    const separatorPattern = /\/|,|;|\||\s-\s|\s+y\/o\s+|\s+tambien\s+podria\s+ser\s+|\s+tambien\s+quiero\s+ser\s+|\s+tambien\s+como\s+|\s+o\s+tambien\s+|\s+ademas\s+de\s+|\s+tambien\s+|\s+\b(?:y|o|u|or|and)\b\s+/i;
    const hasExplicitRoleSeparators = separatorPattern.test(text);
    if (!hasExplicitRoleSeparators) return [];

    const rawParts = text
      .replace(/\n+/g, ' ')
      .split(new RegExp(separatorPattern.source, 'gi'))
      .map((part) => part.trim())
      .filter(Boolean);

    const ignoredPatterns = [
      /\b(remoto|remote|home office|teletrabajo)\b/i,
      /\b(ciudad|pais|pa[íi]s|ubicaci[oó]n|location)\b/i,
      /\b(bogot|medell|cali|lima|miami|madrid|oporto|mexico|m[eé]xico|colombia|argentina|peru|per[uú]|chile|espa[nñ]a|portugal|estados unidos|usa|canada|canad[aá])\b/i,
    ];

    const cleaned = rawParts
      .map((part) => part
        .replace(/^(\s)*(quiero|busco|me interesa|trabajar como|trabajo como|cargo|rol|puesto|profesi[oó]n|profesion)\s+/i, '')
        .replace(/\b(en|desde|para)\b.*$/i, '')
        .replace(/[()"'`]/g, '')
        .trim())
      .filter((part) => part.length >= 3)
      .filter((part) => !/^\d+$/.test(part))
      .filter((part) => !ignoredPatterns.some((pattern) => pattern.test(part)))
      .map((part) => this.toRoleTitleCase(part));

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const item of cleaned) {
      const key = this.normalizeLeadSignalToken(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return unique.slice(0, 5);
  }

  private buildSingleRoleChoiceMessage(choices: string[]): string {
    if (!choices.length) {
      return `Para continuar, escribe solo un cargo principal (por ejemplo: *Analista de Datos*).`;
    }
    const bulletList = choices.map((choice) => `- ${choice}`).join('\n');
    return `Veo que mencionaste varios cargos. Para obtener mejores resultados, elige solo uno:\n\n${bulletList}\n\nEscríbeme el cargo que quieres priorizar.`;
  }

  private isGenericSingleWordRole(role: string): boolean {
    const normalized = this.normalizeLeadSignalToken(role);
    if (!normalized || normalized.includes(' ')) return false;

    const genericRoles = new Set([
      'auxiliar',
      'analista',
      'ingeniero',
      'director',
      'gerente',
      'administrador',
      'asesor',
      'coordinador',
      'operario',
      'tecnico',
      'profesional',
    ]);

    return genericRoles.has(normalized);
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

    const roleChoices = this.extractRoleChoicesFromText(text);
    const inferredRole = roleChoices.length > 1 ? null : extracted.role?.trim() || null;

    return {
      role: inferredRole,
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
    const roleChoicesFromText = this.extractRoleChoicesFromText(text);
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

    if (roleChoicesFromText.length > 1) {
      // Solo usar regex como fallback si la IA no produjo un warning mejor
      if (!roleWarning) {
        roleWarning = this.buildSingleRoleChoiceMessage(roleChoicesFromText);
      }
      roleCandidate = null;
    }

    if (roleCandidate && this.isGenericSingleWordRole(roleCandidate)) {
      roleWarning = `Tu cargo es muy general. Para que la búsqueda sea precisa, escribe una especialidad.\n\nEjemplo: *Auxiliar Administrativo*, *Analista de Datos* o *Ingeniero Industrial*.`;
      roleCandidate = null;
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
      // Siempre intentar respuesta conversacional primero — maneja confusión, preguntas, hesitación
      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.LEAD_COLLECT_PROFILE,
      );
      const conversationalText = this.normalizeConversationalMessage(conversational);
      if (conversationalText) {
        return { text: conversationalText };
      }

      // Fallback: si el LLM no está disponible, usar warning de validación o hints de perfil
      if (roleWarning) {
        return { text: roleWarning };
      }

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
          text: `Perfecto, ya tomé parte de tu info. Ahora dime *solo el cargo o rol* que estás buscando.`,
        };
      }

      return { text: BotMessages.ERROR_ROLE_INVALID };
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
      // Intentar respuesta conversacional antes del error estático
      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.LEAD_ASK_LOCATION,
      );
      return {
        text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_LOCATION_INVALID,
      };
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
        text: this.normalizeConversationalMessage(
          await this.llmService.generateConversationalResponse(
            text,
            ConversationState.LEAD_ASK_EXPERIENCE,
          ),
        ) || 'Selecciona tu nivel de experiencia:',
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    await this.updateUserProfile(userId, { experienceLevel });
    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    return await this.handleLeadShowFirstVacancyState(userId);
  }

  private buildLeadVacancyMessage(job: JobPosting): string {
    return this.buildFreemiumV2SingleVacancyMessage(job);
  }

  private buildFreemiumV2SingleVacancyLeadInMessage(): string {
    return 'Listo, mira la siguiente oferta y dime si te interesa para enviarte similares:';
  }

  private buildFreemiumV2SingleVacancyMessage(job: Partial<JobPosting>): string {
    const company = job?.company || 'una empresa';
    const title = job?.title || 'un cargo';
    const location = job?.locationRaw || 'una ubicación sin especificar';
    const cleanUrl = this.jobSearchService.cleanJobUrl(job?.url || '');

    return `${company} está buscando *${title}* en ${location}.\n\nPosteado en:\n${cleanUrl}`;
  }

  private buildReadySearchSingleVacancyMessage(job: JobPosting): string {
    const company = job?.company || 'Empresa confidencial';
    const title = job?.title || 'Vacante disponible';
    const location = job?.locationRaw || 'Ubicación por confirmar';
    const source = job?.source || 'portal de empleo';
    const cleanUrl = this.jobSearchService.cleanJobUrl(job?.url || '');

    let snippet = (job?.snippet || '').trim();
    if (snippet.length > 220) {
      snippet = `${snippet.slice(0, 217)}...`;
    }

    const summary = snippet || 'Esta vacante puede encajar con tu perfil.';

    return `Te comparto una vacante que se ajusta a tu perfil:\n\n*${title}*\nEmpresa: ${company}\nUbicación: ${location}\nFuente: ${source}\n\n${summary}\n\n${cleanUrl}`;
  }

  private mergeUniqueJobsByUrl(jobs: JobPosting[]): JobPosting[] {
    const unique = new Map<string, JobPosting>();

    for (const job of jobs) {
      const cleanedUrl = this.jobSearchService.cleanJobUrl(job.url || '').trim().toLowerCase();
      const fallbackKey = `${(job.title || '').trim().toLowerCase()}::${(job.company || '').trim().toLowerCase()}::${(job.locationRaw || '').trim().toLowerCase()}`;
      const key = cleanedUrl || fallbackKey;

      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, job);
        continue;
      }

      const existingScore = typeof existing.score === 'number' ? existing.score : -1;
      const candidateScore = typeof job.score === 'number' ? job.score : -1;
      if (candidateScore > existingScore) {
        unique.set(key, job);
      }
    }

    return Array.from(unique.values());
  }

  private async rerankPremiumJobsWithAi(
    userId: string,
    jobs: JobPosting[],
    maxResults: number,
  ): Promise<JobPosting[]> {
    if (jobs.length <= 1) return jobs.slice(0, maxResults);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true, location: true, experienceLevel: true },
    });

    const rerank = await this.llmService.rerankPremiumJobs({
      role: profile?.role || null,
      location: profile?.location || null,
      experienceLevel: profile?.experienceLevel || null,
      jobs: jobs.slice(0, 15).map((job) => ({
        title: job.title,
        company: job.company || null,
        locationRaw: job.locationRaw || null,
        source: job.source || null,
        snippet: job.snippet || null,
        score: typeof job.score === 'number' ? job.score : null,
      })),
    });

    if (!rerank || rerank.orderedIndexes.length === 0) {
      return jobs.slice(0, maxResults);
    }

    const ordered: JobPosting[] = [];
    for (const index of rerank.orderedIndexes) {
      if (index >= 0 && index < jobs.length) {
        ordered.push(jobs[index]);
      }
    }

    const mergedOrdered = this.mergeUniqueJobsByUrl(ordered);
    return mergedOrdered.slice(0, maxResults);
  }

  private async refinePremiumSearchResultWithAi(
    userId: string,
    initialResult: JobSearchResult,
    maxResults: number,
  ): Promise<JobSearchResult> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true, location: true, experienceLevel: true },
    });

    const decision = await this.llmService.shouldFetchMorePremiumJobs({
      role: profile?.role || null,
      location: profile?.location || null,
      experienceLevel: profile?.experienceLevel || null,
      jobs: initialResult.jobs.slice(0, 10).map((job) => ({
        title: job.title,
        company: job.company || null,
        locationRaw: job.locationRaw || null,
        source: job.source || null,
        score: typeof job.score === 'number' ? job.score : null,
      })),
      targetResults: maxResults,
      offersExhausted: initialResult.offersExhausted === true,
    });

    if (decision?.shouldFetchMore && !initialResult.offersExhausted) {
      this.logger.log(
        `IA sugiere ampliar busqueda premium para ${userId} (confidence=${decision.confidence.toFixed(2)}), pero se mantiene una sola busqueda por solicitud.`,
      );
    }

    const reranked = await this.rerankPremiumJobsWithAi(userId, [...initialResult.jobs], maxResults);
    return {
      ...initialResult,
      jobs: reranked,
    };
  }

  private async refineFreeSearchResultWithAi(
    userId: string,
    initialResult: JobSearchResult,
    maxResults: number,
  ): Promise<JobSearchResult> {
    const reranked = await this.rerankPremiumJobsWithAi(userId, [...initialResult.jobs], maxResults);
    return {
      ...initialResult,
      jobs: reranked,
    };
  }

  private normalizeLeadTextForComparison(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  }

  private async getLatestSessionData(userId: string): Promise<Record<string, any>> {
    const session = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    });

    return (session?.data as Record<string, any>) || {};
  }

  private getPreRegistrationSearchesUsed(sessionData: Record<string, any> | null | undefined): number {
    const value = sessionData?.preRegistrationSearchesUsed;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    if (value < 0) return 0;
    return Math.floor(value);
  }

  private buildLeadVacancySnapshot(job: Partial<JobPosting> | null | undefined) {
    if (!job) return null;
    return {
      title: job.title || null,
      company: job.company || null,
      locationRaw: job.locationRaw || null,
      salaryRaw: job.salaryRaw || null,
      source: job.source || null,
      url: job.url || null,
      score: typeof job.score === 'number' ? job.score : null,
    };
  }

  private async getLeadReuseCandidatesFromCache(userId: string, limit: number): Promise<Array<{
    title?: string | null;
    company?: string | null;
    locationRaw?: string | null;
    salaryRaw?: string | null;
    source?: string | null;
    score?: number | null;
  }>> {
    const sessionData = await this.getLatestSessionData(userId);
    const cachedJobs = Array.isArray(sessionData?.jobSearchCache?.cachedJobs)
      ? sessionData.jobSearchCache.cachedJobs
      : [];

    return cachedJobs
      .slice(0, limit)
      .map((job: any) => ({
        title: job?.title || null,
        company: job?.company || null,
        locationRaw: job?.locationRaw || null,
        salaryRaw: job?.salaryRaw || null,
        source: job?.source || null,
        score: typeof job?.score === 'number' ? job.score : null,
      }));
  }

  private calculateLeadReuseHeuristic(
    reason: LeadRejectionReason,
    rejectedVacancy: Record<string, any> | null,
    candidateVacancies: Array<Record<string, any>>,
  ): number {
    if (candidateVacancies.length === 0) return 0;

    let score = 0.55;
    const firstCandidate = candidateVacancies[0];
    const rejectedCompany = this.normalizeLeadTextForComparison(rejectedVacancy?.company);
    const candidateCompany = this.normalizeLeadTextForComparison(firstCandidate?.company);

    if (reason === 'company') {
      score += rejectedCompany && candidateCompany && rejectedCompany !== candidateCompany ? 0.28 : -0.22;
    } else if (reason === 'salary') {
      const withSalary = candidateVacancies.filter((job) => Boolean(job?.salaryRaw)).length;
      score += withSalary > 0 ? 0.16 : -0.12;
    } else if (reason === 'other') {
      score += 0.05;
    } else if (reason === 'remote') {
      score -= 0.1;
    }

    if (candidateVacancies.length >= 2) {
      score += 0.05;
    }

    const rejectedTitle = this.normalizeLeadTextForComparison(rejectedVacancy?.title);
    const candidateTitle = this.normalizeLeadTextForComparison(firstCandidate?.title);
    if (rejectedTitle && candidateTitle && rejectedTitle === candidateTitle) {
      score -= 0.08;
    }

    return Math.min(1, Math.max(0, score));
  }

  private async scoreLeadReuse(
    userId: string,
    reason: LeadRejectionReason,
    candidateVacancies: Array<{
      title?: string | null;
      company?: string | null;
      locationRaw?: string | null;
      salaryRaw?: string | null;
      source?: string | null;
      score?: number | null;
    }>,
  ): Promise<{ score: number; scoreSource: 'ai' | 'heuristic'; rationale: string }> {
    const sessionData = await this.getLatestSessionData(userId);
    const rejectedVacancy = (sessionData?.leadCurrentVacancy as Record<string, any>) || null;

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        role: true,
        location: true,
        experienceLevel: true,
      },
    });

    const aiScore = await this.llmService.scoreVacancyReuse({
      rejectionReason: reason,
      userProfile: {
        role: profile?.role || null,
        location: profile?.location || null,
        experienceLevel: profile?.experienceLevel || null,
      },
      rejectedVacancy: {
        title: rejectedVacancy?.title || null,
        company: rejectedVacancy?.company || null,
        locationRaw: rejectedVacancy?.locationRaw || null,
        salaryRaw: rejectedVacancy?.salaryRaw || null,
        source: rejectedVacancy?.source || null,
      },
      candidateVacancies,
    });

    if (aiScore) {
      return {
        score: aiScore.reuseScore,
        scoreSource: 'ai',
        rationale: aiScore.rationale || '',
      };
    }

    const heuristic = this.calculateLeadReuseHeuristic(reason, rejectedVacancy, candidateVacancies);
    return {
      score: heuristic,
      scoreSource: 'heuristic',
      rationale: 'Score heuristico por fallback local (LLM no disponible).',
    };
  }

  private async decideLeadVacancyStrategy(
    userId: string,
    reason: LeadRejectionReason,
  ): Promise<{
    searchMode: LeadVacancySearchMode;
    score: number;
    scoreSource: 'ai' | 'heuristic' | 'no_candidates';
    rationale: string;
    candidatesEvaluated: number;
  }> {
    const candidates = await this.getLeadReuseCandidatesFromCache(userId, this.leadReuseCandidateLimit);
    if (candidates.length === 0) {
      return {
        searchMode: 'force_fresh',
        score: 0,
        scoreSource: 'no_candidates',
        rationale: 'No hay candidatas en cache para reutilizar.',
        candidatesEvaluated: 0,
      };
    }

    const scored = await this.scoreLeadReuse(userId, reason, candidates);
    const searchMode: LeadVacancySearchMode =
      scored.score >= this.leadReuseScoreThreshold ? 'reuse_cache' : 'force_fresh';

    this.logger.log(
      `🎯 Decisión de vacante V2 para ${userId}: mode=${searchMode}, score=${scored.score.toFixed(2)}, source=${scored.scoreSource}, candidates=${candidates.length}`
    );

    return {
      searchMode,
      score: scored.score,
      scoreSource: scored.scoreSource,
      rationale: scored.rationale,
      candidatesEvaluated: candidates.length,
    };
  }

  private async searchLeadSingleVacancy(
    userId: string,
    searchMode: LeadVacancySearchMode,
  ): Promise<JobPosting | null> {
    const sessionData = await this.getLatestSessionData(userId);
    const excludedCompanies = Array.isArray(sessionData?.leadExcludedCompanies)
      ? sessionData.leadExcludedCompanies
        .filter((value: any) => typeof value === 'string')
        .map((value: string) => this.normalizeLeadSignalToken(value))
      : [];
    const shouldFetchBatch = excludedCompanies.length > 0;
    const maxResults = shouldFetchBatch ? Math.max(this.leadReuseCandidateLimit, 5) : 1;

    const result =
      searchMode === 'reuse_cache'
        ? await this.jobSearchService.searchJobsForUser(userId, maxResults, { cacheOnlyIfAvailable: true })
        : searchMode === 'force_fresh'
          ? await this.jobSearchService.searchJobsForUser(userId, maxResults, { forceFreshSearch: true })
          : await this.jobSearchService.searchJobsForUser(userId, maxResults);

    if (!result.jobs.length) return null;
    if (!excludedCompanies.length) return result.jobs[0] || null;

    const excludedSet = new Set(excludedCompanies);
    const filtered = result.jobs.find(
      (job) => !excludedSet.has(this.normalizeLeadSignalToken(job.company || '')),
    );
    return filtered || result.jobs[0] || null;
  }

  private async buildLeadNoVacancyFoundReply(userId: string): Promise<BotReply> {
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
      text: `No encontré ofertas para "${role}" en este momento.${suggestionsText}\n\nEscríbeme otro rol para intentarlo de nuevo.`,
    };
  }

  private async deliverLeadVacancy(
    userId: string,
    job: JobPosting,
    context: Record<string, any> = {},
  ): Promise<BotReply> {
    await this.jobSearchService.markJobsAsSent(userId, [job]);

    const sessionData = await this.getLatestSessionData(userId);
    const alreadyActivatedTrial = sessionData?.leadTrialActivated === true;
    const previousPreRegistrationSearchesUsed = this.getPreRegistrationSearchesUsed(sessionData);
    const nextPreRegistrationSearchesUsed = alreadyActivatedTrial
      ? previousPreRegistrationSearchesUsed
      : previousPreRegistrationSearchesUsed + 1;

    await this.updateSessionData(userId, {
      leadCurrentVacancy: this.buildLeadVacancySnapshot(job),
      leadVacancyDecision: {
        ...context,
        deliveredAt: new Date().toISOString(),
      },
      preRegistrationSearchesUsed: nextPreRegistrationSearchesUsed,
    });
    await this.updateSessionState(userId, ConversationState.LEAD_WAIT_INTEREST);

    return {
      preMessage: {
        text: this.buildFreemiumV2SingleVacancyLeadInMessage(),
      },
      text: this.buildLeadVacancyMessage(job),
      buttons: [
        { id: 'lead_interest_yes', title: 'Sí, me interesó' },
        { id: 'lead_interest_no', title: 'No me interesó' },
      ],
    };
  }

  private async handleLeadShowFirstVacancyState(
    userId: string,
    searchMode: LeadVacancySearchMode = 'default',
    context: Record<string, any> = {},
  ): Promise<BotReply> {
    try {
      let firstJob = await this.searchLeadSingleVacancy(userId, searchMode);

      if (!firstJob && searchMode === 'reuse_cache') {
        this.logger.log(`⚠️ Cache vacía para ${userId}; pasando a nueva búsqueda forzada`);
        firstJob = await this.searchLeadSingleVacancy(userId, 'force_fresh');
        searchMode = 'force_fresh';
      }

      if (!firstJob) {
        return await this.buildLeadNoVacancyFoundReply(userId);
      }

      const contextWithMode: Record<string, any> = {
        ...context,
        searchMode,
      };

      if (searchMode === 'force_fresh' && context?.recalculateReason) {
        const recalculated = await this.scoreLeadReuse(
          userId,
          context.recalculateReason as LeadRejectionReason,
          [
            {
              title: firstJob.title,
              company: firstJob.company || null,
              locationRaw: firstJob.locationRaw || null,
              salaryRaw: firstJob.salaryRaw || null,
              source: firstJob.source || null,
              score: typeof firstJob.score === 'number' ? firstJob.score : null,
            },
          ],
        );

        contextWithMode.freshScore = recalculated.score;
        contextWithMode.freshScoreSource = recalculated.scoreSource;
        contextWithMode.freshRationale = recalculated.rationale;

        if (recalculated.score < this.leadReuseScoreThreshold) {
          this.logger.log(
            `⚠️ Nueva búsqueda también quedó bajo umbral para ${userId} (score=${recalculated.score.toFixed(2)}). Se muestra la mejor coincidencia disponible.`,
          );
        }
      }

      return await this.deliverLeadVacancy(userId, firstJob, contextWithMode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error mostrando primera vacante V2 para ${userId}: ${errorMessage}`);

      // Diagnosticar la causa del error usando el perfil del usuario
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { role: true, location: true, experienceLevel: true },
      });

      const diagnosis = await this.llmService.diagnoseSearchFailure({
        errorMessage,
        role: profile?.role,
        location: profile?.location,
        experienceLevel: profile?.experienceLevel,
      });

      // Cambiar estado para que el usuario no quede atrapado en loop de busqueda
      await this.updateSessionState(userId, ConversationState.EDITING_PROFILE);

      // Mostrar menu de edicion directamente con mensaje de diagnostico
      const diagnosisMsg = diagnosis?.userMessage
        || 'No pude completar la busqueda. Revisa tus datos y corrige lo que sea necesario.';
      const editMenu = await this.showProfileForEditing(userId);
      return {
        ...editMenu,
        text: diagnosisMsg + '\n\n' + (editMenu.text || ''),
      };
    }
  }

  private resolveLeadRejectionReason(text: string): LeadRejectionReason {
    const normalized = this.normalizeLeadSignalToken(text);

    // Reconocer IDs de botón de lista directamente
    if (normalized === 'reason_role') return 'role';
    if (normalized === 'reason_location') return 'location';
    if (normalized === 'reason_company') return 'company';
    if (normalized === 'reason_salary') return 'salary';
    if (normalized === 'reason_remote') return 'remote';
    if (normalized === 'reason_other') return 'other';

    if (
      normalized.includes('experiencia')
      || normalized.includes('sin experiencia')
      || normalized.includes('junior')
      || normalized.includes('intermedio')
      || normalized.includes('senior')
      || normalized.includes('lead')
      || normalized.includes('expert')
      || /\b\d+\s*(ano|anos|año|años)\b/i.test(normalized)
    ) return 'experience';
    if (normalized.includes('cargo') || normalized.includes('rol') || normalized.includes('puesto')) return 'role';
    if (normalized.includes('ciudad') || normalized.includes('ubicacion') || normalized.includes('pais')) return 'location';
    if (normalized.includes('empresa')) return 'company';
    if (normalized.includes('salario') || normalized.includes('sueldo')) return 'salary';
    if (normalized.includes('remoto') || normalized.includes('remote') || normalized.includes('casa')) return 'remote';

    return 'other';
  }

  private normalizeLeadSignalToken(value: string | null | undefined): string {
    if (!value) return '';
    let text = value.toLowerCase();

    // Repara mojibake típico (ej: "Sí, me interesó")
    if (/[^\x00-\x7F]/.test(text)) {
      try {
        const repaired = Buffer.from(text, 'latin1').toString('utf8');
        if (repaired && !repaired.includes('\uFFFD')) {
          text = repaired;
        }
      } catch {
        // noop
      }
    }

    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  }

  private async persistLeadFeedback(
    userId: string,
    params: {
      interested: boolean;
      reason?: LeadRejectionReason | null;
      reasonText?: string | null;
      reasonSource?: LeadRejectionReasonSource;
      confidence?: number | null;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      const sessionData = await this.getLatestSessionData(userId);
      const vacancy = sessionData?.leadCurrentVacancy || null;
      const decision = sessionData?.leadVacancyDecision || null;

      await (this.prisma as any).leadVacancyFeedback.create({
        data: {
          userId,
          interested: params.interested,
          reason: params.reason || null,
          reasonText: params.reasonText || null,
          reasonSource: params.reasonSource || null,
          confidence: params.confidence ?? null,
          vacancy,
          metadata: {
            decision,
            ...(params.metadata || {}),
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`No se pudo guardar lead feedback para ${userId}: ${message}`);
    }
  }

  private async persistLeadSignalInSession(
    userId: string,
    params: {
      interested: boolean;
      reason?: LeadRejectionReason | null;
      reasonText?: string | null;
      reasonSource?: LeadRejectionReasonSource;
      confidence?: number | null;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    const sessionData = await this.getLatestSessionData(userId);
    const currentSignals = Array.isArray(sessionData.leadSignals) ? sessionData.leadSignals : [];
    const signal = {
      at: new Date().toISOString(),
      interested: params.interested,
      reason: params.reason || null,
      reasonText: params.reasonText || null,
      reasonSource: params.reasonSource || null,
      confidence: params.confidence ?? null,
      vacancy: sessionData?.leadCurrentVacancy || null,
      metadata: params.metadata || {},
    };

    const nextSignals = [...currentSignals.slice(-19), signal];
    await this.updateSessionData(userId, {
      leadSignals: nextSignals,
      leadLastSignal: signal,
      leadLastRejectionReason: params.interested ? null : (params.reason || null),
    });
  }

  private async applyLeadAdjustmentByReason(
    userId: string,
    reason: LeadRejectionReason,
    reasonText?: string | null,
  ): Promise<void> {
    if (reason === 'remote') {
      await this.updateUserProfile(userId, { location: 'Remoto' });
      return;
    }

    if (reason === 'company') {
      const sessionData = await this.getLatestSessionData(userId);
      const currentCompany = typeof sessionData?.leadCurrentVacancy?.company === 'string'
        ? sessionData.leadCurrentVacancy.company.trim()
        : '';
      if (!currentCompany) return;

      const existing = Array.isArray(sessionData?.leadExcludedCompanies)
        ? sessionData.leadExcludedCompanies.filter((value: any) => typeof value === 'string')
        : [];

      const normalizedCurrent = this.normalizeLeadSignalToken(currentCompany);
      const alreadyExists = existing.some(
        (value: string) => this.normalizeLeadSignalToken(value) === normalizedCurrent,
      );
      if (alreadyExists) return;

      await this.updateSessionData(userId, {
        leadExcludedCompanies: [...existing, currentCompany],
      });
      return;
    }

    if (reason === 'salary') {
      await this.updateSessionData(userId, {
        leadSalaryPreference: 'higher',
        leadSalaryFeedbackText: reasonText || null,
      });
    }
  }

  private async continueLeadAfterRejection(
    userId: string,
    reason: LeadRejectionReason,
    options?: {
      reasonText?: string;
      reasonSource?: LeadRejectionReasonSource;
      confidence?: number | null;
      metadata?: Record<string, any>;
    },
  ): Promise<BotReply> {
    await this.persistLeadFeedback(userId, {
      interested: false,
      reason,
      reasonText: options?.reasonText || null,
      reasonSource: options?.reasonSource || 'button',
      confidence: options?.confidence ?? null,
      metadata: options?.metadata,
    });
    await this.persistLeadSignalInSession(userId, {
      interested: false,
      reason,
      reasonText: options?.reasonText || null,
      reasonSource: options?.reasonSource || 'button',
      confidence: options?.confidence ?? null,
      metadata: options?.metadata,
    });

    await this.applyLeadAdjustmentByReason(userId, reason, options?.reasonText || null);

    if (reason === 'role') {
      await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
      return { text: 'Entendido. Dime el rol que quieres priorizar y ajusto la búsqueda.' };
    }

    if (reason === 'experience') {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_EXPERIENCE);
      return {
        text: `Entendido. Ajustemos tu nivel de experiencia para mejorar la siguiente oferta.`,
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    if (reason === 'location') {
      await this.updateSessionState(userId, ConversationState.LEAD_ASK_LOCATION);
      return { text: BotMessages.V2_ASK_LOCATION };
    }

    if (reason === 'remote') {
      await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
      const nextVacancyReply = await this.handleLeadShowFirstVacancyState(
        userId,
        'force_fresh',
        { rejectionReason: reason },
      );
      return {
        ...nextVacancyReply,
        text: `Gracias, sigo ajustando la búsqueda según tu perfil.\n\n${nextVacancyReply.text}`,
      };
    }

    if (reason === 'company' || reason === 'salary' || reason === 'other') {
      const decision = await this.decideLeadVacancyStrategy(userId, reason);
      await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);

      const nextVacancyReply = await this.handleLeadShowFirstVacancyState(
        userId,
        decision.searchMode,
        {
          rejectionReason: reason,
          decisionScore: decision.score,
          decisionSource: decision.scoreSource,
          decisionRationale: decision.rationale,
          decisionThreshold: this.leadReuseScoreThreshold,
          decisionCandidates: decision.candidatesEvaluated,
          recalculateReason: decision.searchMode === 'force_fresh' ? reason : undefined,
        },
      );

      return {
        ...nextVacancyReply,
        text: `Gracias, sigo ajustando la búsqueda según tu perfil.\n\n${nextVacancyReply.text}`,
      };
    }

    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    const nextVacancyReply = await this.handleLeadShowFirstVacancyState(userId);
    return {
      ...nextVacancyReply,
      text: `Gracias, sigo ajustando la búsqueda según tu perfil.\n\n${nextVacancyReply.text}`,
    };
  }

  private async handleLeadWaitInterestState(
    userId: string,
    text: string,
    _intent: UserIntent,
  ): Promise<BotReply> {
    const normalizedText = this.normalizeLeadSignalToken(text);

    // Verificar rechazo PRIMERO para evitar falsos positivos
    // normalizeLeadSignalToken elimina diacríticos, por eso "no me interesó" → "no me intereso"
    const isNegativeInterest =
      normalizedText === 'lead_interest_no'
      || isRejection(text)
      || normalizedText.includes('no me intereso');

    // Solo evaluar positivo si no es negativo
    const isPositiveInterest =
      !isNegativeInterest
      && (
        normalizedText === 'lead_interest_yes'
        || isAcceptance(text)
        || normalizedText === 'si me intereso'
        || normalizedText === 'si, me intereso'
        || (normalizedText.startsWith('si') && !normalizedText.startsWith('sin') && normalizedText.length < 25)
      );

    if (isPositiveInterest) {
      await this.persistLeadFeedback(userId, {
        interested: true,
        reasonSource: 'button',
      });
      await this.persistLeadSignalInSession(userId, {
        interested: true,
        reasonSource: 'button',
      });

      const subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        select: { plan: true, status: true },
      });
      if (this.isPaidPlanActive(subscription)) {
        await this.upsertAlertPreference(userId, this.defaultOnboardingAlertTime, 'daily');
        await this.updateSessionData(userId, {
          premiumOnboardingMode: null,
          premiumCvMissingFields: [],
        });
        await this.updateSessionState(userId, ConversationState.READY);
        return await this.returnToMainMenu(
          userId,
          'Perfecto. Ya tengo tu feedback inicial y active tu flujo premium.',
        );
      }

      const user = await (this.prisma.user as any).findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          dataAuthorizationAccepted: true,
        },
      });

      if (!user?.name) {
        await this.updateSessionState(userId, ConversationState.LEAD_REGISTER_NAME);
        return { text: BotMessages.V2_REGISTER_NAME };
      }

      if (!user.email) {
        await this.updateSessionState(userId, ConversationState.LEAD_REGISTER_EMAIL);
        return { text: BotMessages.V2_REGISTER_EMAIL(getFirstName(user.name)) };
      }

      const isLandingRegisteredFreemium = Boolean(
        user.name
        && user.email
        && user.dataAuthorizationAccepted,
      );
      if (isLandingRegisteredFreemium) {
        await this.activateFreemiumTrialFromLead(userId, this.defaultOnboardingAlertTime);
        await this.updateSessionState(userId, ConversationState.READY);

        return await this.returnToMainMenu(
          userId,
          BotMessages.V2_TRIAL_ACTIVATED,
        );
      }

      await this.updateSessionState(userId, ConversationState.LEAD_TERMS_CONSENT);
      return this.buildLeadTermsConsentReply();
    }

    if (isNegativeInterest) {
      await this.updateSessionState(userId, ConversationState.LEAD_WAIT_REJECTION_REASON);
      return {
        text: BotMessages.V2_REJECTION_REASON,
        listTitle: 'Elegir motivo',
        listSections: [
          {
            title: 'Motivo principal',
            rows: [
              { id: 'reason_role', title: 'Cargo' },
              { id: 'reason_location', title: 'Ciudad' },
              { id: 'reason_company', title: 'Empresa' },
              { id: 'reason_salary', title: 'Salario' },
              { id: 'reason_remote', title: 'Remoto' },
              { id: 'reason_other', title: 'Otro motivo' },
            ],
          },
        ],
      };
    }

    return {
      text: 'Para seguir, elige una opción:',
      buttons: [
        { id: 'lead_interest_yes', title: 'Sí, me interesó' },
        { id: 'lead_interest_no', title: 'No me interesó' },
      ],
    };
  }

  private async handleLeadWaitRejectionReasonState(userId: string, text: string): Promise<BotReply> {
    const reason = this.resolveLeadRejectionReason(text);
    const normalizedText = this.normalizeLeadSignalToken(text);
    const explicitOtherSelection =
      normalizedText === 'reason_other'
      || normalizedText === 'otro motivo'
      || normalizedText === 'otro'
      || normalizedText === 'other';

    if (reason === 'other' && explicitOtherSelection) {
      await this.updateSessionData(userId, { leadPendingRejectionReason: 'other' });
      await this.updateSessionState(userId, ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT);
      return {
        text: `Entiendo. Cuéntame en una frase por qué no te interesó esta vacante y ajusto la siguiente.`,
      };
    }

    const buttonIds = new Set([
      'reason_role', 'reason_location', 'reason_company', 'reason_salary', 'reason_remote',
      'cargo', 'ciudad', 'empresa', 'salario', 'remoto',
    ]);
    const source: LeadRejectionReasonSource = buttonIds.has(normalizedText) ? 'button' : 'free_text';
    return await this.continueLeadAfterRejection(userId, reason, {
      reasonText: text,
      reasonSource: source,
    });
  }

  private async handleLeadWaitRejectionOtherTextState(
    userId: string,
    text: string,
  ): Promise<BotReply> {
    if (text.trim().length < 3) {
      return {
        text: `Cuéntame un poco más del motivo para poder ajustar mejor la siguiente oferta.`,
      };
    }

    const classified = await this.llmService.classifyRejectionReason(text);
    const fallbackReason = this.resolveLeadRejectionReason(text);
    const shouldPreferFallback =
      fallbackReason !== 'other'
      && (
        !classified
        || (classified.confidence ?? 0) < 0.82
        || (fallbackReason === 'experience' && classified.reason !== 'experience')
      );
    const reason = shouldPreferFallback
      ? fallbackReason
      : (classified?.reason || fallbackReason);

    return await this.continueLeadAfterRejection(userId, reason, {
      reasonText: text,
      reasonSource: classified ? 'llm' : 'free_text',
      confidence: classified?.confidence ?? null,
      metadata: classified
        ? { classificationRationale: classified.rationale }
        : { classificationRationale: null },
    });
  }

  private buildLeadTermsConsentReply(): BotReply {
    return {
      text: BotMessages.V2_TERMS_CONSENT,
      buttons: [
        { id: 'lead_terms_accept', title: 'Acepto' },
        { id: 'lead_terms_reject', title: 'No acepto' },
      ],
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
        text: `Ese correo no parece válido. Escríbelo de nuevo, por favor.`,
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
        text: `Ese correo ya está en uso con otro número. Escribe un correo diferente.`,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });

    await this.updateSessionState(userId, ConversationState.LEAD_TERMS_CONSENT);
    return this.buildLeadTermsConsentReply();
  }

  private async activateFreemiumTrialFromLead(
    userId: string,
    defaultAlertTime: string,
  ): Promise<void> {
    const now = new Date();
    const freemiumExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sessionData = await this.getLatestSessionData(userId);
    const preRegistrationSearchesUsed = this.getPreRegistrationSearchesUsed(sessionData);
    const initialFreemiumUsesLeft = 5;

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { id: true, plan: true, status: true },
    });

    const hasPaidPlan =
      subscription
      && (subscription.plan === 'PREMIUM' || subscription.plan === 'PRO')
      && subscription.status === 'ACTIVE';

    if (!subscription) {
      await (this.prisma.subscription as any).create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: initialFreemiumUsesLeft,
          freemiumStartDate: now,
          freemiumPolicy: FREEMIUM_POLICY_V2,
          freemiumExpiresAt,
          freemiumExpired: false,
          status: 'ACTIVE',
        },
      });
    } else if (!hasPaidPlan) {
      await (this.prisma.subscription as any).update({
        where: { userId },
        data: {
          plan: 'FREEMIUM',
          freemiumUsesLeft: initialFreemiumUsesLeft,
          freemiumStartDate: now,
          freemiumPolicy: FREEMIUM_POLICY_V2,
          freemiumExpiresAt,
          freemiumExpired: false,
          status: 'ACTIVE',
        },
      });
    }

    await this.upsertAlertPreference(userId, defaultAlertTime, 'daily');
    await this.updateSessionData(userId, {
      preRegistrationSearchesUsed,
      leadTrialActivated: true,
      leadTrialActivatedAt: now.toISOString(),
      leadTrialInitialUsesLeft: initialFreemiumUsesLeft,
    });
  }

  private async handleLeadTermsConsentState(
    userId: string,
    text: string,
    _intent: UserIntent,
  ): Promise<BotReply> {
    if (isAcceptance(text)) {
      await (this.prisma.user as any).update({
        where: { id: userId },
        data: {
          dataAuthorizationAccepted: true,
          dataAuthorizationAcceptedAt: new Date(),
          privacyPolicyVersion: this.leadPolicyVersion,
        },
      });

      await this.activateFreemiumTrialFromLead(userId, this.defaultOnboardingAlertTime);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      await this.sendOnboardingEmailSafely(userId, user?.email || null, user?.name || null);
      await this.updateSessionState(userId, ConversationState.READY);

      return await this.returnToMainMenu(
        userId,
        BotMessages.V2_TRIAL_ACTIVATED,
      );
    }

    if (isRejection(text)) {
      await this.updateSessionData(userId, { leadTrialActivated: false });
      await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
      const nextVacancyReply = await this.handleLeadShowFirstVacancyState(userId);
      return {
        ...nextVacancyReply,
        text: `${BotMessages.V2_TERMS_REJECTED}\n\n${nextVacancyReply.text}`,
      };
    }

    return this.buildLeadTermsConsentReply();
  }

  // ========================================
  // ESTADOS DE REGISTRO IN-BOT
  // ========================================

  /**
   * Estado WA_ASK_NAME: Usuario no registrado, pidiendo nombre
   */
  private async handleWaAskNameState(userId: string, text: string): Promise<BotReply> {
    const name = text.trim();

    // Validar nombre: mínimo 2 caracteres, máximo 50, solo letras y espacios
    if (name.length < 2 || name.length > 50) {
      return {
        text: 'Por favor, escribe tu *nombre completo* (entre 2 y 50 caracteres).\n\n✏️ Ejemplo: Juan Pérez',
      };
    }

    // Validar que contenga al menos letras
    if (!/[a-zA-ZÀ-ÿ\s]/i.test(name)) {
      return {
        text: 'Hmm, eso no parece un nombre válido. Por favor, escribe tu *nombre completo*:',
      };
    }

    // Guardar nombre en la DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: name },
    });

    this.logger.log(`✅ Nombre guardado para usuario ${userId}: "${name}"`);

    // Transición a WA_ASK_EMAIL
    await this.updateSessionState(userId, ConversationState.WA_ASK_EMAIL);

    return { text: BotMessages.WA_ASK_EMAIL(getFirstName(name)) };
  }

  /**
   * Estado WA_ASK_EMAIL: Usuario proporcionó nombre, pidiendo email
   */
  private async handleWaAskEmailState(userId: string, text: string): Promise<BotReply> {
    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        text: 'Ese no parece un correo válido.\n\nPor favor, escribe tu *correo electrónico*:\n\n📧 Ejemplo: tu.correo@ejemplo.com',
      };
    }

    // Verificar si el email ya está registrado por otro usuario
    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email: email,
        NOT: { id: userId },
      },
    });

    if (existingByEmail) {
      return {
        text: 'Este correo ya está registrado con otro número.\n\nPor favor, usa un *correo diferente*:',
      };
    }

    // Guardar email
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: email },
    });

    // Crear suscripción FREEMIUM
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

    this.logger.log(`✅ Registro in-bot completado para usuario ${userId}: ${user?.name} (${email})`);
    await this.sendOnboardingEmailSafely(userId, email, user?.name || null);

    // Transición a NEW para iniciar onboarding normal
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
   * NOTA: Solo llegan aquí usuarios ya registrados desde la landing
   * ACTUALIZADO: Ya no se pregunta por dispositivo, siempre se usan botones interactivos
   */
  private async handleNewState(userId: string): Promise<BotReply> {
    this.logger.log(`🆕 Procesando estado NEW para usuario: ${userId}`);

    // Obtener usuario con su suscripción
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    // CASO 1: Usuario pagado activo (PREMIUM o PRO)
    if ((user?.subscription?.plan === 'PREMIUM' || user?.subscription?.plan === 'PRO') && user?.subscription?.status === 'ACTIVE') {
    this.logger.log(`💳 Usuario pagado ${userId}`);
      await this.updateSessionState(userId, ConversationState.ASK_TERMS);
      return {
        text: BotMessages.WELCOME_BACK_PREMIUM(getFirstName(user.name)),
        buttons: [
          { id: 'continue', title: '¡A buscar empleo!' },
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
          { id: 'cmd_ofertas', title: 'Ver ofertas ahora' },
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

    const onboardingFlags = await this.getOnboardingFlags(userId);
    if (onboardingFlags.flowVariant === this.v2FlowVariant) {
      this.logger.log(`Usuario ${userId} onboarding freemium_v2`);
      await this.updateSessionState(userId, ConversationState.LEAD_COLLECT_PROFILE);
      return { text: BotMessages.V2_WELCOME_ROLE };
    }

    // CASO 4: Usuario freemium activo → dar bienvenida con botón Continuar
    this.logger.log(`🚀 Usuario ${userId} iniciando onboarding`);
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    return {
      text: BotMessages.WELCOME_REGISTERED(getFirstName(user?.name)),
      buttons: [
        { id: 'continue', title: '¡A buscar empleo!' },
      ],
    };
  }

  // [ELIMINADO] Estado ASK_DEVICE - Ya no se pregunta por dispositivo
  // [ELIMINADO] Estado ASK_DEVICE - Ya no se pregunta por dispositivo
  // Todos los usuarios ahora reciben botones interactivos automáticamente

  /**
   * Estado ASK_TERMS: Esperando que el usuario presione Continuar
   * ACTUALIZADO: Ya no pide aceptar términos, solo un botón para continuar
   */
  private async handleAskTermsState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    const onboardingFlags = await this.getOnboardingFlags(userId);

    if (isAcceptance(text) || intent === UserIntent.ACCEPT || text.toLowerCase().includes('continu')) {
      if (onboardingFlags.premiumOnboardingV2) {
        await this.updateSessionData(userId, {
          premiumOnboardingMode: null,
          premiumCvDetectedProfile: null,
          premiumCvMissingFields: [],
        });
        await this.updateSessionState(userId, ConversationState.PREMIUM_ASK_CV);
        return {
          text: BotMessages.PREMIUM_ASK_CV,
          buttons: [
            { id: 'premium_cv_yes', title: 'Si tengo CV' },
            { id: 'premium_cv_no', title: 'No tengo CV' },
          ],
        };
      }

      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.ASK_ROLE };
    }

    if (onboardingFlags.premiumOnboardingV2) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: null,
        premiumCvDetectedProfile: null,
        premiumCvMissingFields: [],
      });
      await this.updateSessionState(userId, ConversationState.PREMIUM_ASK_CV);
      return {
        text: BotMessages.PREMIUM_ASK_CV,
        buttons: [
          { id: 'premium_cv_yes', title: 'Si tengo CV' },
          { id: 'premium_cv_no', title: 'No tengo CV' },
        ],
      };
    }

    await this.updateSessionState(userId, ConversationState.ASK_ROLE);
    return { text: BotMessages.ASK_ROLE };
  }

  private async handlePremiumAskCvState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    const normalized = this.normalizeLeadSignalToken(text);
    const wantsCv =
      intent === UserIntent.UPLOAD_CV
      || normalized === 'premium_cv_yes'
      || normalized.includes('tengo cv')
      || normalized.includes('hoja de vida')
      || normalized.includes('curriculum')
      || isAcceptance(text);
    const noCv =
      normalized === 'premium_cv_no'
      || isRejection(text);

    if (wantsCv && !noCv) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'cv',
        premiumCvEntryPoint: 'onboarding',
        premiumCvDetectedProfile: null,
        premiumCvMissingFields: [],
      });
      await this.updateSessionState(userId, ConversationState.PREMIUM_WAITING_CV_FILE);
      return {
        text: BotMessages.PREMIUM_WAITING_CV_FILE,
        buttons: await this.getPremiumCvWaitingButtons(userId),
      };
    }

    if (noCv) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'no_cv',
        premiumCvEntryPoint: null,
        premiumCvDetectedProfile: null,
        premiumCvMissingFields: [],
      });
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.PREMIUM_NO_CV_ASK_ROLE };
    }

    return {
      text: BotMessages.PREMIUM_ASK_CV,
      buttons: [
        { id: 'premium_cv_yes', title: 'Si tengo CV' },
        { id: 'premium_cv_no', title: 'No tengo CV' },
      ],
    };
  }

  private async handlePremiumWaitingCvFileState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    const normalized = this.normalizeLeadSignalToken(text);
    const sessionData = await this.getLatestSessionData(userId);
    const isFromReadyMenu = sessionData.premiumCvEntryPoint === 'ready_menu';
    const wantsManualFlow =
      normalized === 'premium_cv_skip_manual'
      || isRejection(text);
    const wantsBackToMenu =
      normalized === 'premium_cv_back_menu'
      || normalized === 'volver al menu';

    if (isFromReadyMenu && (wantsBackToMenu || isRejection(text))) {
      await this.updateSessionData(userId, {
        premiumCvEntryPoint: null,
      });
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, 'Perfecto, volvimos al menu principal.');
    }

    if (wantsManualFlow) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'no_cv',
        premiumCvEntryPoint: null,
        premiumCvDetectedProfile: null,
        premiumCvMissingFields: [],
      });
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.PREMIUM_NO_CV_ASK_ROLE };
    }

    if (intent === UserIntent.UPLOAD_CV || normalized.includes('cv') || normalized.includes('hoja de vida')) {
      return {
        text: BotMessages.PREMIUM_WAITING_CV_FILE,
        buttons: await this.getPremiumCvWaitingButtons(userId),
      };
    }

    return {
      text: BotMessages.PREMIUM_WAITING_CV_FILE,
      buttons: await this.getPremiumCvWaitingButtons(userId),
    };
  }

  private async handlePremiumConfirmCvProfileState(
    userId: string,
    text: string,
  ): Promise<BotReply> {
    const normalized = this.normalizeLeadSignalToken(text);
    const confirm = isAcceptance(text) || normalized === 'premium_cv_confirm';
    const manual = isRejection(text) || normalized === 'premium_cv_manual';

    if (confirm && !manual) {
      return await this.routePremiumOnboardingToNextMissingField(userId);
    }

    if (manual) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'no_cv',
        premiumCvDetectedProfile: null,
        premiumCvMissingFields: [],
      });
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.PREMIUM_NO_CV_ASK_ROLE };
    }

    const sessionData = await this.getLatestSessionData(userId);
    const detected = (sessionData.premiumCvDetectedProfile as Record<string, any> | null) || null;
    const missing = Array.isArray(sessionData.premiumCvMissingFields)
      ? sessionData.premiumCvMissingFields.filter((field: any) => typeof field === 'string')
      : [];

    return {
      text: BotMessages.PREMIUM_CONFIRM_CV_PROFILE(
        detected?.role || 'No detectado',
        this.formatExperienceLevel(detected?.experienceLevel),
        detected?.location || 'No detectada',
        this.translatePremiumMissingFieldLabels(missing),
      ),
      buttons: [
        { id: 'premium_cv_confirm', title: 'Si, continuar' },
        { id: 'premium_cv_manual', title: 'Ajustar manual' },
      ],
    };
  }

  private async handlePremiumDiagnosisState(userId: string): Promise<BotReply> {
    const diagnosisReply = await this.handleLeadShowFirstVacancyState(
      userId,
      'default',
      { diagnosisMode: 'premium_v2' },
    );

    if (!diagnosisReply.preMessage?.text) {
      return {
        ...diagnosisReply,
        preMessage: { text: BotMessages.PREMIUM_DIAGNOSIS_READY },
      };
    }

    return {
      ...diagnosisReply,
      preMessage: {
        text: `${BotMessages.PREMIUM_DIAGNOSIS_READY}\n\n${diagnosisReply.preMessage.text}`,
      },
    };
  }

  private async handleMediaUploadByState(
    userId: string,
    currentState: string,
    messageType: 'text' | 'image' | 'document',
    mediaUrl: string,
  ): Promise<BotReply | null> {
    if (
      currentState === ConversationState.PREMIUM_WAITING_CV_FILE
      || currentState === ConversationState.PREMIUM_ASK_CV
    ) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'cv',
      });
      return await this.processPremiumCvUpload(userId, mediaUrl, messageType);
    }

    if (messageType === 'document') {
      return await this.handleCVUpload(userId, mediaUrl);
    }

    return null;
  }

  private async processPremiumCvUpload(
    userId: string,
    mediaUrl: string,
    messageType: 'text' | 'image' | 'document',
  ): Promise<BotReply> {
    if (messageType !== 'document' && messageType !== 'image') {
      return {
        text: BotMessages.PREMIUM_WAITING_CV_FILE,
        buttons: await this.getPremiumCvWaitingButtons(userId),
      };
    }

    await this.updateSessionState(userId, ConversationState.PREMIUM_PROCESSING_CV);

    let extractionResult: CvProfileExtractionResult | null = null;
    try {
      extractionResult = await this.cvService.processCvFromUrl(userId, mediaUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`No se pudo procesar CV premium para ${userId}: ${message}`);
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true, location: true, experienceLevel: true },
    });
    const missingFields = this.getPremiumMissingProfileFields(profile);
    const shouldAskResend =
      extractionResult?.warningCode === 'DOC_PARSE_FAILED'
      || extractionResult?.warningCode === 'UNSUPPORTED_MIME'
      || extractionResult?.warningCode === 'MEDIA_DOWNLOAD_FAILED'
      || extractionResult?.warningCode === 'MEDIA_METADATA_FAILED';

    if (shouldAskResend) {
      await this.updateSessionData(userId, {
        premiumOnboardingMode: 'cv',
        premiumCvLastMediaType: messageType,
        premiumCvLastMediaId: mediaUrl,
        premiumCvLastWarningCode: extractionResult?.warningCode || null,
      });
      await this.updateSessionState(userId, ConversationState.PREMIUM_WAITING_CV_FILE);

      const warningText = extractionResult?.warningMessage
        || 'No pude leer el archivo. Reenvialo en PDF, DOCX o imagen.';

      return {
        text: `${warningText}\n\n${BotMessages.PREMIUM_WAITING_CV_FILE}`,
        buttons: await this.getPremiumCvWaitingButtons(userId),
      };
    }

    await this.updateSessionData(userId, {
      premiumOnboardingMode: 'cv',
      premiumCvDetectedProfile: {
        role: profile?.role || null,
        location: profile?.location || null,
        experienceLevel: profile?.experienceLevel || null,
      },
      premiumCvMissingFields: missingFields,
      premiumCvLastMediaType: messageType,
      premiumCvLastMediaId: mediaUrl,
      premiumCvLastWarningCode: extractionResult?.warningCode || null,
      premiumCvLastConfidence: extractionResult?.confidence ?? null,
      premiumCvLastSourceType: extractionResult?.sourceType || null,
    });
    await this.updateSessionState(userId, ConversationState.PREMIUM_CONFIRM_CV_PROFILE);

    const extractionWarning = extractionResult?.warningMessage?.trim();
    const confirmationText = BotMessages.PREMIUM_CONFIRM_CV_PROFILE(
      profile?.role || 'No detectado',
      this.formatExperienceLevel(profile?.experienceLevel),
      profile?.location || 'No detectada',
      this.translatePremiumMissingFieldLabels(missingFields),
    );

    return {
      text: extractionWarning ? `${extractionWarning}\n\n${confirmationText}` : confirmationText,
      buttons: [
        { id: 'premium_cv_confirm', title: 'Si, continuar' },
        { id: 'premium_cv_manual', title: 'Ajustar manual' },
      ],
    };
  }

  private async routePremiumOnboardingToNextMissingField(userId: string): Promise<BotReply> {
    const sessionData = await this.getLatestSessionData(userId);
    const mode = this.parsePremiumOnboardingMode(sessionData.premiumOnboardingMode);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true, location: true, experienceLevel: true },
    });
    const missingFields = this.getPremiumMissingProfileFields(profile);

    await this.updateSessionData(userId, {
      premiumCvMissingFields: missingFields,
    });

    const isCvMode = mode === 'cv';

    if (!profile?.role) {
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return {
        text: isCvMode ? BotMessages.PREMIUM_CV_MISSING_ROLE : BotMessages.PREMIUM_NO_CV_ASK_ROLE,
      };
    }

    if (!profile.location) {
      await this.updateSessionState(userId, ConversationState.ASK_LOCATION);
      return {
        text: isCvMode ? BotMessages.PREMIUM_CV_MISSING_LOCATION : BotMessages.V2_ASK_LOCATION,
      };
    }

    if (!profile.experienceLevel) {
      await this.updateSessionState(userId, ConversationState.ASK_EXPERIENCE);
      return {
        text: isCvMode ? BotMessages.PREMIUM_CV_MISSING_EXPERIENCE : BotMessages.V2_ASK_EXPERIENCE,
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    await this.updateSessionState(userId, ConversationState.PREMIUM_DIAGNOSIS);
    return await this.handlePremiumDiagnosisState(userId);
  }

  private async handlePremiumSmartRoleCaptureState(userId: string, text: string): Promise<BotReply> {
    const minConfidence = 0.55;
    const profileUpdates: Record<string, string> = {};

    const inferred = await this.inferLeadSignals(text);
    const multipleLocationChoices = this.extractMultipleLocationChoices(text);
    const roleChoicesFromText = this.extractRoleChoicesFromText(text);
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
      // No fijar ubicacion aun.
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

    if (roleChoicesFromText.length > 1) {
      if (!roleWarning) {
        roleWarning = this.buildSingleRoleChoiceMessage(roleChoicesFromText);
      }
      roleCandidate = null;
    }

    if (roleCandidate && this.isGenericSingleWordRole(roleCandidate)) {
      roleWarning = `Tu cargo es muy general. Para que la busqueda sea precisa, escribe una especialidad.\n\nEjemplo: *Auxiliar Administrativo*, *Analista de Datos* o *Ingeniero Industrial*.`;
      roleCandidate = null;
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
      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.ASK_ROLE,
      );
      const conversationalText = this.normalizeConversationalMessage(conversational);
      if (conversationalText) {
        return { text: conversationalText };
      }

      if (roleWarning) {
        return { text: roleWarning };
      }

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
          text: 'Perfecto, ya tome parte de tu info. Ahora dime solo el cargo o rol que estas buscando.',
        };
      }

      return { text: BotMessages.ERROR_ROLE_INVALID };
    }

    if (multipleLocationChoices.length > 1) {
      await this.updateSessionState(userId, ConversationState.ASK_LOCATION);
      return {
        text: this.buildSingleLocationChoiceMessage(multipleLocationChoices),
      };
    }

    return await this.routePremiumOnboardingToNextMissingField(userId);
  }

  private async handlePremiumAskExperienceState(
    userId: string,
    text: string,
    mode: PremiumOnboardingMode,
  ): Promise<BotReply> {
    const minConfidence = 0.55;
    const inferred = await this.inferLeadSignals(text);
    let experienceLevel: string | null = normalizeExperienceLevel(text);

    if (!experienceLevel && inferred.experienceLevel) {
      experienceLevel = inferred.experienceLevel;
    }

    if (!experienceLevel) {
      return {
        text: mode === 'cv'
          ? BotMessages.PREMIUM_CV_MISSING_EXPERIENCE
          : this.normalizeConversationalMessage(
            await this.llmService.generateConversationalResponse(text, 'ASK_EXPERIENCE'),
          ) || 'Selecciona tu nivel de experiencia:',
        listTitle: 'Seleccionar nivel',
        listSections: this.getLeadExperienceListSections(),
      };
    }

    const profileUpdates: Record<string, string> = { experienceLevel };
    if (inferred.location && inferred.confidence >= minConfidence) {
      const locationValidation = validateAndNormalizeLocation(inferred.location);
      if (locationValidation.isValid && locationValidation.location) {
        profileUpdates.location = locationValidation.location;
      }
    }

    await this.updateUserProfile(userId, profileUpdates);
    return await this.routePremiumOnboardingToNextMissingField(userId);
  }

  private async handlePremiumAskLocationState(
    userId: string,
    text: string,
    mode: PremiumOnboardingMode,
  ): Promise<BotReply> {
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

      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.ASK_LOCATION,
      );

      return {
        text: this.normalizeConversationalMessage(conversational)
          || (mode === 'cv' ? BotMessages.PREMIUM_CV_MISSING_LOCATION : BotMessages.ERROR_LOCATION_INVALID),
      };
    }

    const profileUpdates: Record<string, string> = { location: finalLocation };
    if (inferred.experienceLevel && inferred.confidence >= minConfidence) {
      profileUpdates.experienceLevel = inferred.experienceLevel;
    }

    await this.updateUserProfile(userId, profileUpdates);
    return await this.routePremiumOnboardingToNextMissingField(userId);
  }

  private getPremiumMissingProfileFields(profile: {
    role?: string | null;
    location?: string | null;
    experienceLevel?: string | null;
  } | null): string[] {
    const missing: string[] = [];

    if (!profile?.role) missing.push('role');
    if (!profile?.location) missing.push('location');
    if (!profile?.experienceLevel) missing.push('experienceLevel');

    return missing;
  }

  private translatePremiumMissingFieldLabels(fields: string[]): string[] {
    const labels: Record<string, string> = {
      role: 'rol',
      location: 'ubicacion',
      experienceLevel: 'experiencia',
    };

    return fields.map((field) => labels[field] || field);
  }

  /**
   * Estado ASK_ROLE: Esperando rol/cargo
   * ACTUALIZADO: Siempre muestra lista interactiva
   */
  private async handleAskRoleState(userId: string, text: string): Promise<BotReply> {
    const premiumContext = await this.getPremiumOnboardingV2Context(userId);
    if (premiumContext.isActive && premiumContext.mode) {
      return await this.handlePremiumSmartRoleCaptureState(userId, text);
    }

    // Paso 1: Intentar con regex (gratis)
    let role = normalizeRole(text);

    // Paso 2: Si regex falla, pedir ayuda al LLM
    let roleWarningFromAi: string | null = null;
    if (!role) {
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        if (aiResult.isValid && aiResult.role) {
          role = aiResult.role;
        } else {
          roleWarningFromAi = aiResult.warning || aiResult.suggestion || null;
        }
      }
    } else {
      // Regex dio resultado → validar con IA para posibles mejoras (typos, genérico)
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        if (!aiResult.isValid) {
          roleWarningFromAi = aiResult.warning || aiResult.suggestion || null;
          role = null;
        } else if (aiResult.isValid && aiResult.role) {
          role = aiResult.role;
        }
      }
    }

    if (!role) {
      // Siempre intentar respuesta conversacional primero — maneja confusión, preguntas, hesitación
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.ASK_ROLE);
      const conversationalText = this.normalizeConversationalMessage(conversational);
      if (conversationalText) {
        return { text: conversationalText };
      }
      // Fallback: warning de validación o mensaje genérico
      return { text: roleWarningFromAi || BotMessages.ERROR_ROLE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { role });

    // Transición: ASK_ROLE → ASK_EXPERIENCE (ASK_REMOTE eliminado del flujo)
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

  // [DESACTIVADO] Pregunta de remoto eliminada del flujo de onboarding
  // /**
  //  * Estado ASK_REMOTE: Pregunta rápida si quiere remoto
  //  * Si dice Sí → agrega "remoto" al rol para la búsqueda
  //  * Si dice No → mantiene el rol tal cual
  //  * Luego transiciona a ASK_EXPERIENCE
  //  */
  // private async handleAskRemoteState(userId: string, text: string): Promise<BotReply> {
  /*
    const normalizedText = text.trim().toLowerCase();
    const isYes = ['sí', 'si', 'yes', 'remote_yes'].includes(normalizedText);
    const isNo = ['no', 'remote_no'].includes(normalizedText);

    if (!isYes && !isNo) {
      return {
        text: `Solo necesito saber: ¿te interesa trabajar *remoto*?`,
        buttons: [
          { id: 'remote_yes', title: 'S\u00ED'},
          { id: 'remote_yes', title: 'Sí' },
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
        this.logger.log(`✅ Rol actualizado con remoto: "${currentRole}" → "${currentRole} remoto"`);
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
            { id: 'exp_none', title: 'Sin experiencia', description: 'Recién graduado o sin experiencia laboral' },
            { id: 'exp_junior', title: 'Junior (1-2 años)', description: 'Experiencia inicial en el campo' },
            { id: 'exp_mid', title: 'Intermedio (3-5 años)', description: 'Experiencia sólida' },
            { id: 'exp_senior', title: 'Senior (5+ años)', description: 'Experto en el área' },
            { id: 'exp_lead', title: 'Lead/Expert (7+ años)', description: 'Liderazgo y expertise avanzado' },
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
    const premiumContext = await this.getPremiumOnboardingV2Context(userId);
    if (premiumContext.isActive && premiumContext.mode) {
      return await this.handlePremiumAskExperienceState(
        userId,
        text,
        premiumContext.mode,
      );
    }

    const experienceLevel = normalizeExperienceLevel(text);

    if (!experienceLevel) {
      // Mostrar lista interactiva cuando no entiende la respuesta
      return {
        text: this.normalizeConversationalMessage(await this.llmService.generateConversationalResponse(text, 'ASK_EXPERIENCE')) || 'Selecciona tu nivel de experiencia:',
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
   * ACTUALIZADO: Para usuarios nuevos, omite preguntas de alertas y configura 07:00 por defecto.
   * Para usuarios existentes, mantiene flujo anterior de OFFER_ALERTS.
   */
  private async handleAskLocationState(userId: string, text: string): Promise<BotReply> {
    const premiumContext = await this.getPremiumOnboardingV2Context(userId);
    if (premiumContext.isActive && premiumContext.mode) {
      return await this.handlePremiumAskLocationState(
        userId,
        text,
        premiumContext.mode,
      );
    }

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

    // Siempre pasar por IA primero para ubicación.
    const aiResult = await this.llmService.validateAndCorrectLocation(text);
    if (aiResult) {
      if (aiResult.isValid && aiResult.location) {
        finalLocation = aiResult.location;
      }
    } else if (validation.isValid && validation.location) {
      // LLM no disponible: fallback local.
      finalLocation = validation.location;
    }

    if (!finalLocation) {
      // Siempre intentar respuesta conversacional primero — maneja confusión, preguntas, hesitación
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.ASK_LOCATION);
      const conversationalText = this.normalizeConversationalMessage(conversational);
      if (conversationalText) {
        return { text: conversationalText };
      }
      // Fallback estático según el tipo de error
      if (isRemoteIntent) {
        return { text: BotMessages.ERROR_LOCATION_REMOTE_INVALID };
      }
      if (validation.errorType === 'too_vague') {
        return { text: this.getTooVagueLocationMessage(text) };
      }
      return { text: BotMessages.ERROR_LOCATION_INVALID };
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
    // [LEGACY] Se mantiene para usuarios ya registrados (sin cambios).
    // [ACTUALIZADO] Flujo: ASK_LOCATION → OFFER_ALERTS (preguntar si quiere alertas antes de buscar)

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
  //               { id: 'work_sin_preferencia', title: '🤷 Sin preferencia', description: 'Cualquier modalidad' },
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
              { id: 'freq_daily', title: '📅 Diariamente' },
              { id: 'freq_every_3_days', title: '📅 Cada 3 días' },
              { id: 'freq_weekly', title: '📅 Semanalmente' },
              { id: 'freq_monthly', title: '📅 Mensualmente' },
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

    await this.upsertAlertPreference(userId, alertTime, 'daily');
    await this.updateSessionState(userId, ConversationState.READY);
    const menuRows = await this.buildMainMenuRows(userId);

    const confirmationMessage = `✅ ¡Listo! 🎉
Alertas activadas ✔️ a las ${alertTime}

Cuando te llegue la notificación, toca *"Buscar empleos"* para ver las ofertas.

📌 Ten en cuenta:

• Cada vez que le des clic en "Buscar empleos" consumes 1 búsqueda.

Actualmente tienes el Plan Free: 5 búsquedas por una semana.

💡 ¿Qué quieres hacer ahora?`;

    return {
      text: confirmationMessage,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: menuRows,
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

    // Detectar intención de editar/cambiar preferencias
    if (intent === UserIntent.UPLOAD_CV || this.isAttachHvCommand(text)) {
      if (await this.isPremiumPlanActiveForUser(userId)) {
        return await this.startPremiumAttachHvFromReady(userId);
      }
    }

    if (this.shouldRedirectToEditFlow(text, intent)) {
      return await this.redirectReadyUserToEditFlow(userId);
    }

    // Detectar intención de buscar empleos
    if (intent === UserIntent.SEARCH_NOW) {
      // PRIMERO: Verificar si hay alertas pendientes de un template notification
      const isPremiumSearchUser = await this.isPremiumPlanActiveForUser(userId);
      const pendingAlert = isPremiumSearchUser
        ? null
        : await this.getLatestNonStalePendingAlert(userId);

      if (pendingAlert) {
        // Hay ofertas pendientes del template → enviarlas
        this.logger.log(`📬 Usuario ${userId} tiene ${pendingAlert.jobCount} ofertas pendientes`);

        // Marcar como vistas
        await this.prisma.pendingJobAlert.update({
          where: { id: pendingAlert.id },
          data: { viewedAt: new Date() },
        });

        // Formatear y enviar ofertas (formato multiple estandar)
        const jobs = pendingAlert.jobs as unknown as JobPosting[];
        const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(jobs);

        // Marcar ofertas como enviadas (evitar duplicados en futuras búsquedas)
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        return {
          text: `📢 *📬 Aquí están tus ofertas de empleo!*\n\n${formattedJobs}\n\n💡 _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
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
          this.logger.log(`⚠️ Usuario pagado ${userId} alcanzó límite semanal, mostrando mensaje de espera`);
          return { text: usageCheck.message || BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(new Date()) };
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

      // Si no hubo resultados o hubo error, restaurar el uso descontado
      if (searchResult.outcome !== 'success') {
        try {
          await this.restoreUsage(userId);
          this.logger.log(`Uso restaurado para usuario ${userId} tras búsqueda sin resultados o con error`);
        } catch (restoreError) {
          const restoreErrorMessage = restoreError instanceof Error ? restoreError.message : 'Unknown restore error';
          this.logger.error(`No se pudo restaurar uso para ${userId}: ${restoreErrorMessage}`);
        }
      }

      return searchResult.reply;
    }

    // Siempre mostrar menú de comandos con lista interactiva
    return {
      text: '💼 ¿Qué te gustaría hacer?',
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: await this.buildMainMenuRows(userId),
        },
      ],
    };
  }

  /**
   * Ejecuta búsqueda de empleos y devuelve resultados formateados
   */
  private async performJobSearch(userId: string, usesLeftAfterDeduction?: number): Promise<JobSearchExecutionResult> {
    try {
      this.logger.log(`🔍 Usuario ${userId} solicitó búsqueda de empleos`);

      // Determinar volumen post-diagnostico por plan.
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      const isPaidPlan = subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO';
      const maxResults = isPaidPlan ? 5 : 3;

      // Ejecutar búsqueda
      const baseResult = await this.jobSearchService.searchJobsForUser(userId, maxResults);
      const result = isPaidPlan
        ? await this.refinePremiumSearchResultWithAi(userId, baseResult, maxResults)
        : await this.refineFreeSearchResultWithAi(userId, baseResult, maxResults);

      // Si no hay ofertas, sugerir roles alternativos con IA
      if (result.jobs.length === 0) {
        if (result.offersExhausted) {
          return {
            outcome: 'no_results',
            reply: {
              text: '*Atencion:* Has visto todas las ofertas disponibles para tu perfil actual. Puedes esperar nuevas publicaciones o escribir "editar" para ajustar tu perfil.',
            },
          };
        }

        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const currentRole = profile?.role || 'tu perfil';

        const suggestions = await this.llmService.suggestRelatedRoles(currentRole);
        const suggestionsText = suggestions.length > 0
          ? `\n\n💡 *Roles relacionados que podrías probar:*\n${suggestions.map((s) => `• ${s}`).join('\n')}\n\nPuedes escribir *"editar"* para cambiar tu cargo.`
          : `\n\nIntenta de nuevo más tarde o escribe *"editar"* para ajustar tus preferencias.`;

        return {
          outcome: 'no_results',
          reply: {
            text: `No encontró ofertas que coincidan con *"${currentRole}"* en este momento. 😔${suggestionsText}`,
          },
        };
      }

      const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(result.jobs);
      const primarySearchMessage = formattedJobs;

      await this.jobSearchService.markJobsAsSent(userId, result.jobs);

      let exhaustedMessage = '';
      if (result.offersExhausted && result.jobs.length === 0) {
        exhaustedMessage = `\n\n🔴 *⚠️ ¡Atención!* Has visto todas las ofertas disponibles para tu perfil actual. Para tu próxima búsqueda puedes:\n• Esperar un tiempo mientras se publican nuevas ofertas\n• Escribir *"editar"* para ajustar tus preferencias y encontrar más opciones`;
      }





      const DELAY_MS = 10000;
      const usesLeft = usesLeftAfterDeduction ?? subscription?.freemiumUsesLeft ?? 0;
      const isPremium = subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO';
      const planLabel = isPremium ? (subscription?.plan === 'PRO' ? 'Plan Pro' : 'Plan Premium') : 'Plan Free';

      let menuText: string;
      if (usesLeft === 0 && !isPremium) {
        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const userRole = profile?.role || 'tu perfil';
        const checkoutLink = process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ';

        menuText = `*Búsquedas restantes esta semana:* 0 (Plan Free)

Hay muchas ofertas que podemos cazar por ti en internet para tu rol (*${userRole}*).
Si quieres seguir recibiéndolas de forma automática y filtradas según tu perfil, activa CIO por solo *$20.000 COP al mes* y continúa tu búsqueda sin límites.
Actívalo aquí:

${checkoutLink}

Estoy lista para ayudarte a cazar tu próxima oportunidad.`;
      } else {
        const searchWord = usesLeft === 1 ? 'búsqueda' : 'búsquedas';
        menuText = `📌 Te quedan *${usesLeft} ${searchWord} esta semana* (${planLabel}).

⚠️ ¿Las ofertas no encajan del todo?

Puedes ir a *Editar perfil* y ajustar tu rol, ciudad o preferencias.

¿Qué quieres hacer ahora?`;
      }

      return {
        outcome: 'success',
        reply: {
          text: primarySearchMessage + exhaustedMessage,
          delayedMessage: {
            text: menuText,
            delayMs: DELAY_MS,
            listTitle: 'Ver opciones',
            listSections: [
              {
                title: 'Acciones disponibles',
                rows: await this.buildMainMenuRows(userId, {
                  searchDescription: 'Encontrar mas ofertas',
                  restartDescription: 'Reconfigurar tu perfil',
                  cancelDescription: 'Dejar de usar el CIO',
                }),
              },
            ],
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error en búsqueda de empleos: ${errorMessage}`);

      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
      });

      let diagnosisText = this.detectSearchProfileIssue(profile);

      if (!diagnosisText) {
        const diagnosis = await this.llmService.diagnoseSearchFailure({
          errorMessage,
          role: profile?.role,
          location: profile?.location,
          experienceLevel: profile?.experienceLevel,
          jobType: profile?.jobType,
          minSalary: profile?.minSalary,
        });
        diagnosisText = diagnosis?.userMessage || null;
      }

      const editMenu = await this.showProfileForEditing(userId);
      return {
        outcome: 'error',
        reply: {
          ...editMenu,
          text: `${diagnosisText || 'No pude buscar ofertas en este momento. Ajusta tu perfil y vuelve a intentar.'}\n\n${editMenu.text || ''}`,
        },
      };
    }
  }

  /**
   * Estado OFFER_ALERTS: Pregunta si desea recibir alertas (durante onboarding)
   * ACTUALIZADO: Si acepta, va directamente a ASK_ALERT_TIME (frecuencia siempre diaria)
   */
  private async handleOfferAlertsState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text) || text.toLowerCase().includes('activar')) {
      await this.updateSessionState(userId, ConversationState.ASK_ALERT_TIME);

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

    if (isRejection(text) || text.toLowerCase().includes('sin alertas') || text.toLowerCase().includes('no quiero')) {
      await this.prisma.alertPreference.create({
        data: {
          userId,
          alertFrequency: 'daily',
          alertTimeLocal: '09:00',
          timezone: 'America/Bogota',
          enabled: false,
        },
      });

      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.ALERTS_DISABLED);
    }

    return {
      text: `\n\n_Por favor, selecciona una opción:_`,
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
      const onboardingFlags = await this.getOnboardingFlags(userId);
      const subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        select: { plan: true, status: true },
      });
      const isPaidPlanActive = this.isPaidPlanActive(subscription);

      if (isPaidPlanActive && onboardingFlags.premiumOnboardingV2) {
        await this.updateSessionState(userId, ConversationState.NEW);
        const premiumRestartReply = await this.handleNewState(userId);
        return {
          ...premiumRestartReply,
          text: `${BotMessages.RESTARTED}\n\n${premiumRestartReply.text}`,
        };
      }

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
      // Usuario canceló el reinicio
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.RESTART_CANCELLED);
    }

    // Respuesta ambigua → intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_RESTART);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_restart', title: 'Sí, reiniciar' },
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `\n\n_Por favor, selecciona una opción:_`,
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

    // Respuesta ambigua → intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_CANCEL_SERVICE);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_cancel', title: 'Sí, confirmar' },
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `\n\n_Por favor, selecciona una opción:_`,
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
      text: `📄 ¡Gracias por enviar tu CV!

Por ahora estoy en pruebas y no puedo procesarlo aún, pero pronto podré extraer información automáticamente.

Continúa con el proceso manual. 👍`,
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

    // Siempre mostrar lista desplegable con opciones de edicion
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

    // Detectar que campo quiere editar
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
      // Intentar respuesta conversacional única
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
        text: this.normalizeConversationalMessage(await this.llmService.generateConversationalResponse(text, 'ASK_EXPERIENCE')) || 'Selecciona tu nivel de experiencia:',
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

    // Siempre pasar por IA primero en edición de ubicación.
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
      // Intentar respuesta conversacional única
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.EDIT_LOCATION);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_LOCATION_INVALID };
    }

    await this.updateUserProfile(userId, {
      location: finalLocation,
    });
    await this.updateSessionState(userId, ConversationState.READY);

    return await this.returnToMainMenu(userId, BotMessages.FIELD_UPDATED('ubicación', finalLocation));
  }

  private getTooVagueLocationMessage(input: string): string {
    const normalized = input.toLowerCase();

    if (
      normalized.includes('europa') ||
      normalized.includes('europe') ||
      normalized.includes('union europea') ||
      normalized.includes('unión europea')
    ) {
      return `Esa ubicación es muy amplia para buscar ofertas. 🌍

Por favor escribe una *ciudad* o *país* de Europa.

Ejemplo: "Oporto", "Lisboa", "Madrid", "Portugal", "España".`;
    }

    if (normalized.includes('asia')) {

      return `Esa ubicación es muy amplia para buscar ofertas. 🌏

Por favor escribe una *ciudad* o *país* de Asia.

Ejemplo: "Tokio", "Singapur", "Bangkok", "Japón", "India".`;
    }
    if (normalized.includes('africa') || normalized.includes('áfrica')) {
      return `Esa ubicación es muy amplia para buscar ofertas. 🌍

Por favor escribe una *ciudad* o *país* de África.

Ejemplo: "Nairobi", "Ciudad del Cabo", "El Cairo", "Kenia", "Sudáfrica".`;
    }

    if (normalized.includes('oceania') || normalized.includes('oceanía')) {
      return `Esa ubicación es muy amplia para buscar ofertas. 🌏

Por favor escribe una *ciudad* o *país* de Oceanía.

Ejemplo: "Sídney", "Melbourne", "Auckland", "Australia", "Nueva Zelanda".`;
    }

    if (
      normalized.includes('norteamerica') ||
      normalized.includes('norteamérica') ||
      normalized.includes('north america')
    ) {
      return `Esa ubicación es muy amplia para buscar ofertas. 🌎

Por favor escribe una *ciudad* o *país* de Norteamérica.

Ejemplo: "Toronto", "Miami", "New York", "Canadá", "Estados Unidos".`;
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
  //               { id: 'work_remoto', title: '🏠 Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: '🏢 Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: '🔄 Híbrido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: '🤷 Sin preferencia', description: 'Cualquier modalidad' },
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
              { id: 'freq_daily', title: '📅 Diariamente' },
              { id: 'freq_every_3_days', title: '📅 Cada 3 días' },
              { id: 'freq_weekly', title: '📅 Semanalmente' },
              { id: 'freq_monthly', title: '📅 Mensualmente' },
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

    // Freemium: usar la misma regla canónica en todo el sistema.
    return !shouldExpireFreemiumByPolicy({
      startDate: subscription.freemiumStartDate,
      usesLeft: subscription.freemiumUsesLeft,
      freemiumPolicy: (subscription as any).freemiumPolicy,
      freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
    });
  }

  /**
   * Estado FREEMIUM_EXPIRED: El usuario agotó su freemium
   */
  private async handleFreemiumExpiredState(userId: string, text: string): Promise<BotReply> {
    // PRIMERO: Si el usuario hace clic en "ver ofertas" y tiene alertas pendientes, mostrarlas
    const intent = detectIntent(text);
    if (intent === UserIntent.SEARCH_NOW) {
      const pendingAlert = await this.getLatestNonStalePendingAlert(userId);

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
          text: `📢 *📬 ¡Aquí están tus ofertas de empleo!*\n\n${formattedJobs}\n\n_Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }
    }

    // Verificar el tipo de suscripción
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si es usuario pagado activo (PREMIUM/PRO), NO debería estar aquí - devolverlo a READY
    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`⚠️ Usuario pagado ${userId} estaba en FREEMIUM_EXPIRED incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      // Verificar si tiene búsquedas disponibles o está esperando
      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `✅ ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        // Premium sin búsquedas semanales - mostrar mensaje de espera
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado (para freemium)
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`✅ Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `✅ ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
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
      this.logger.log(`⚠️ Usuario pagado ${userId} estaba en ASK_EMAIL incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `✅ ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`✅ Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `✅ ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
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
      this.logger.log(`⚠️ Usuario pagado ${userId} estaba en WAITING_PAYMENT incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `✅ ¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes búsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin añadió usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`✅ Usuario ${userId} recuperó usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `✅ ¡Buenas noticias, ${getFirstName(user?.name)}! Tienes búsquedas disponibles nuevamente.`);
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

    this.logger.log(`✅ Usuario ${userId} activado como PREMIUM (expira: ${premiumEndDate.toISOString()})`);
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
    if (shouldExpireFreemiumByPolicy({
      startDate: subscription.freemiumStartDate,
      usesLeft: subscription.freemiumUsesLeft,
      freemiumPolicy: (subscription as any).freemiumPolicy,
      freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
    })) {
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
   * Restaura un uso descontado cuando la búsqueda falla o no arroja resultados.
   */
  async restoreUsage(userId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return;
    }

    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const restoredUses = Math.min(subscription.premiumUsesLeft + 1, 5);
      await this.prisma.subscription.update({
        where: { userId },
        data: { premiumUsesLeft: restoredUses },
      });
      return;
    }

    const restoredUses = Math.min(subscription.freemiumUsesLeft + 1, 5);
    await this.prisma.subscription.update({
      where: { userId },
      data: { freemiumUsesLeft: restoredUses },
    });
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
    if (shouldExpireFreemiumByPolicy({
      startDate: subscription.freemiumStartDate,
      usesLeft: subscription.freemiumUsesLeft,
      freemiumPolicy: (subscription as any).freemiumPolicy,
      freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
    })) {
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

  /**
   * Detecta errores comunes en parámetros de perfil que suelen romper la búsqueda.
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
      return `No pude completar la búsqueda porque tu *cargo parece tener varios roles al mismo tiempo*.

Para obtener mejores resultados, entra a *Editar perfil* y deja solo *un rol principal* (ej: _Asesor comercial_).

Después vuelve a escribir *buscar*.`;
    }

    if (!role || role.length < 2) {
      return `No pude completar la búsqueda porque tu *cargo* no está bien definido.

Entra a *Editar perfil*, ajusta tu cargo principal y vuelve a buscar.`;
    }

    if (!location || location.length < 2) {
      return `No pude completar la búsqueda porque tu *ubicación* no está bien definida.

Entra a *Editar perfil*, ajusta tu ciudad o país y vuelve a buscar.`;
    }

    return null;
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
  //     sin_preferencia: '🤷 Sin preferencia',
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
      this.logger.log(`✅ Onboarding email enviado automático (registro chat) a ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error enviando onboarding email automatico (registro chat) a ${email} (usuario ${userId}): ${errorMessage}`,
      );
    }
  }

  // ========================================
  // ========================================
  // Métodos auxiliares de base de datos

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
      this.logger.log(`🆕 Usuario creado: ${phone}`);
    }

    return user;
  }

  /**
   * Obtiene o crea una sesión activa
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
      this.logger.log(`🆕 Sesión creada para usuario ${userId}`);
    }

    return session;
  }

  private parseFlowVariant(value: unknown): FlowVariant | null {
    if (value === 'legacy' || value === 'freemium_v2') {
      return value;
    }
    return null;
  }

  private parsePremiumOnboardingSource(value: unknown): PremiumOnboardingSource | null {
    if (value === 'restart' || value === 'direct_payment') {
      return value;
    }
    return null;
  }

  private parsePremiumOnboardingMode(value: unknown): PremiumOnboardingMode | null {
    if (value === 'cv' || value === 'no_cv') {
      return value;
    }
    return null;
  }

  private isPaidPlanActive(
    subscription: { plan?: string | null; status?: string | null } | null | undefined,
  ): boolean {
    return (
      (subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO')
      && subscription?.status === 'ACTIVE'
    );
  }

  /**
   * Garantiza que la sesión tenga una variante de flujo explícita.
   * - Si ya tiene variante válida, la respeta.
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

  private async ensurePremiumOnboardingV2ForPaidUserInNewState(
    userId: string,
    session: { id: string; state: string; data: any },
    isPaidPlanActive: boolean,
  ): Promise<void> {
    if (!isPaidPlanActive) return;
    if (session.state !== ConversationState.NEW) return;

    const currentData = (session.data as Record<string, any>) || {};
    if (currentData.premiumOnboardingV2 === true) return;

    const nextData = {
      ...currentData,
      premiumOnboardingV2: true,
      premiumOnboardingSource: 'direct_payment',
    };

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        data: nextData,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `premiumOnboardingV2 habilitado para ${userId} (source=direct_payment)`,
    );
  }

  // [ELIMINADO] getDeviceType ya no se usa, todos son tratados como móvil
  // private async getDeviceType(userId: string): Promise<'MOBILE' | 'DESKTOP'> { ... }

  /**
   * Helper: Regresar al menú principal con opciones interactivas
   * ACTUALIZADO: Siempre muestra lista interactiva (todos tratados como móvil)
   */
  private async returnToMainMenu(userId: string, message: string): Promise<BotReply> {
    const menuRows = await this.buildMainMenuRows(userId);
    // Siempre retornar lista interactiva
    return {
      text: `${message}\n\n¿Qué te gustaría hacer?`,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: menuRows,
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

    this.logger.debug(`🔄 Estado actualizado a: ${newState}`);
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

    this.logger.debug(`🔄 Datos de sesión actualizados: ${JSON.stringify(newData)}`);
  }

  private async getOnboardingFlags(userId: string): Promise<{
    flowVariant: FlowVariant;
    skipAlertConfigOnboarding: boolean;
    defaultOnboardingAlertTime: string;
    premiumOnboardingV2: boolean;
    premiumOnboardingSource: PremiumOnboardingSource | null;
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
      premiumOnboardingV2: sessionData.premiumOnboardingV2 === true,
      premiumOnboardingSource: this.parsePremiumOnboardingSource(
        sessionData.premiumOnboardingSource,
      ),
    };
  }

  private async getPremiumOnboardingV2Context(userId: string): Promise<{
    isActive: boolean;
    mode: PremiumOnboardingMode | null;
  }> {
    const onboardingFlags = await this.getOnboardingFlags(userId);
    if (!onboardingFlags.premiumOnboardingV2) {
      return { isActive: false, mode: null };
    }

    const sessionData = await this.getLatestSessionData(userId);
    const mode = this.parsePremiumOnboardingMode(sessionData.premiumOnboardingMode);
    return {
      isActive: true,
      mode,
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
          `Descartadas ${deleted.count} ofertas pendientes de ${userId} por actualización de perfil`,
        );
      }
    }

    this.logger.debug(`✏️ Perfil actualizado: ${JSON.stringify(data)}`);
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

    this.logger.debug(`⏰ Alerta configurada para: ${alertTime} con frecuencia ${alertFrequency}`);
  }

  /**
   * Reinicia el perfil del usuario (elimina datos pero mantiene el User)
   */
  private async restartUserProfile(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });
    const isPaidPlanActive = this.isPaidPlanActive(subscription);

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

    const nextSessionData = isPaidPlanActive
      ? {
        flowVariant: this.defaultFlowVariant,
        premiumOnboardingV2: true,
        premiumOnboardingSource: 'restart',
      }
      : {
        flowVariant: this.v2FlowVariant,
        skipAlertConfigOnboarding: true,
        defaultOnboardingAlertTime: this.defaultOnboardingAlertTime,
      };

    // Resetear sesión a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        state: ConversationState.NEW,
        data: nextSessionData,
        updatedAt: new Date(),
      },
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
    // NO eliminar User ni Subscription
    // El usuario mantiene su identidad y estado de suscripción
    this.logger.log(`🗑️ Preferencias eliminadas para usuario ${userId} (usuario NO eliminado)`);
  }
}
