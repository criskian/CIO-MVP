import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { IWhatsappProvider, BotReply } from './interfaces/whatsapp-provider.interface';
import { CloudApiProvider } from './providers/cloud-api.provider';
import { BotMessages } from '../conversation/helpers/bot-messages';

/**
 * Servicio principal de WhatsApp
 * Actúa como adapter agnóstico entre el proveedor y el resto de la aplicación
 * NO contiene lógica de negocio, solo adapta mensajes
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: IWhatsappProvider;

  // Cache para deduplicación de mensajes (messageId -> timestamp)
  private readonly processedMessages = new Map<string, number>();

  // Tiempo máximo para aceptar un mensaje (2 minutos)
  private readonly MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;

  // Tiempo para mantener IDs en cache (10 minutos)
  private readonly CACHE_RETENTION_MS = 10 * 60 * 1000;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly cloudApiProvider: CloudApiProvider,
  ) {
    // Usar Cloud API como provider único
    this.provider = this.cloudApiProvider;
    this.logger.log('📱 Usando WhatsApp Cloud API como proveedor');

    // Limpiar cache cada 5 minutos
    setInterval(() => this.cleanupMessageCache(), 5 * 60 * 1000);
  }

  /**
   * Verifica el webhook (solo para Cloud API)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | { error: string } {
    if (this.provider.verifyWebhook) {
      const result = this.provider.verifyWebhook(mode, token, challenge);
      return result || { error: 'Verification failed' };
    }

    // Twilio no requiere verificación GET
    this.logger.warn('Provider no soporta verificación de webhook');
    return { error: 'Not supported' };
  }

  /**
   * Maneja webhooks entrantes de WhatsApp
   */
  async handleIncomingWebhook(payload: any): Promise<{ status: string }> {
    try {
      this.logger.log('📨 Webhook recibido');
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

      // Normalizar mensaje usando el provider
      const normalizedMessage = this.provider.normalizeIncomingMessage(payload);

      if (!normalizedMessage) {
        this.logger.warn('⚠️ No se pudo normalizar el mensaje');
        return { status: 'ignored' };
      }

      // 1. VALIDAR DEDUPLICACIÓN: Verificar si ya procesamos este mensaje
      if (
        normalizedMessage.messageId &&
        this.isMessageAlreadyProcessed(normalizedMessage.messageId)
      ) {
        this.logger.warn(
          `🔁 Mensaje duplicado detectado (ID: ${normalizedMessage.messageId}). Ignorando.`,
        );
        return { status: 'duplicate' };
      }

      // 2. VALIDAR ANTIGÜEDAD: Rechazar mensajes muy antiguos (>2 min)
      if (normalizedMessage.timestamp) {
        const messageAge = Date.now() - normalizedMessage.timestamp.getTime();
        if (messageAge > this.MAX_MESSAGE_AGE_MS) {
          this.logger.warn(
            `⏰ Mensaje muy antiguo detectado (${Math.round(messageAge / 1000)}s). Ignorando para evitar crear sesiones duplicadas.`,
          );
          return { status: 'too_old' };
        }
      }

      this.logger.log(
        `📬 Mensaje de ${normalizedMessage.phone}: ${normalizedMessage.text || '[media]'}`,
      );

      // 3. MARCAR COMO PROCESADO antes de procesar (para evitar race conditions)
      if (normalizedMessage.messageId) {
        this.markMessageAsProcessed(normalizedMessage.messageId);
      }

      // 4. Pasar al ConversationService para procesar
      const reply = await this.conversationService.handleIncomingMessage(normalizedMessage);

      // 5. Enviar respuesta (con soporte para mensajes interactivos)
      try {
        await this.sendBotReply(normalizedMessage.phone, reply);
      } catch (sendError) {
        // Si falla el envío del mensaje principal, intentar reenviar el mismo mensaje
        // con un texto de error adicional
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        this.logger.error(`❌ Error enviando respuesta: ${errorMessage}`);
        this.logger.log(`🔄 Reintentando envío del mensaje...`);

        // Reintentar con el mismo mensaje pero como texto simple si es interactivo
        try {
          if (reply.buttons || reply.listSections) {
            // Si era un mensaje interactivo, enviar como texto simple en el retry
            await this.sendBotReply(normalizedMessage.phone, {
              text: reply.text + '\n\n' + BotMessages.ERROR_RETRY,
            });
          } else {
            // Si era texto simple, agregar mensaje de error
            await this.sendBotReply(normalizedMessage.phone, {
              text: reply.text + '\n\n' + BotMessages.ERROR_RETRY,
            });
          }
        } catch (retryError) {
          const retryErrorMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
          this.logger.error(`Error en retry: ${retryErrorMessage}`);
          throw sendError; // Lanzar el error original si el retry también falla
        }
      }

      return { status: 'ok' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Error procesando webhook: ${errorMessage}`, errorStack);

      return { status: 'error' };
    }
  }

  /**
   * Envía una respuesta del bot (BotReply)
   * Soporta mensajes de texto simple, botones, listas y mensajes retrasados
   */
  async sendBotReply(to: string, reply: BotReply): Promise<void> {
    try {
      // Enviar mensaje principal (sin el delayedMessage)
      const { delayedMessage, ...mainReply } = reply;
      await this.provider.sendMessage(to, mainReply);
      this.logger.log(`✅ Mensaje enviado a ${to}`);

      // Si hay mensaje retrasado, programar su envío
      if (delayedMessage) {
        const delayMs = delayedMessage.delayMs || 60000; // Default 1 minuto
        this.logger.log(`⏰ Programando mensaje retrasado para ${to} en ${delayMs / 1000} segundos`);

        setTimeout(async () => {
          try {
            const delayedReply: BotReply = {
              text: delayedMessage.text,
              listTitle: delayedMessage.listTitle,
              listSections: delayedMessage.listSections,
            };
            await this.provider.sendMessage(to, delayedReply);
            this.logger.log(`✅ Mensaje retrasado enviado a ${to}`);
          } catch (delayedError) {
            const errorMessage = delayedError instanceof Error ? delayedError.message : 'Unknown error';
            this.logger.error(`❌ Error enviando mensaje retrasado a ${to}: ${errorMessage}`);
          }
        }, delayMs);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Error enviando mensaje a ${to}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Envía un mensaje de template de WhatsApp
   * Usado para notificaciones de alerta fuera de la ventana de 24 horas
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[]
  ): Promise<void> {
    try {
      await this.cloudApiProvider.sendTemplateMessage(to, templateName, languageCode, bodyParams);
      this.logger.log(`✅ Template "${templateName}" enviado a ${to}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error enviando template a ${to}: ${errorMessage}`);
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
      this.logger.debug(`🧹 Limpieza de cache: ${entriesToDelete.length} mensajes eliminados`);
    }
  }
}
