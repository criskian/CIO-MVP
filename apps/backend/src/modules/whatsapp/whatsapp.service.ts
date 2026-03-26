import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { IWhatsappProvider, BotReply } from './interfaces/whatsapp-provider.interface';
import { CloudApiProvider } from './providers/cloud-api.provider';
import { BotMessages } from '../conversation/helpers/bot-messages';
import { PrismaService } from '../database/prisma.service';
import { repairMojibakeText as repairMojibakeUtil } from '../../common/text/mojibake.util';

/**
 * Servicio principal de WhatsApp
 * ActÃºa como adapter agnÃ³stico entre el proveedor y el resto de la aplicaciÃ³n
 * NO contiene lÃ³gica de negocio, solo adapta mensajes
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: IWhatsappProvider;
  private readonly canonicalButtonTitles: Record<string, string> = {
    confirm_restart: 'SÃ­, reiniciar',
    cancel_restart: 'No, cancelar',
    confirm_cancel: 'SÃ­, confirmar',
    abort_cancel: 'No, continuar',
    accept_alerts: 'SÃ­, activar',
    reject_alerts: 'No, gracias',
    alerts_yes: 'SÃ­, activar',
    alerts_no: 'No, gracias',
    remote_yes: 'SÃ­',
    remote_no: 'No',
    lead_interest_yes: 'SÃ­, me interesÃ³',
    lead_interest_no: 'No me interesÃ³',
    lead_terms_accept: 'Acepto',
    lead_terms_reject: 'No acepto',
    continue: 'A buscar empleo',
    cmd_ofertas: 'Ver ofertas ahora',
    cmd_pagar: 'Activar premium',
    cmd_verificar: 'Verificar pago',
  };
  private readonly canonicalRowTitles: Record<string, string> = {
    cmd_buscar: 'Buscar empleos',
    cmd_editar: 'Editar perfil',
    cmd_reiniciar: 'Reiniciar',
    cmd_cancelar: 'Cancelar servicio',
    cmd_ofertas: 'Ver ofertas ahora',
    cmd_pagar: 'Activar premium',
    edit_rol: 'ðŸ”¹ Rol',
    edit_experiencia: 'ðŸ’¡ Experiencia',
    edit_ubicacion: 'ðŸ“ UbicaciÃ³n',
    edit_horario: 'â° Horario alertas',
    reason_role: 'Cargo',
    reason_location: 'Ciudad',
    reason_company: 'Empresa',
    reason_salary: 'Salario',
    reason_remote: 'Remoto',
    reason_other: 'Otro motivo',
    exp_none: 'Sin experiencia',
    exp_junior: 'Junior (1-2 aÃ±os)',
    exp_mid: 'Intermedio (3-5 aÃ±os)',
    exp_senior: 'Senior (5+ aÃ±os)',
    exp_lead: 'Lead/Expert (7+ aÃ±os)',
    freq_daily: 'Diariamente',
    freq_every_3_days: 'Cada 3 dÃ­as',
    freq_weekly: 'Semanalmente',
    freq_monthly: 'Mensualmente',
  };
  private readonly canonicalRowDescriptions: Record<string, string> = {
    cmd_buscar: 'Encontrar ofertas ahora',
    cmd_editar: 'Cambiar tus preferencias',
    cmd_reiniciar: 'Reconfigurar desde cero',
    cmd_cancelar: 'Dejar de usar el servicio',
    cmd_ofertas: 'Revisar las ofertas disponibles',
    reason_role: 'El cargo no encaja',
    reason_location: 'La ciudad no me sirve',
    reason_company: 'La empresa no me interesa',
    reason_salary: 'El salario no se ajusta',
    reason_remote: 'Busco una modalidad diferente',
    reason_other: 'Te explico el motivo',
    exp_none: 'ReciÃ©n graduado o sin experiencia laboral',
    exp_junior: 'Experiencia inicial en el campo',
    exp_mid: 'Experiencia sÃ³lida',
    exp_senior: 'Experto en el Ã¡rea',
    exp_lead: 'Liderazgo y expertise avanzado',
  };

  // Cache para deduplicaciÃ³n de mensajes (messageId -> timestamp)
  private readonly processedMessages = new Map<string, number>();

  // Tiempo mÃ¡ximo para aceptar un mensaje (2 minutos)
  private readonly MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;

  // Tiempo para mantener IDs en cache (10 minutos)
  private readonly CACHE_RETENTION_MS = 10 * 60 * 1000;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly cloudApiProvider: CloudApiProvider,
    private readonly prisma: PrismaService,
  ) {
    // Usar Cloud API como provider Ãºnico
    this.provider = this.cloudApiProvider;
    this.logger.log('ðŸ“± Usando WhatsApp Cloud API como proveedor');

    // Limpiar cache cada 5 minutos
    setInterval(() => this.cleanupMessageCache(), 5 * 60 * 1000);
  }

  private repairMojibakeText(text: string): string {
    if (!text) return text;

    const hasSuspiciousChars =
      /[\u00C2\u00C3\u00E2\u00F0]/.test(text) || text.includes('\uFFFD');
    if (!hasSuspiciousChars) return text;

    let candidate = text;
    for (let i = 0; i < 3; i += 1) {
      try {
        const repaired = Buffer.from(candidate, 'latin1').toString('utf8');
        if (!repaired || repaired === candidate) {
          break;
        }
        candidate = repaired;
      } catch {
        break;
      }
    }

    const normalizedCandidate = this.applyKnownMojibakeReplacements(candidate);
    const normalizedOriginal = this.applyKnownMojibakeReplacements(text);

    const fixed =
      this.countSuspiciousChars(normalizedCandidate) <= this.countSuspiciousChars(normalizedOriginal)
        ? normalizedCandidate
        : normalizedOriginal;

    if (fixed.includes('\uFFFD') && !normalizedOriginal.includes('\uFFFD')) {
      return normalizedOriginal;
    }

    return fixed;
  }

  private countSuspiciousChars(value: string): number {
    const matches = value.match(/[ÃƒÃ‚Ã¢Ã…Ã°\uFFFD]/g);
    return matches ? matches.length : 0;
  }

  private applyKnownMojibakeReplacements(value: string): string {
    let result = value;

    const replacements: Array<[string, string]> = [
      ['ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â', 'ðŸ“'],
      ['ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â¹', 'ðŸ”¹'],
      ['ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¡', 'ðŸ’¡'],
      ['ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â', 'ðŸ“'],
      ['ÃƒÂ¢Ã‚ÂÃ‚Â°', 'â°'],
      ['ÃƒÂ¢Ã‚ÂÃ…â€™', 'âŒ'],
      ['Ã°Å¸â€œÂ', 'ðŸ“'],
      ['Ã°Å¸â€Â¹', 'ðŸ”¹'],
      ['Ã°Å¸â€™Â¡', 'ðŸ’¡'],
      ['Ã°Å¸â€œÂ', 'ðŸ“'],
      ['Ã°Å¸â€Â', 'ðŸ”'],
      ['Ã¢ÂÂ°', 'â°'],
      ['Ã¢ÂÅ’', 'âŒ'],
      ['Ã¢Å“â€¦', 'âœ…'],
      ['Ã¢Å¡Â Ã¯Â¸Â', 'âš ï¸'],
      ['Ã¢Å“Â¨', 'âœ¨'],
      ['Ã¢â‚¬Â¢', 'â€¢'],
      ['Ã¢â‚¬Â¦', '...'],
      ['Ã¢â‚¬Å“', '"'],
      ['Ã¢â‚¬Â', '"'],
      ['Ã¢â‚¬â„¢', "'"],
      ['ÃƒÂ¡', 'Ã¡'],
      ['ÃƒÂ©', 'Ã©'],
      ['ÃƒÂ­', 'Ã­'],
      ['ÃƒÂ³', 'Ã³'],
      ['ÃƒÂº', 'Ãº'],
      ['ÃƒÂ', 'Ã'],
      ['Ãƒâ€°', 'Ã‰'],
      ['ÃƒÂ', 'Ã'],
      ['Ãƒâ€œ', 'Ã“'],
      ['ÃƒÅ¡', 'Ãš'],
      ['ÃƒÂ±', 'Ã±'],
      ['Ãƒâ€˜', 'Ã‘'],
      ['ÃƒÂ¼', 'Ã¼'],
      ['ÃƒÅ“', 'Ãœ'],
      ['Ã‚Â¿', 'Â¿'],
      ['Ã‚Â¡', 'Â¡'],
      ['Ã‚Â°', 'Â°'],
      ['Ã‚', ''],
    ];

    for (const [broken, fixed] of replacements) {
      result = result.split(broken).join(fixed);
    }

    return result;
  }

  private sanitizeBotReply(reply: BotReply): BotReply {
    const sanitizeText = (value?: string) => (value ? repairMojibakeUtil(value) : value);
    const sanitizeButtonTitle = (id: string, title: string) =>
      this.canonicalButtonTitles[id] ?? sanitizeText(title) ?? title;
    const sanitizeRowTitle = (id: string, title: string) =>
      this.canonicalRowTitles[id] ?? sanitizeText(title) ?? title;
    const sanitizeRowDescription = (id: string, description?: string) =>
      this.canonicalRowDescriptions[id] ?? sanitizeText(description);

    return {
      ...reply,
      text: sanitizeText(reply.text) || '',
      listTitle: sanitizeText(reply.listTitle),
      buttons: reply.buttons?.map((btn) => ({
        ...btn,
        title: sanitizeButtonTitle(btn.id, btn.title),
      })),
      listSections: reply.listSections?.map((section) => ({
        ...section,
        title: sanitizeText(section.title),
        rows: section.rows.map((row) => ({
          ...row,
          title: sanitizeRowTitle(row.id, row.title),
          description: sanitizeRowDescription(row.id, row.description),
        })),
      })),
      delayedMessage: reply.delayedMessage
        ? {
          ...reply.delayedMessage,
          text: sanitizeText(reply.delayedMessage.text) || '',
          listTitle: sanitizeText(reply.delayedMessage.listTitle),
          listSections: reply.delayedMessage.listSections?.map((section) => ({
            ...section,
            title: sanitizeText(section.title),
            rows: section.rows.map((row) => ({
              ...row,
              title: sanitizeRowTitle(row.id, row.title),
              description: sanitizeRowDescription(row.id, row.description),
            })),
          })),
        }
        : undefined,
    };
  }

  /**
   * Guarda un mensaje saliente en el historial (para mostrar en admin)
   */
  private async saveOutboundMessage(
    userId: string,
    content: string,
    metadata?: {
      type?: 'text' | 'template' | 'delayed' | 'interactive';
      source?: 'conversation' | 'scheduler' | 'admin';
      buttons?: Array<{ id: string; title: string }>;
      listTitle?: string;
      listSections?: any;
      templateName?: string;
    }
  ): Promise<void> {
    try {
      await this.prisma.chatMessage.create({
        data: {
          userId,
          direction: 'outbound',
          content,
          conversationState: 'OUTBOUND_MESSAGE',
          metadata: metadata || {},
        },
      });
      this.logger.debug(`ðŸ’¾ Mensaje outbound guardado para usuario ${userId.substring(0, 8)}...`);
    } catch (error) {
      // No bloquear el envÃ­o si falla el guardado
      this.logger.error(`âŒ Error guardando mensaje outbound en historial: ${error}`);
    }
  }

  /**
   * Guarda un mensaje entrante en el historial (para mostrar en admin)
   */
  private async saveInboundMessage(
    userId: string,
    content: string,
    messageId?: string
  ): Promise<void> {
    try {
      await this.prisma.chatMessage.create({
        data: {
          userId,
          direction: 'inbound',
          content,
          conversationState: 'INBOUND_MESSAGE',
          messageId,
        },
      });
      this.logger.debug(`ðŸ’¾ Mensaje inbound guardado para usuario ${userId.substring(0, 8)}...`);
    } catch (error) {
      // No bloquear el procesamiento si falla el guardado
      this.logger.error(`âŒ Error guardando mensaje inbound en historial: ${error}`);
    }
  }

  /**
   * Busca el userId basado en el nÃºmero de telÃ©fono
   */
  private async findUserIdByPhone(phone: string): Promise<string | undefined> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { phone },
        select: { id: true },
      });
      return user?.id || undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Verifica el webhook (solo para Cloud API)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | { error: string } {
    if (this.provider.verifyWebhook) {
      const result = this.provider.verifyWebhook(mode, token, challenge);
      return result || { error: 'Verification failed' };
    }

    // Twilio no requiere verificaciÃ³n GET
    this.logger.warn('Provider no soporta verificaciÃ³n de webhook');
    return { error: 'Not supported' };
  }

  /**
   * Maneja webhooks entrantes de WhatsApp
   */
  async handleIncomingWebhook(payload: any): Promise<{ status: string }> {
    try {
      this.logger.log('ðŸ“¨ Webhook recibido');
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

      // Normalizar mensaje usando el provider
      const normalizedMessage = this.provider.normalizeIncomingMessage(payload);

      if (!normalizedMessage) {
        this.logger.warn('âš ï¸ No se pudo normalizar el mensaje');
        return { status: 'ignored' };
      }

      // 1. VALIDAR DEDUPLICACIÃ“N: Verificar si ya procesamos este mensaje
      if (
        normalizedMessage.messageId &&
        this.isMessageAlreadyProcessed(normalizedMessage.messageId)
      ) {
        this.logger.warn(
          `ðŸ” Mensaje duplicado detectado (ID: ${normalizedMessage.messageId}). Ignorando.`,
        );
        return { status: 'duplicate' };
      }

      // 2. VALIDAR ANTIGÃœEDAD: Rechazar mensajes muy antiguos (>2 min)
      if (normalizedMessage.timestamp) {
        const messageAge = Date.now() - normalizedMessage.timestamp.getTime();
        if (messageAge > this.MAX_MESSAGE_AGE_MS) {
          this.logger.warn(
            `â° Mensaje muy antiguo detectado (${Math.round(messageAge / 1000)}s). Ignorando para evitar crear sesiones duplicadas.`,
          );
          return { status: 'too_old' };
        }
      }

      this.logger.log(
        `ðŸ“¬ Mensaje de ${normalizedMessage.phone}: ${normalizedMessage.text || '[media]'}`,
      );

      // 3. MARCAR COMO PROCESADO antes de procesar (para evitar race conditions)
      if (normalizedMessage.messageId) {
        this.markMessageAsProcessed(normalizedMessage.messageId);
      }

      // ðŸ’¾ GUARDAR MENSAJE ENTRANTE (INBOUND) - Centralizado aquÃ­
      const userId = await this.findUserIdByPhone(normalizedMessage.phone);
      if (userId && normalizedMessage.text) {
        await this.saveInboundMessage(userId, normalizedMessage.text, normalizedMessage.messageId);
      }

      // 4. Pasar al ConversationService para procesar
      const reply = await this.conversationService.handleIncomingMessage(normalizedMessage);

      // 5. Enviar respuesta (con soporte para mensajes interactivos)
      // NOTA: Todo el guardado de mensajes se hace en sendBotReply (source: conversation)
      try {
        await this.sendBotReply(normalizedMessage.phone, reply, {
          userId,
          source: 'conversation'
        });
      } catch (sendError) {
        // Si falla el envÃ­o del mensaje principal, intentar reenviar el mismo mensaje
        // con un texto de error adicional
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        this.logger.error(`âŒ Error enviando respuesta: ${errorMessage}`);
        this.logger.log(`ðŸ”„ Reintentando envÃ­o del mensaje...`);

        // Reintentar con el mismo mensaje pero como texto simple si es interactivo
        try {
          if (reply.buttons || reply.listSections) {
            // Si era un mensaje interactivo, enviar como texto simple en el retry
            await this.sendBotReply(normalizedMessage.phone, {
              text: reply.text + '\n\n' + BotMessages.ERROR_RETRY,
            }, { userId, source: 'conversation' });
          } else {
            // Si era texto simple, agregar mensaje de error
            await this.sendBotReply(normalizedMessage.phone, {
              text: reply.text + '\n\n' + BotMessages.ERROR_RETRY,
            }, { userId, source: 'conversation' });
          }
        } catch (retryError) {
          const retryErrorMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
          this.logger.error(`Error en retry: ${retryErrorMessage}`);
          throw sendError; // Lanzar el error original si el retry tambiÃ©n falla
        }
      }

      return { status: 'ok' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`âŒ Error procesando webhook: ${errorMessage}`, errorStack);

      return { status: 'error' };
    }
  }

  /**
   * EnvÃ­a una respuesta del bot (BotReply)
   * Soporta mensajes de texto simple, botones, listas y mensajes retrasados
   * @param to - NÃºmero de telÃ©fono destino
   * @param reply - Respuesta del bot
   * @param options - Opciones adicionales (userId y source para guardar en historial)
   */
  async sendBotReply(
    to: string,
    reply: BotReply,
    options?: { userId?: string; source?: 'conversation' | 'scheduler' | 'admin' }
  ): Promise<void> {
    try {
      const sanitizedReply = this.sanitizeBotReply(reply);

      // Enviar mensaje principal (sin el delayedMessage)
      const { delayedMessage, ...mainReply } = sanitizedReply;
      await this.provider.sendMessage(to, mainReply);
      this.logger.log(`âœ… Mensaje enviado a ${to}`);

      // ðŸ’¾ GUARDAR en historial (centralizado aquÃ­)
      const userId = options?.userId || await this.findUserIdByPhone(to);
      if (userId) {
        const metadata: any = {
          type: sanitizedReply.buttons ? 'interactive' : 'text',
          source: options?.source || 'scheduler',
        };
        if (sanitizedReply.buttons) {
          metadata.buttons = sanitizedReply.buttons;
        }
        if (sanitizedReply.listTitle) {
          metadata.listTitle = sanitizedReply.listTitle;
          metadata.listSections = sanitizedReply.listSections;
          metadata.type = 'interactive';
        }
        await this.saveOutboundMessage(userId, sanitizedReply.text || '', metadata);
      }

      // Si hay mensaje retrasado, programar su envÃ­o
      if (delayedMessage) {
        const delayMs = delayedMessage.delayMs || 60000; // Default 1 minuto
        this.logger.log(`â° Programando mensaje retrasado para ${to} en ${delayMs / 1000} segundos`);

        // Buscar userId ahora para capturarlo en el closure
        const delayedUserId = options?.userId || await this.findUserIdByPhone(to);

        setTimeout(async () => {
          try {
            const delayedReply: BotReply = {
              text: delayedMessage.text,
              listTitle: delayedMessage.listTitle,
              listSections: delayedMessage.listSections,
            };
            const sanitizedDelayedReply = this.sanitizeBotReply(delayedReply);
            await this.provider.sendMessage(to, sanitizedDelayedReply);
            this.logger.log(`âœ… Mensaje retrasado enviado a ${to}`);

            // Guardar mensaje retrasado en historial (siempre, ya que no viene de ConversationService)
            if (delayedUserId) {
              await this.saveOutboundMessage(delayedUserId, sanitizedDelayedReply.text || '', {
                type: 'delayed',
                source: options?.source || 'scheduler',
                listTitle: sanitizedDelayedReply.listTitle,
                listSections: sanitizedDelayedReply.listSections,
              });
            }
          } catch (delayedError) {
            const errorMessage = delayedError instanceof Error ? delayedError.message : 'Unknown error';
            this.logger.error(`âŒ Error enviando mensaje retrasado a ${to}: ${errorMessage}`);
          }
        }, delayMs);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`âŒ Error enviando mensaje a ${to}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * EnvÃ­a un mensaje de template de WhatsApp
   * Usado para notificaciones de alerta fuera de la ventana de 24 horas
   * @param to - NÃºmero de telÃ©fono destino
   * @param templateName - Nombre del template
   * @param languageCode - CÃ³digo de idioma
   * @param bodyParams - ParÃ¡metros del template
   * @param options - Opciones adicionales (userId para guardar en historial)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
    options?: { userId?: string; source?: 'conversation' | 'scheduler' | 'admin' }
  ): Promise<void> {
    try {
      const sanitizedBodyParams = bodyParams.map((param) => repairMojibakeUtil(param));
      await this.cloudApiProvider.sendTemplateMessage(to, templateName, languageCode, sanitizedBodyParams);
      this.logger.log(`âœ… Template "${templateName}" enviado a ${to}`);

      // Guardar en historial
      const userId = options?.userId || await this.findUserIdByPhone(to);
      if (userId) {
        const templateContent = `[TEMPLATE: ${templateName}] ${sanitizedBodyParams.join(' | ')}`;
        await this.saveOutboundMessage(userId, templateContent, {
          type: 'template',
          source: options?.source || 'scheduler',
          templateName,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`âŒ Error enviando template a ${to}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Verifica si un mensaje ya fue procesado
   */
  private isMessageAlreadyProcessed(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }

  /**
   * Marca un mensaje como procesado
   */
  private markMessageAsProcessed(messageId: string): void {
    this.processedMessages.set(messageId, Date.now());
  }

  /**
   * Limpia mensajes antiguos del cache
   */
  private cleanupMessageCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > this.CACHE_RETENTION_MS) {
        entriesToDelete.push(messageId);
      }
    }

    entriesToDelete.forEach((id) => this.processedMessages.delete(id));

    if (entriesToDelete.length > 0) {
      this.logger.debug(`ðŸ§¹ Limpieza de cache: ${entriesToDelete.length} mensajes eliminados`);
    }
  }
}
