import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { JobPosting } from '../job-search/types/job-posting';
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
  // isMobileDevice, // [ELIMINADO] Ya no se usa, todos son tratados como mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³vil
  // isDesktopDevice, // [ELIMINADO] Ya no se usa, todos son tratados como mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³vil
  normalizeRole,
  isNonRoleInput,
  isPreferenceUpdateIntent,
  normalizeExperienceLevel,
  normalizeLocation,
  validateAndNormalizeLocation,
  extractNormalizedLocations,
  // normalizeWorkMode, // [DESACTIVADO] FunciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n comentada
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
type LeadRejectionReason = 'role' | 'location' | 'company' | 'salary' | 'remote' | 'experience' | 'other';
type LeadVacancySearchMode = 'default' | 'reuse_cache' | 'force_fresh';
type LeadRejectionReasonSource = 'button' | 'free_text' | 'llm';

/**
 * Servicio de conversaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n (Orquestador)
 * Implementa la mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡quina de estados del flujo conversacional con el usuario
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

      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Procesando mensaje de ${phone}: ${text || '[media]'}`);

      // 1. Buscar usuario por telÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©fono (NO crear, debe registrarse en landing)
      const user = await this.findUserByPhone(phone);

      // 2. Si no estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ registrado, iniciar registro in-bot
      if (!user) {
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Usuario no registrado: ${phone} ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â iniciando registro in-bot`);

        // Crear usuario mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­nimo con solo el telÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©fono
        const newUser = await this.prisma.user.create({
          data: { phone },
          include: { subscription: true },
        });

        // Crear sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n con estado WA_ASK_NAME
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
        // Si por alguna razÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n no tiene sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n en WA_ASK_NAME, ponerlo ahÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­
        if (session.state !== ConversationState.WA_ASK_NAME && session.state !== ConversationState.WA_ASK_EMAIL) {
          await this.updateSessionState(user.id, ConversationState.WA_ASK_NAME);
          return { text: BotMessages.NOT_REGISTERED };
        }
        // Continuar con el flujo normal de estados
        return await this.handleStateTransition(user.id, session.state, text || '', detectIntent(text || ''));
      }

      // 4. Obtener o crear sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n activa
      const session = await this.getOrCreateSession(user.id);
      const flowVariant = await this.ensureSessionFlowVariant(
        user.id,
        session,
        this.defaultFlowVariant,
      );
      this.logger.debug(`Variante de flujo para ${user.id}: ${flowVariant}`);

      // NOTA: Los mensajes entrantes y salientes se guardan centralizadamente en WhatsappService

      // 5. Si hay media (documento/imagen), podrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a ser un CV
      if (mediaUrl && messageType === 'document') {
        const response = await this.handleCVUpload(user.id, mediaUrl);
        return response;
      }

      // 6. Si no hay texto, no podemos procesar - mostrar menÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº de ayuda
      if (!text) {
        const response = await this.returnToMainMenu(user.id, BotMessages.UNKNOWN_INTENT);
        return response;
      }

      // 7. Detectar intenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n general (para comandos especiales)
      let intent = detectIntent(text);

      // 7.25. Seguridad: frases como "quiero remoto" deben ir a editar perfil
      if (session.state === ConversationState.READY && isPreferenceUpdateIntent(text)) {
        intent = UserIntent.CHANGE_PREFERENCES;
      }

      // 7.5. Si regex no detectÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ nada y estamos en READY, preguntar al LLM
      if (intent === UserIntent.UNKNOWN && session.state === ConversationState.READY) {
        const aiIntent = await this.llmService.detectIntent(text, session.state);
        if (aiIntent && aiIntent !== UserIntent.UNKNOWN) {
          intent = aiIntent;
          this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Intent detectado por IA: ${intent}`);
        }
      }

      // 7.6. Si estamos en onboarding y el texto no parece una respuesta vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida, manejar out-of-flow
      const outOfFlowResponse = await this.tryHandleOutOfFlow(user.id, text, session.state, intent);
      if (outOfFlowResponse) {
        return outOfFlowResponse;
      }

      // 8. Manejar comandos especiales independientes del estado
      if (intent === UserIntent.HELP) {
        return { text: BotMessages.HELP_MESSAGE };
      }

      // 9. Procesar segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn el estado actual
      const response = await this.handleStateTransition(user.id, session.state, text, intent);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error procesando mensaje: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ GUARDAR ERROR EN HISTORIAL
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
   * Maneja las transiciones de estado segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn la mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡quina de estados
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
   * Retorna null si no aplica o si el mensaje parece ser una respuesta vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida.
   */
  private async tryHandleOutOfFlow(
    userId: string,
    text: string,
    currentState: string,
    intent: UserIntent,
  ): Promise<BotReply | null> {
    // Solo aplica en estados donde esperamos respuesta especÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­fica
    const interactiveStates = [
      ConversationState.LEAD_COLLECT_PROFILE,
      ConversationState.LEAD_ASK_LOCATION,
      ConversationState.LEAD_ASK_EXPERIENCE,
      ConversationState.LEAD_WAIT_INTEREST,
      ConversationState.LEAD_WAIT_REJECTION_REASON,
      ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT,
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

    // Si el regex ya detectÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ un intent conocido, no es out-of-flow
    if (intent !== UserIntent.UNKNOWN) return null;

    // En selecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de campo de ediciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, pasar siempre por IA si la respuesta no coincide con un campo.
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

    // Solo interceptar si parece un mensaje conversacional (no respuesta vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida)
    if (!isNonRoleInput(text)) return null;

    // PRIORIDAD 1: Respuesta conversacional ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºnica del LLM
    const aiResponse = await this.llmService.generateConversationalResponse(text, currentState);
    if (aiResponse) {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Respuesta conversacional IA en ${currentState}: "${text}"`);
      return { text: this.normalizeConversationalMessage(aiResponse) || aiResponse };
    }

    // PRIORIDAD 2: HeurÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­stico variado (LLM caÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­do)
    const stateMessages: Record<string, string[]> = {
      [ConversationState.ASK_ROLE]: [
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Hola! ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Estoy aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ para ayudarte a encontrar empleo.\n\nNecesito saber: *ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿cuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡l es tu cargo o profesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n?*\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° Ejemplo: _Desarrollador web_, _Vendedor_, _Auxiliar administrativo_`,
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Entiendo! Pero primero necesito que me digas *en quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© trabajas o quieres trabajar*.\n\nEscribe solo *un rol*, por ejemplo: _DiseÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±ador grÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡fico_, _Contador_, _Marketing_`,
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Sin problema! ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° Para encontrarte las mejores ofertas, dime *tu profesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n principal*.\n\nPor ejemplo: _Ingeniero industrial_, _Analista de datos_, _Recepcionista_`,
      ],
      [ConversationState.ASK_LOCATION]: [
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Claro! Pero necesito saber *dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³nde quieres buscar empleo*. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° Escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s*: _BogotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡_, _Colombia_, _MedellÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­n_`,
        `Entiendo tu mensaje. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Ahora dime, *ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿en quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© ciudad o paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* te gustarÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a trabajar?\n\nEjemplo: _Lima_, _MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©xico_, _BogotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡_`,
      ],
      [ConversationState.ASK_EXPERIENCE]: [
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Gracias por escribir! Pero necesito saber *tu nivel de experiencia*. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡\n\nUsa el botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de abajo para seleccionarlo.`,
        `Entiendo. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Para continuar, selecciona *tu nivel de experiencia* con el botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de abajo.`,
      ],
      [ConversationState.OFFER_ALERTS]: [
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Solo necesito una respuesta rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡pida! *ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿Quieres recibir alertas diarias* de nuevas ofertas?\n\nResponde *SÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­* o *No*.`,
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
        `Solo necesito que elijas una opcion para seguir: *S\u00ED, me interes\u00F3* o *No me interes\u00F3*.`,
      ],
      [ConversationState.LEAD_WAIT_REJECTION_REASON]: [
        `Gracias. Elige el motivo principal para ajustar la siguiente oferta.`,
      ],
      [ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT]: [
        `Te leo. CuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ntame en una frase por quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© no te interesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ y ajusto la siguiente oferta.`,
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
        `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Hola! ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Puedo ayudarte a *buscar empleo*, *editar tu perfil*, o *ver tu perfil actual*.\n\nEscribe lo que necesites o usa el menÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº de abajo. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡`,
      ],
    };

    const messages = stateMessages[currentState];
    if (messages) {
      // Elegir mensaje aleatorio para variedad
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â HeurÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­stico variado en ${currentState}: "${text}"`);
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
      ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT,
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
            description: 'Reci\u00E9n graduado o sin experiencia laboral',
          },
          {
            id: 'exp_junior',
            title: 'Junior (1-2 a\u00F1os)',
            description: 'Experiencia inicial en el campo',
          },
          {
            id: 'exp_mid',
            title: 'Intermedio (3-5 a\u00F1os)',
            description: 'Experiencia s\u00F3lida',
          },
          {
            id: 'exp_senior',
            title: 'Senior (5+ a\u00F1os)',
            description: 'Experto en el \u00E1rea',
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

  private toRoleTitleCase(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private extractRoleChoicesFromText(text: string): string[] {
    const hasExplicitRoleSeparators = /\/|,|;|\||\s-\s|\sy\/o\s/i.test(text);
    if (!hasExplicitRoleSeparators) return [];

    const rawParts = text
      .replace(/\n+/g, ' ')
      .split(/\/|,|;|\||\s-\s|\sy\/o\s/gi)
      .map((part) => part.trim())
      .filter(Boolean);

    const ignoredPatterns = [
      /\b(remoto|remote|home office|teletrabajo)\b/i,
      /\b(ciudad|pais|pa[iÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­]s|ubicaci[oÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³]n|location)\b/i,
      /\b(bogot|medell|cali|lima|miami|madrid|oporto|mexico|m[eÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©]xico|colombia|argentina|peru|per[uÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº]|chile|espa[nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±]a|portugal|estados unidos|usa|canada|canad[aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡])\b/i,
    ];

    const cleaned = rawParts
      .map((part) => part
        .replace(/^(\s)*(quiero|busco|me interesa|trabajar como|trabajo como|cargo|rol|puesto|profesi[oÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³]n|profesion)\s+/i, '')
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
    const bulletList = choices.map((choice) => `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${choice}`).join('\n');
    return `Veo que mencionaste varios cargos. Para obtener mejores resultados, elige solo uno:\n\n${bulletList}\n\nEscr\u00edbeme el cargo que quieres priorizar.`;
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
      roleWarning = this.buildSingleRoleChoiceMessage(roleChoicesFromText);
      roleCandidate = null;
    }

    if (roleCandidate && this.isGenericSingleWordRole(roleCandidate)) {
      roleWarning = `Tu cargo es muy general. Para que la b\u00FAsqueda sea precisa, escribe una especialidad.\n\nEjemplo: *Auxiliar Administrativo*, *Analista de Datos* o *Ingeniero Industrial*.`;
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
          text: `Perfecto, ya tom\u00E9 parte de tu info. Ahora dime *solo el cargo o rol* que est\u00E1s buscando.`,
        };
      }

      const conversational = await this.llmService.generateConversationalResponse(
        text,
        ConversationState.LEAD_COLLECT_PROFILE,
      );
      return {
        text:
          this.normalizeConversationalMessage(conversational)
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

  private buildReadySearchSingleVacancyMessage(job: JobPosting): string {
    const company = job?.company || 'Empresa confidencial';
    const title = job?.title || 'Vacante disponible';
    const location = job?.locationRaw || 'Ubicacion por confirmar';
    const source = job?.source || 'portal de empleo';
    const cleanUrl = this.jobSearchService.cleanJobUrl(job?.url || '');

    let snippet = (job?.snippet || '').trim();
    if (snippet.length > 220) {
      snippet = `${snippet.slice(0, 217)}...`;
    }

    const summary = snippet || 'Esta vacante puede encajar con tu perfil.';

    return `Te comparto una vacante que se ajusta a tu perfil:\n\n*${title}*\nEmpresa: ${company}\nUbicaci\u00F3n: ${location}\nFuente: ${source}\n\n${summary}\n\n${cleanUrl}`;
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
      `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ DecisiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de vacante V2 para ${userId}: mode=${searchMode}, score=${scored.score.toFixed(2)}, source=${scored.scoreSource}, candidates=${candidates.length}`,
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
      text: `No encontre ofertas para "${role}" en este momento.${suggestionsText}\n\nEscribeme otro rol para intentarlo de nuevo.`,
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
      text: this.buildLeadVacancyMessage(job),
      buttons: [
        { id: 'lead_interest_yes', title: 'S\u00ED, me interes\u00F3' },
        { id: 'lead_interest_no', title: 'No me interes\u00F3' },
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
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Cache vacÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a para ${userId}; pasando a nueva bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda forzada`);
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
            `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Nueva bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda tambiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n quedÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ bajo umbral para ${userId} (score=${recalculated.score.toFixed(2)}). Se muestra la mejor coincidencia disponible.`,
          );
        }
      }

      return await this.deliverLeadVacancy(userId, firstJob, contextWithMode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error mostrando primera vacante V2 para ${userId}: ${errorMessage}`);
      return {
        text: `No pude buscar una vacante en este momento. Intenta de nuevo en unos minutos.`,
      };
    }
  }

  private resolveLeadRejectionReason(text: string): LeadRejectionReason {
    const normalized = this.normalizeLeadSignalToken(text);

    if (
      normalized.includes('experiencia')
      || normalized.includes('sin experiencia')
      || normalized.includes('junior')
      || normalized.includes('intermedio')
      || normalized.includes('senior')
      || normalized.includes('lead')
      || normalized.includes('expert')
      || /\b\d+\s*(ano|anos|a\u00f1o|a\u00f1os)\b/i.test(normalized)
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

    // Repara mojibake tÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­pico (ej: "SÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­, me interesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³")
    if (/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/.test(text)) {
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
      return { text: `Entendido. Dime el rol que quieres priorizar y ajusto la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda.` };
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
        text: `Gracias, sigo ajustando la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn tu perfil.\n\n${nextVacancyReply.text}`,
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
        text: `Gracias, sigo ajustando la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn tu perfil.\n\n${nextVacancyReply.text}`,
      };
    }

    await this.updateSessionState(userId, ConversationState.LEAD_SHOW_FIRST_VACANCY);
    const nextVacancyReply = await this.handleLeadShowFirstVacancyState(userId);
    return {
      ...nextVacancyReply,
      text: `Gracias, sigo ajustando la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn tu perfil.\n\n${nextVacancyReply.text}`,
    };
  }

  private async handleLeadWaitInterestState(
    userId: string,
    text: string,
    _intent: UserIntent,
  ): Promise<BotReply> {
    const normalizedText = this.normalizeLeadSignalToken(text);
    const isPositiveInterest =
      isAcceptance(text)
      || normalizedText === 'lead_interest_yes'
      || normalizedText.startsWith('si')
      || normalizedText.includes('me intereso')
      || normalizedText.includes('si me intereso')
      || normalizedText.includes('si, me intereso');
    const isNegativeInterest =
      isRejection(text)
      || normalizedText === 'lead_interest_no'
      || normalizedText.includes('no me intereso')
      || normalizedText.includes('no, me intereso') === false && normalizedText.startsWith('no');

    if (isPositiveInterest) {
      await this.persistLeadFeedback(userId, {
        interested: true,
        reasonSource: 'button',
      });
      await this.persistLeadSignalInSession(userId, {
        interested: true,
        reasonSource: 'button',
      });

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

      if (user.dataAuthorizationAccepted) {
        await this.activateFreemiumTrialFromLead(userId, this.defaultOnboardingAlertTime);
        await this.updateSessionState(userId, ConversationState.READY);

        return await this.returnToMainMenu(
          userId,
          `Perfecto, seguimos con tu busqueda y ya puedes explorar mas ofertas.`,
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
      text: `Para seguir, elige una opciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n:`,
      buttons: [
        { id: 'lead_interest_yes', title: 'S\u00ED, me interes\u00F3' },
        { id: 'lead_interest_no', title: 'No me interes\u00F3' },
      ],
    };
  }

  private async handleLeadWaitRejectionReasonState(userId: string, text: string): Promise<BotReply> {
    const reason = this.resolveLeadRejectionReason(text);
    const normalizedText = this.normalizeLeadSignalToken(text);
    const explicitOtherSelection =
      normalizedText === 'otro motivo' || normalizedText === 'otro' || normalizedText === 'other';

    if (reason === 'other' && explicitOtherSelection) {
      await this.updateSessionData(userId, { leadPendingRejectionReason: 'other' });
      await this.updateSessionState(userId, ConversationState.LEAD_WAIT_REJECTION_OTHER_TEXT);
      return {
        text: `Entiendo. Cu\u00E9ntame en una frase por qu\u00E9 no te interes\u00F3 esta vacante y ajusto la siguiente.`,
      };
    }

    const source: LeadRejectionReasonSource =
      ['cargo', 'ciudad', 'empresa', 'salario', 'remoto'].includes(normalizedText)
        ? 'button'
        : 'free_text';
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
        text: `Cu\u00E9ntame un poco m\u00E1s del motivo para poder ajustar mejor la siguiente oferta.`,
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
    const initialFreemiumUsesLeft = Math.max(0, 5 - preRegistrationSearchesUsed);

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
        `Listo. Active tu prueba gratuita por 7 dias.`,
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

    // Validar nombre: mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­nimo 2 caracteres, mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo 50, solo letras y espacios
    if (name.length < 2 || name.length > 50) {
      return {
        text: 'Por favor, escribe tu *nombre completo* (entre 2 y 50 caracteres).\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Ejemplo: Juan PÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rez',
      };
    }

    // Validar que contenga al menos letras
    if (!/[a-zÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±]/i.test(name)) {
      return {
        text: 'Hmm, eso no parece un nombre vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â\n\nPor favor, escribe tu *nombre completo*:',
      };
    }

    // Guardar nombre en la DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: name },
    });

    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Nombre guardado para usuario ${userId}: "${name}"`);

    // TransiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a WA_ASK_EMAIL
    await this.updateSessionState(userId, ConversationState.WA_ASK_EMAIL);

    return { text: BotMessages.WA_ASK_EMAIL(getFirstName(name)) };
  }

  /**
   * Estado WA_ASK_EMAIL: Usuario proporcionÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ nombre, pidiendo email
   */
  private async handleWaAskEmailState(userId: string, text: string): Promise<BotReply> {
    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        text: 'Ese no parece un correo vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â\n\nPor favor, escribe tu *correo electrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³nico*:\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ Ejemplo: tu.correo@ejemplo.com',
      };
    }

    // Verificar si el email ya estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ registrado por otro usuario
    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email: email,
        NOT: { id: userId },
      },
    });

    if (existingByEmail) {
      return {
        text: 'Este correo ya estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ registrado con otro nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢\n\nPor favor, usa un *correo diferente*:',
      };
    }

    // Guardar email
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: email },
    });

    // Crear suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n FREEMIUM
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

    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Registro in-bot completado para usuario ${userId}: ${user?.name} (${email})`);
    await this.sendOnboardingEmailSafely(userId, email, user?.name || null);

    // TransiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a NEW para iniciar onboarding normal
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
   * NOTA: Solo llegan aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ usuarios ya registrados desde la landing
   * ACTUALIZADO: Ya no se pregunta por dispositivo, siempre se usan botones interactivos
   */
  private async handleNewState(userId: string): Promise<BotReply> {
    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ Procesando estado NEW para usuario: ${userId}`);

    // Obtener usuario con su suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    // CASO 1: Usuario pagado activo (PREMIUM o PRO)
    if ((user?.subscription?.plan === 'PREMIUM' || user?.subscription?.plan === 'PRO') && user?.subscription?.status === 'ACTIVE') {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ Usuario pagado ${userId}`);
      await this.updateSessionState(userId, ConversationState.ASK_TERMS);
      return {
        text: BotMessages.WELCOME_BACK_PREMIUM(getFirstName(user.name)),
        buttons: [
          { id: 'continue', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡A buscar empleo!' },
        ],
      };
    }

    // CASO 2: Usuario con freemium expirado
    if (user?.subscription?.freemiumExpired) {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° Usuario ${userId} con freemium expirado`);
      await this.updateSessionState(userId, ConversationState.FREEMIUM_EXPIRED);
      return {
        text: BotMessages.FREEMIUM_EXPIRED_RETURNING_USER(getFirstName(user?.name)),
        buttons: [
          { id: 'cmd_pagar', title: 'Quiero pagar' },
          { id: 'cmd_ofertas', title: 'Ver ofertas ahora' },
        ],
      };
    }

    // CASO 3: Usuario sin suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ crear freemium
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

    // CASO 4: Usuario freemium activo ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ dar bienvenida con botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n Continuar
    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Usuario ${userId} iniciando onboarding`);
    await this.updateSessionState(userId, ConversationState.ASK_TERMS);

    return {
      text: BotMessages.WELCOME_REGISTERED(getFirstName(user?.name)),
      buttons: [
        { id: 'continue', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡A buscar empleo!' },
      ],
    };
  }

  // [ELIMINADO] Estado ASK_DEVICE - Ya no se pregunta por dispositivo
  // Todos los usuarios ahora reciben botones interactivos automÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ticamente
  // private async handleAskDeviceState(userId: string, text: string): Promise<BotReply> { ... }

  /**
   * Estado ASK_TERMS: Esperando que el usuario presione Continuar
   * ACTUALIZADO: Ya no pide aceptar tÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rminos, solo un botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n para continuar
   */
  private async handleAskTermsState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Cualquier interacciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n (botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n o texto) avanza al siguiente paso
    if (isAcceptance(text) || intent === UserIntent.ACCEPT || text.toLowerCase().includes('continu')) {
      await this.updateSessionState(userId, ConversationState.ASK_ROLE);
      return { text: BotMessages.ASK_ROLE };
    }

    // Si el usuario escribe cualquier cosa, tambiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n continuar
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
        // Si la IA detectÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ un problema especÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­fico (genÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rico, mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltiples roles, etc.), mostrar su mensaje
        if (!aiResult.isValid) {
          return { text: aiResult.warning || aiResult.suggestion || BotMessages.ERROR_ROLE_INVALID };
        }
        role = aiResult.role;
      }
    } else {
      // Regex dio resultado ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â validar con IA para posibles mejoras (typos, genÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rico)
      const aiResult = await this.llmService.validateAndCorrectRole(text);
      if (aiResult) {
        if (!aiResult.isValid && aiResult.warning) {
          return { text: aiResult.warning };
        }
        if (!aiResult.isValid && aiResult.suggestion) {
          return { text: aiResult.suggestion };
        }
        // Si la IA corrigiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³/mejorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ el rol, usar la versiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de la IA
        if (aiResult.isValid && aiResult.role) {
          role = aiResult.role;
        }
      }
    }

    if (!role) {
      // Intentar respuesta conversacional ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºnica
      const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.ASK_ROLE);
      return { text: this.normalizeConversationalMessage(conversational) || BotMessages.ERROR_ROLE_INVALID };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { role });

    // TransiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n: ASK_ROLE ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ ASK_EXPERIENCE (ASK_REMOTE eliminado del flujo)
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
              description: 'ReciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n graduado o sin experiencia laboral',
            },
            {
              id: 'exp_junior',
              title: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
              description: 'Experiencia inicial en el campo',
            },
            {
              id: 'exp_mid',
              title: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
              description: 'Experiencia sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³lida',
            },
            {
              id: 'exp_senior',
              title: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
              description: 'Experto en el ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rea',
            },
            {
              id: 'exp_lead',
              title: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
              description: 'Liderazgo y expertise avanzado',
            },
          ],
        },
      ],
    };
  }

  // [DESACTIVADO] Pregunta de remoto eliminada del flujo de onboarding
  // /**
  //  * Estado ASK_REMOTE: Pregunta rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡pida si quiere remoto
  //  * Si dice SÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ agrega "remoto" al rol para la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda
  //  * Si dice No ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ mantiene el rol tal cual
  //  * Luego transiciona a ASK_EXPERIENCE
  //  */
  // private async handleAskRemoteState(userId: string, text: string): Promise<BotReply> {
  /*
    const normalizedText = text.trim().toLowerCase();
    const isYes = ['sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­', 'si', 'yes', 'remote_yes'].includes(normalizedText);
    const isNo = ['no', 'remote_no'].includes(normalizedText);

    if (!isYes && !isNo) {
      return {
        text: `Solo necesito saber: ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿te interesa trabajar *remoto*? ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â `,
        buttons: [
          { id: 'remote_yes', title: 'S\u00ED'},
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
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Rol actualizado con remoto: "${currentRole}" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ "${currentRole} remoto"`);
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
            { id: 'exp_none', title: 'Sin experiencia', description: 'ReciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n graduado o sin experiencia laboral' },
            { id: 'exp_junior', title: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experiencia inicial en el campo' },
            { id: 'exp_mid', title: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experiencia sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³lida' },
            { id: 'exp_senior', title: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experto en el ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rea' },
            { id: 'exp_lead', title: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Liderazgo y expertise avanzado' },
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
                description: 'ReciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n graduado o sin experiencia laboral',
              },
              {
                id: 'exp_junior',
                title: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                description: 'Experiencia inicial en el campo',
              },
              {
                id: 'exp_mid',
                title: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                description: 'Experiencia sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³lida',
              },
              {
                id: 'exp_senior',
                title: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                description: 'Experto en el ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rea',
              },
              {
                id: 'exp_lead',
                title: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                description: 'Liderazgo y expertise avanzado',
              },
            ],
          },
        ],
      };
    }

    // Guardar en UserProfile
    await this.updateUserProfile(userId, { experienceLevel });

    // TransiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n: ASK_EXPERIENCE ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ ASK_LOCATION
    await this.updateSessionState(userId, ConversationState.ASK_LOCATION);

    return { text: BotMessages.ASK_LOCATION };
  }

  /**
   * Estado ASK_LOCATION: Esperando ciudad/ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
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

    // Siempre pasar por IA primero para ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½n.
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
      // Intentar respuesta conversacional ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½nica
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
        { id: 'alerts_yes', title: 'S\u00ED, activar'},
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
  //               { id: 'work_remoto', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ HÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­brido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ Sin preferencia', description: 'Cualquier modalidad' },
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
  //             { id: 'internship', title: 'PasantÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a', description: 'PrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡cticas profesionales' },
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
              { id: 'freq_daily', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Diariamente' },
              { id: 'freq_every_3_days', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Cada 3 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as' },
              { id: 'freq_weekly', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Semanalmente' },
              { id: 'freq_monthly', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Mensualmente' },
            ],
          },
        ],
      };
    }

    // Guardar temporalmente en session.data (lo guardamos definitivamente cuando guarde la hora)
    await this.updateSessionData(userId, { alertFrequency: frequency });

    // TransiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n: ASK_ALERT_FREQUENCY ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ ASK_ALERT_TIME
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
   * ACTUALIZADO: Siempre muestra lista interactiva para el menÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº
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

    const confirmationMessage = `ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Listo! ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦
Alertas activadas ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â a las ${alertTime}

Cuando te llegue la notificaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, toca *"Buscar empleos"* para ver las ofertas.

ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Ten en cuenta:

ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Cada vez que le des clic en "Buscar empleos" consumes 1 bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda.

Actualmente tienes el Plan Free: 5 bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas por una semana.

ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿QuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© quieres hacer ahora?`;

    return {
      text: confirmationMessage,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: 'Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado READY: Usuario completÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ onboarding
   * ACTUALIZADO: Siempre usa botones/listas interactivas
   */
  private async handleReadyState(
    userId: string,
    text: string,
    intent: UserIntent,
  ): Promise<BotReply> {
    // Detectar intenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de reiniciar perfil
    if (isRestartIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_RESTART);
      return {
        text: BotMessages.CONFIRM_RESTART,
        buttons: [
          { id: 'confirm_restart', title: 'S\u00ED, reiniciar'},
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Detectar intenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de cancelar servicio
    if (isCancelServiceIntent(text)) {
      await this.updateSessionState(userId, ConversationState.CONFIRM_CANCEL_SERVICE);
      return {
        text: BotMessages.CONFIRM_CANCEL_SERVICE,
        buttons: [
          { id: 'confirm_cancel', title: 'S\u00ED, confirmar'},
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Detectar intenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de editar/cambiar preferencias
    if (this.shouldRedirectToEditFlow(text, intent)) {
      return await this.redirectReadyUserToEditFlow(userId);
    }

    // Detectar intenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de buscar empleos
    if (intent === UserIntent.SEARCH_NOW) {
      // Freemium V2: al abrir alerta pendiente, mostrar 1 vacante con el texto nuevo.
      const v2PendingAlert = await this.getLatestNonStalePendingAlert(userId);
      if (v2PendingAlert) {
        const onboardingFlags = await this.getOnboardingFlags(userId);
        const isFreemiumV2 = onboardingFlags.flowVariant === this.v2FlowVariant;
        const pendingJobs = v2PendingAlert.jobs as any[];

        if (isFreemiumV2 && pendingJobs.length > 0) {
          await this.prisma.pendingJobAlert.update({
            where: { id: v2PendingAlert.id },
            data: { viewedAt: new Date() },
          });
          await this.jobSearchService.markJobsAsSent(userId, [pendingJobs[0]]);
          return { text: this.buildReadySearchSingleVacancyMessage(pendingJobs[0] as JobPosting) };
        }
      }

      // PRIMERO: Verificar si hay alertas pendientes de un template notification
      const pendingAlert = await this.getLatestNonStalePendingAlert(userId);

      if (pendingAlert) {
        // Hay ofertas pendientes del template ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ enviarlas
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Usuario ${userId} tiene ${pendingAlert.jobCount} ofertas pendientes`);

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
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${job.company || 'Empresa confidencial'}\n` +
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ${job.locationRaw || 'Sin ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n'}\n` +
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas (evitar duplicados en futuras bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas)
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        return {
          text: `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ *ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡AquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡n tus ofertas de empleo!*\n\n${formattedJobs}\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }

      // No hay alertas pendientes ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ hacer bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda normal
      // Verificar usos disponibles ANTES de buscar (sin descontar)
      const usageCheck = await this.checkUsageAvailable(userId);

      if (!usageCheck.allowed) {
        // Verificar si es usuario premium sin bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas semanales
        const subscription = await this.prisma.subscription.findUnique({
          where: { userId },
        });

        if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
          // Usuario pagado que alcanzÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­mite semanal: NO cambiar estado
          this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ Usuario pagado ${userId} alcanzÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­mite semanal, mostrando mensaje de espera`);
          return { text: usageCheck.message || 'Has alcanzado tu lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­mite semanal de bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas.' };
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

      // Ejecutar bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda con el usesLeft actualizado
      const searchResult = await this.performJobSearch(userId, deduction.usesLeft);

      // Si hubo error en la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda, el uso ya fue descontado (comportamiento esperado)
      const isError = searchResult.text?.includes('Lo siento, no pude buscar ofertas');
      if (isError) {
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â BÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda fallÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ para usuario ${userId}, pero el uso ya fue descontado`);
      }

      return searchResult;
    }

    // Siempre mostrar menÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº de comandos con lista interactiva
    return {
      text: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿QuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© te gustarÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a hacer?',
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: 'Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Ejecuta bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda de empleos y devuelve resultados formateados
   */
  private async performJobSearch(userId: string, usesLeftAfterDeduction?: number): Promise<BotReply> {
    try {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Usuario ${userId} solicitÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda de empleos`);

      // Determinar maxResults segÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn plan y variante de flujo.
      // V2 freemium: 1 vacante por interacciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n.
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      const onboardingFlags = await this.getOnboardingFlags(userId);
      const isPaidPlan = subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO';
      const isFreemiumV2 = subscription?.plan === 'FREEMIUM' && onboardingFlags.flowVariant === this.v2FlowVariant;
      const maxResults = isPaidPlan ? 5 : (isFreemiumV2 ? 1 : 3);

      // Ejecutar bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda
      const result = await this.jobSearchService.searchJobsForUser(userId, maxResults);

      // Si no hay ofertas, sugerir roles alternativos con IA
      if (result.jobs.length === 0) {
        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const currentRole = profile?.role || 'tu perfil';

        const suggestions = await this.llmService.suggestRelatedRoles(currentRole);
        const suggestionsText = suggestions.length > 0
          ? `\n\nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ *Roles relacionados que podrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as probar:*\n${suggestions.map((s) => `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${s}`).join('\n')}\n\nPuedes escribir *"editar"* para cambiar tu cargo.`
          : `\n\nIntenta de nuevo mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s tarde o escribe *"editar"* para ajustar tus preferencias.`;

        return {
          text: `No encontrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© ofertas que coincidan con *"${currentRole}"* en este momento. ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â${suggestionsText}`,
        };
      }

      const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(result.jobs);
      const primarySearchMessage =
        result.jobs.length === 1
          ? this.buildReadySearchSingleVacancyMessage(result.jobs[0])
          : formattedJobs;

      await this.jobSearchService.markJobsAsSent(userId, result.jobs);

      let exhaustedMessage = '';
      if (result.offersExhausted) {
        exhaustedMessage = `

ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â *ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡AtenciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n!* Has visto todas las ofertas disponibles para tu perfil actual. Para tu prÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³xima bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda puedes:
ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Esperar un tiempo mientras se publican nuevas ofertas
ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Escribir *"editar"* para ajustar tus preferencias y encontrar mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s opciones`;
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

        menuText = `*B\u00FAsquedas restantes esta semana:* 0 (Plan Free)

Hay muchas ofertas que podemos cazar por ti en internet para tu rol (*${userRole}*).
Si quieres seguir recibi\u00E9ndolas de forma autom\u00E1tica y filtradas seg\u00FAn tu perfil, activa CIO por solo *$20.000 COP al mes* y contin\u00FAa tu b\u00FAsqueda sin l\u00EDmites.
Act\u00EDvalo aqu\u00ED:

${checkoutLink}

Estoy lista para ayudarte a cazar tu pr\u00F3xima oportunidad.`;
      } else {
        const searchWord = usesLeft === 1 ? 'b\u00FAsqueda' : 'b\u00FAsquedas';
        menuText = `\u{1F4CC} Te quedan *${usesLeft} ${searchWord} esta semana* (${planLabel}).

\u26A0\uFE0F \u00BFLas ofertas no encajan del todo?

Puedes ir a *Editar perfil* y ajustar tu rol, ciudad o preferencias.

\u00BFQu\u00E9 quieres hacer ahora?`;
      }

      return {
        text: primarySearchMessage + exhaustedMessage,
        delayedMessage: {
          text: menuText,
          delayMs: DELAY_MS,
          listTitle: 'Ver opciones',
          listSections: [
            {
              title: 'Acciones disponibles',
              rows: [
                { id: 'cmd_buscar', title: 'Buscar empleos', description: 'Encontrar m\u00E1s ofertas' },
                { id: 'cmd_editar', title: 'Editar perfil', description: 'Cambiar tus preferencias' },
                { id: 'cmd_reiniciar', title: 'Reiniciar', description: 'Reconfigurar tu perfil' },
                { id: 'cmd_cancelar', title: 'Cancelar servicio', description: 'Dejar de usar el CIO' },
              ],
            },
          ],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error en bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda de empleos: ${errorMessage}`);

      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
      });

      const heuristicDiagnosis = this.detectSearchProfileIssue(profile);
      if (heuristicDiagnosis) {
        return { text: heuristicDiagnosis };
      }

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
        text: `Lo siento, no pude buscar ofertas en este momento. ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â

Por favor intenta de nuevo en unos minutos.`,
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
      text: `${BotMessages.OFFER_ALERTS}\n\n_Por favor, selecciona una opciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n:_`,
      buttons: [
        { id: 'accept_alerts', title: 'S\u00ED, activar'},
        { id: 'reject_alerts', title: 'No, gracias' },
      ],
    };
  }

  /**
   * Estado CONFIRM_RESTART: Confirmando reinicio de perfil
   * ACTUALIZADO: Va directamente a ASK_ROLE (sin tÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rminos)
   */
  private async handleConfirmRestartState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ reinicio
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
      // Usuario cancelÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ el reinicio
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.RESTART_CANCELLED);
    }

    // Respuesta ambigua ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_RESTART);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_restart', title: 'S\u00ED, reiniciar'},
          { id: 'cancel_restart', title: 'No, cancelar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `${BotMessages.CONFIRM_RESTART}\n\n_Por favor, selecciona una opciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n:_`,
      buttons: [
        { id: 'confirm_restart', title: 'S\u00ED, reiniciar'},
        { id: 'cancel_restart', title: 'No, cancelar' },
      ],
    };
  }

  /**
   * Estado CONFIRM_CANCEL_SERVICE: Confirmando cancelaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n del servicio
   */
  private async handleConfirmCancelServiceState(userId: string, text: string): Promise<BotReply> {
    if (isAcceptance(text)) {
      // Usuario confirmÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ cancelaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
      await this.deleteUserCompletely(userId);
      return { text: BotMessages.SERVICE_CANCELLED };
    }

    if (isRejection(text)) {
      // Usuario decidiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ no cancelar
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.CANCEL_SERVICE_ABORTED);
    }

    // Respuesta ambigua ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â intentar respuesta conversacional de la IA
    const conversational = await this.llmService.generateConversationalResponse(text, ConversationState.CONFIRM_CANCEL_SERVICE);
    if (conversational) {
      return {
        text: this.normalizeConversationalMessage(conversational) || conversational,
        buttons: [
          { id: 'confirm_cancel', title: 'S\u00ED, confirmar'},
          { id: 'abort_cancel', title: 'No, continuar' },
        ],
      };
    }

    // Fallback: repetir botones
    return {
      text: `${BotMessages.CONFIRM_CANCEL_SERVICE}\n\n_Por favor, selecciona una opciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n:_`,
      buttons: [
        { id: 'confirm_cancel', title: 'S\u00ED, confirmar'},
        { id: 'abort_cancel', title: 'No, continuar' },
      ],
    };
  }

  /**
   * Maneja la subida de CV (stub)
   */
  private async handleCVUpload(userId: string, mediaUrl: string): Promise<BotReply> {
    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ CV recibido de usuario ${userId}: ${mediaUrl}`);

    // TODO: Implementar con CvService
    // await this.cvService.processCV(userId, mediaUrl);

    return {
      text: `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Gracias por enviar tu CV! ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾

Por ahora estoy en pruebas y no puedo procesarlo aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn, pero pronto podrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© extraer informaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n automÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ticamente.

ContinÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºa con el proceso manual. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡`,
    };
  }

  // ========================================
  // MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©todos de ediciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de perfil
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
      text: `\u{1F4DD} *Tus preferencias actuales:*

\u{1F539} *Rol:* ${formattedProfile.role}
\u{1F4A1} *Experiencia:* ${formattedProfile.experience}
\u{1F4CD} *Ubicaci\u00F3n:* ${formattedProfile.location}
\u23F0 *Horario de alertas:* ${formattedProfile.alertTime}

Selecciona qu\u00E9 quieres editar:`,
      listTitle: 'Editar campo',
      listSections: [
        {
          title: 'Preferencias',
          rows: [
            {
              id: 'edit_rol',
              title: '\u{1F539} Rol',
              description: `Actual: ${formattedProfile.role}`,
            },
            {
              id: 'edit_experiencia',
              title: '\u{1F4A1} Experiencia',
              description: `Actual: ${formattedProfile.experience}`,
            },
            {
              id: 'edit_ubicacion',
              title: '\u{1F4CD} Ubicaci\u00F3n',
              description: `Actual: ${formattedProfile.location}`,
            },
            // [DESACTIVADO] Frecuencia - siempre es diaria
            {
              id: 'edit_horario',
              title: '\u23F0 Horario alertas',
              description: `Actual: ${formattedProfile.alertTime}`,
            },
            {
              id: 'cmd_cancelar',
              title: '\u274C Cancelar',
              description: 'Volver al men\u00FA principal',
            },
          ],
        },
      ],
    };
  }

  /**
   * Estado EDITING_PROFILE: Usuario eligiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ editar, ahora debe seleccionar quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© campo
   * ACTUALIZADO: Siempre usa listas interactivas
   */
  private async handleEditingProfileState(userId: string, text: string): Promise<BotReply> {
    // Permitir cancelar
    if (isRejection(text) || text.toLowerCase().includes('cancelar')) {
      await this.updateSessionState(userId, ConversationState.READY);
      return await this.returnToMainMenu(userId, BotMessages.NOT_READY_YET);
    }

    // Detectar quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© campo quiere editar
    const field = detectEditField(text);

    if (!field) {
      // Mostrar lista de campos editables si no entendiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³
      return await this.showProfileForEditing(userId);
    }

    // Transicionar al estado de ediciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n correspondiente
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
                  description: 'ReciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n graduado',
                },
                {
                  id: 'exp_junior',
                  title: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                  description: 'Experiencia inicial',
                },
                {
                  id: 'exp_mid',
                  title: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                  description: 'Experiencia sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³lida',
                },
                {
                  id: 'exp_senior',
                  title: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
                  description: 'Experto',
                },
                {
                  id: 'exp_lead',
                  title: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
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
      // Intentar respuesta conversacional ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºnica
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
              { id: 'exp_none', title: 'Sin experiencia', description: 'ReciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n graduado' },
              { id: 'exp_junior', title: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experiencia inicial' },
              { id: 'exp_mid', title: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experiencia sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³lida' },
              { id: 'exp_senior', title: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Experto' },
              { id: 'exp_lead', title: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)', description: 'Liderazgo avanzado' },
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
   * Estado EDIT_LOCATION: Editando ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
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

    // Siempre pasar por IA primero en ediciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½n de ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½n.
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
      // Intentar respuesta conversacional ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½nica
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
      normalized.includes('uniÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n europea')
    ) {
      return `Esa ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n es muy amplia para buscar ofertas. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â

Por favor escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* de Europa.

Ejemplo: "Oporto", "Lisboa", "Madrid", "Portugal", "EspaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±a".`;
    }

    if (normalized.includes('asia')) {
      return `Esa ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n es muy amplia para buscar ofertas. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â

Por favor escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* de Asia.

Ejemplo: "Tokio", "Singapur", "Bangkok", "JapÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n", "India".`;
    }

    if (normalized.includes('africa') || normalized.includes('ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡frica')) {
      return `Esa ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n es muy amplia para buscar ofertas. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â

Por favor escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* de ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âfrica.

Ejemplo: "Nairobi", "Ciudad del Cabo", "El Cairo", "Kenia", "SudÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡frica".`;
    }

    if (normalized.includes('oceania') || normalized.includes('oceanÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a')) {
      return `Esa ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n es muy amplia para buscar ofertas. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â

Por favor escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* de OceanÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a.

Ejemplo: "SÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­dney", "Melbourne", "Auckland", "Australia", "Nueva Zelanda".`;
    }

    if (
      normalized.includes('norteamerica') ||
      normalized.includes('norteamÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rica') ||
      normalized.includes('north america')
    ) {
      return `Esa ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n es muy amplia para buscar ofertas. ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½

Por favor escribe una *ciudad* o *paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s* de NorteamÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rica.

Ejemplo: "Toronto", "Miami", "New York", "CanadÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡", "Estados Unidos".`;
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
  //               { id: 'work_remoto', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Remoto', description: 'Trabajar desde casa' },
  //               { id: 'work_presencial', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Presencial', description: 'Ir a la oficina' },
  //               { id: 'work_hibrido', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ HÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­brido', description: 'Mixto (remoto + presencial)' },
  //               { id: 'work_sin_preferencia', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ Sin preferencia', description: 'Cualquier modalidad' },
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
              { id: 'freq_daily', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Diariamente' },
              { id: 'freq_every_3_days', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Cada 3 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as' },
              { id: 'freq_weekly', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Semanalmente' },
              { id: 'freq_monthly', title: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Mensualmente' },
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
   * Verifica si el usuario tiene usos disponibles (por si un admin los aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±adiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³)
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

      // Verificar si el premium expirÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ por 30 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as
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

    // Freemium: usar la misma regla canÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³nica en todo el sistema.
    return !shouldExpireFreemiumByPolicy({
      startDate: subscription.freemiumStartDate,
      usesLeft: subscription.freemiumUsesLeft,
      freemiumPolicy: (subscription as any).freemiumPolicy,
      freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
    });
  }

  /**
   * Estado FREEMIUM_EXPIRED: El usuario agotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ su freemium
   */
  private async handleFreemiumExpiredState(userId: string, text: string): Promise<BotReply> {
    // PRIMERO: Si el usuario hace clic en "ver ofertas" y tiene alertas pendientes, mostrarlas
    const intent = detectIntent(text);
    if (intent === UserIntent.SEARCH_NOW) {
      const pendingAlert = await this.getLatestNonStalePendingAlert(userId);

      if (pendingAlert) {
        this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Usuario ${userId} (FREEMIUM_EXPIRED) tiene ${pendingAlert.jobCount} ofertas pendientes`);

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
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${job.company || 'Empresa confidencial'}\n` +
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ${job.locationRaw || 'Sin ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n'}\n` +
            `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ${cleanUrl}`;
        }).join('\n\n');

        // Marcar ofertas como enviadas
        await this.jobSearchService.markJobsAsSent(userId, jobs);

        // Si el usuario tiene usos disponibles, volver a READY
        if (await this.checkIfUserHasUsesAvailable(userId)) {
          await this.updateSessionState(userId, ConversationState.READY);
        }

        return {
          text: `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ *ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡AquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡n tus ofertas de empleo!*\n\n${formattedJobs}\n\nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`
        };
      }
    }

    // Verificar el tipo de suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si es usuario pagado activo (PREMIUM/PRO), NO deberÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a estar aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ - devolverlo a READY
    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario pagado ${userId} estaba en FREEMIUM_EXPIRED incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      // Verificar si tiene bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles o estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ esperando
      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles.`);
      } else {
        // Premium sin bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas semanales - mostrar mensaje de espera
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±adiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos mientras estaba en este estado (para freemium)
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario ${userId} recuperÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles nuevamente.`);
    }

    // Solo para usuarios freemium: transiciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a pedir email
    await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
    return { text: BotMessages.FREEMIUM_EXPIRED_ASK_EMAIL };
  }

  /**
   * Estado ASK_EMAIL: Pedir email para vincular pago
   */
  private async handleAskEmailState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no deberÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a estar aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario pagado ${userId} estaba en ASK_EMAIL incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±adiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario ${userId} recuperÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles nuevamente.`);
    }

    const email = text.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { text: BotMessages.ERROR_EMAIL_INVALID };
    }

    // Buscar transacciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n aprobada con ese email que no estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© vinculada
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        email,
        wompiStatus: 'APPROVED',
        userId: null, // No vinculada aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn
      },
    });

    if (transaction) {
      // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Pago encontrado! Vincular y activar premium
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
   * Estado WAITING_PAYMENT: Usuario esperando confirmaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de pago
   */
  private async handleWaitingPaymentState(userId: string, text: string): Promise<BotReply> {
    // Verificar si es usuario premium - no deberÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a estar aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if ((subscription?.plan === 'PREMIUM' || subscription?.plan === 'PRO') && subscription?.status === 'ACTIVE') {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario pagado ${userId} estaba en WAITING_PAYMENT incorrectamente, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);

      const weekStart = subscription.premiumWeekStart;
      const now = new Date();
      const hasUses = !weekStart || this.isNewWeek(weekStart, now) || subscription.premiumUsesLeft > 0;

      if (hasUses) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Hola de nuevo, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles.`);
      } else {
        const resetDate = new Date(weekStart!.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { text: BotMessages.PREMIUM_WEEKLY_LIMIT_REACHED(resetDate) };
      }
    }

    // Verificar si el admin aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±adiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos mientras estaba en este estado
    if (await this.checkIfUserHasUsesAvailable(userId)) {
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Usuario ${userId} recuperÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ usos, volviendo a READY`);
      await this.updateSessionState(userId, ConversationState.READY);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      return await this.returnToMainMenu(userId, `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Buenas noticias, ${getFirstName(user?.name)}! Tienes bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas disponibles nuevamente.`);
    }

    const lower = text.toLowerCase().trim();

    // Si escribe "verificar", "comprobar" o similar, re-verificar pago
    if (
      lower.includes('verificar') ||
      lower.includes('comprobar') ||
      lower.includes('ya pague') ||
      lower.includes('ya paguÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©')
    ) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      if (!user?.email) {
        await this.updateSessionState(userId, ConversationState.ASK_EMAIL);
        return { text: 'Por favor, primero ingresa tu correo electrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³nico.' };
      }

      // Buscar transacciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n aprobada
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
        text: `ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Email actualizado a *${newEmail}*.\n\nEscribe *"verificar"* cuando hayas realizado el pago.`,
      };
    }

    // Mostrar ayuda con botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de verificar
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

    // Vincular transacciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        userId,
        linkedAt: new Date(),
      },
    });

    // Actualizar suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a premium con expiraciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a 30 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as
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

    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ Usuario ${userId} activado como PREMIUM (expira: ${premiumEndDate.toISOString()})`);
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

    // Si no tiene suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, puede usar (se crearÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ freemium despuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©s)
    if (!subscription) {
      return { allowed: true, currentUses: 3 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expirÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ (30 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as)
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
   * Descuenta un uso del servicio (llamar SOLO despuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©s de una operaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n exitosa)
   * @returns { usesLeft: number }
   */
  async deductUsage(userId: string): Promise<{ usesLeft: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ 1 (de 5 totales)
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

    // Si no tiene suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, crear una freemium
    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREEMIUM',
          freemiumUsesLeft: 4, // Ya usÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ 1 (de 5 totales)
        },
      });
      return { allowed: true, usesLeft: 4 };
    }

    // PLAN PAGADO (PREMIUM/PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

      // Verificar si el plan premium expirÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ (30 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as)
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

      // Verificar si es nueva semana (cada 7 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as desde premiumWeekStart)
      const weekStart = subscription.premiumWeekStart;

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        // Resetear usos semanales
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 que estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ usando ahora
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

      // Calcular fecha de reinicio (7 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as desde premiumWeekStart)
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
   * Verifica si han pasado 7 dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as desde el inicio de la semana premium
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
      internship: 'PasantÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a',
      freelance: 'Freelance',
    };

    return typeMap[jobType || ''] || 'No configurado';
  }

  private formatExperienceLevel(experienceLevel: string | null | undefined): string {
    const experienceMap: Record<string, string> = {
      none: 'Sin experiencia',
      junior: 'Junior (1-2 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
      mid: 'Intermedio (3-5 aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
      senior: 'Senior (5+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
      lead: 'Lead/Expert (7+ aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±os)',
    };

    return experienceMap[experienceLevel || ''] || 'No configurado';
  }

  /**
   * Detecta errores comunes en parÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡metros de perfil que suelen romper la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda.
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
      return `No pude completar la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda porque tu *cargo parece tener varios roles al mismo tiempo*.

Para obtener mejores resultados, entra a *Editar perfil* y deja solo *un rol principal* (ej: _Asesor comercial_).

DespuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©s vuelve a escribir *buscar*.`;
    }

    if (!role || role.length < 2) {
      return `No pude completar la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda porque tu *cargo* no estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ bien definido.

Entra a *Editar perfil*, ajusta tu cargo principal y vuelve a buscar.`;
    }

    if (!location || location.length < 2) {
      return `No pude completar la bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda porque tu *ubicaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n* no estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ bien definida.

Entra a *Editar perfil*, ajusta tu ciudad o paÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­s y vuelve a buscar.`;
    }

    return null;
  }

  // [DESACTIVADO] Formatea el workMode para mostrar al usuario - Puede reactivarse
  // /**
  //  * Formatea el workMode para mostrar al usuario
  //  */
  // private formatWorkMode(workMode: string | null | undefined): string {
  //   const workModeMap: Record<string, string> = {
  //     remoto: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Remoto',
  //     presencial: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Presencial',
  //     hibrido: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ HÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­brido',
  //     sin_preferencia: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ Sin preferencia',
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
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ Onboarding email enviado automatico (registro chat) a ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error enviando onboarding email automatico (registro chat) a ${email} (usuario ${userId}): ${errorMessage}`,
      );
    }
  }

  // ========================================
  // MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©todos auxiliares de base de datos
  // ========================================

  /**
   * Busca un usuario por telÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©fono (NO crea si no existe)
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
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Usuario creado: ${phone}`);
    }

    return user;
  }

  /**
   * Obtiene o crea una sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n activa
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
      this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ SesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n creada para usuario ${userId}`);
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
   * Garantiza que la sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n tenga una variante de flujo explÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cita.
   * - Si ya tiene variante vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida, la respeta.
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

  // [ELIMINADO] getDeviceType ya no se usa, todos son tratados como mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³vil
  // private async getDeviceType(userId: string): Promise<'MOBILE' | 'DESKTOP'> { ... }

  /**
   * Helper: Regresar al menÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº principal con opciones interactivas
   * ACTUALIZADO: Siempre muestra lista interactiva (todos tratados como mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³vil)
   */
  private async returnToMainMenu(_userId: string, message: string): Promise<BotReply> {
    // Siempre retornar lista interactiva
    return {
      text: `${message}\n\n\u00bfQu\u00e9 te gustar\u00eda hacer?`,
      listTitle: 'Ver opciones',
      listSections: [
        {
          title: 'Comandos disponibles',
          rows: [
            {
              id: 'cmd_buscar',
              title: 'Buscar empleos',
              description: 'Encontrar ofertas ahora',
            },
            {
              id: 'cmd_editar',
              title: 'Editar perfil',
              description: 'Cambiar tus preferencias',
            },
            {
              id: 'cmd_reiniciar',
              title: 'Reiniciar',
              description: 'Reconfigurar desde cero',
            },
            {
              id: 'cmd_cancelar',
              title: 'Cancelar servicio',
              description: 'Dejar de usar el servicio',
            },
          ],
        },
      ],
    };
  }

  /**
   * Actualiza el estado de la sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
   */
  private async updateSessionState(userId: string, newState: ConversationState) {
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        state: newState,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  Estado actualizado a: ${newState}`);
  }

  /**
   * Actualiza datos temporales en la sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n (campo JSON data)
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

    this.logger.debug(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ Datos de sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n actualizados: ${JSON.stringify(newData)}`);
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
          `Descartadas ${deleted.count} ofertas pendientes de ${userId} por actualizaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de perfil`,
        );
      }
    }

    this.logger.debug(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Perfil actualizado: ${JSON.stringify(data)}`);
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

    this.logger.debug(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° Alerta configurada para: ${alertTime} con frecuencia ${alertFrequency}`);
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

    // Eliminar bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas y trabajos enviados (pueden ser mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltiples)
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a NEW
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

    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ Perfil reiniciado para usuario ${userId}`);
  }

  /**
   * "Cancela" el servicio: elimina preferencias pero mantiene datos de identidad y suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
   * Esto evita que el usuario pueda re-registrarse para una nueva prueba gratuita
   */
  private async deleteUserCompletely(userId: string) {
    // Eliminar UserProfile (preferencias de bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda)
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

    // Eliminar bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsquedas y trabajos enviados
    await this.prisma.jobSearchLog.deleteMany({ where: { userId } });
    await this.prisma.sentJob.deleteMany({ where: { userId } });

    // Resetear sesiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a NEW
    await this.prisma.session.updateMany({
      where: { userId },
      data: { state: ConversationState.NEW, data: {}, updatedAt: new Date() },
    });

    // NO eliminar User ni Subscription
    // El usuario mantiene su identidad y estado de suscripciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n

    this.logger.log(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Preferencias eliminadas para usuario ${userId} (usuario NO eliminado)`);
  }
}


