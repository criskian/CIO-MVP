import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from '../conversation/conversation.service';
// TODO: Implementar providers específicos (Cloud API / Twilio)

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Verifica el webhook (para WhatsApp Cloud API)
   */
  verifyWebhook(mode: string, token: string, challenge: string) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verificado exitosamente');
      return challenge;
    }

    this.logger.error('Fallo en verificación de webhook');
    return { error: 'Verification failed' };
  }

  /**
   * Maneja webhooks entrantes de WhatsApp
   */
  async handleIncomingWebhook(payload: any) {
    // TODO: Parsear según el provider (Cloud API o Twilio)
    this.logger.log('Webhook recibido:', JSON.stringify(payload));

    // Por ahora solo retornamos 200 OK
    return { status: 'ok' };
  }

  /**
   * Envía un mensaje de texto a WhatsApp
   */
  async sendMessage(phone: string, text: string) {
    // TODO: Implementar según provider
    this.logger.log(`Enviando mensaje a ${phone}: ${text}`);
  }
}

