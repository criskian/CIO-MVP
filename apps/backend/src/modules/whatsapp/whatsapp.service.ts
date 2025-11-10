import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { IWhatsappProvider, BotReply } from './interfaces/whatsapp-provider.interface';
import { CloudApiProvider } from './providers/cloud-api.provider';

/**
 * Servicio principal de WhatsApp
 * Actúa como adapter agnóstico entre el proveedor y el resto de la aplicación
 * NO contiene lógica de negocio, solo adapta mensajes
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: IWhatsappProvider;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly cloudApiProvider: CloudApiProvider,
  ) {
    // Usar Cloud API como provider único
    this.provider = this.cloudApiProvider;
    this.logger.log('📱 Usando WhatsApp Cloud API como proveedor');
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

      this.logger.log(
        `📬 Mensaje de ${normalizedMessage.phone}: ${normalizedMessage.text || '[media]'}`,
      );

      // Pasar al ConversationService para procesar
      const reply = await this.conversationService.handleIncomingMessage(normalizedMessage);

      // Enviar respuesta
      await this.sendMessage(normalizedMessage.phone, reply.text);

      return { status: 'ok' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Error procesando webhook: ${errorMessage}`, errorStack);

      // Intentar enviar mensaje de error al usuario
      try {
        const normalizedMessage = this.provider.normalizeIncomingMessage(payload);
        if (normalizedMessage) {
          await this.sendMessage(
            normalizedMessage.phone,
            'Lo siento, hubo un error temporal. Por favor intenta de nuevo en unos momentos.',
          );
        }
      } catch (sendError) {
        const sendErrorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        this.logger.error(`Error enviando mensaje de error: ${sendErrorMessage}`);
      }

      return { status: 'error' };
    }
  }

  /**
   * Envía un mensaje de texto a un número
   */
  async sendMessage(to: string, text: string): Promise<void> {
    try {
      await this.provider.sendMessage(to, text);
      this.logger.log(`✅ Mensaje enviado a ${to}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Error enviando mensaje a ${to}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Envía una respuesta del bot (BotReply)
   */
  async sendBotReply(to: string, reply: BotReply): Promise<void> {
    await this.sendMessage(to, reply.text);
    // Futuro: manejar botones, listas, templates, etc.
  }
}
