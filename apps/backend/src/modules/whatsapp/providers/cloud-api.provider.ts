import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  IWhatsappProvider,
  NormalizedIncomingMessage,
} from '../interfaces/whatsapp-provider.interface';

/**
 * Provider para WhatsApp Cloud API (Meta/Facebook)
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
@Injectable()
export class CloudApiProvider implements IWhatsappProvider {
  private readonly logger = new Logger(CloudApiProvider.name);
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly verifyToken: string;

  constructor(private readonly configService: ConfigService) {
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_ID', '');
    this.accessToken = this.configService.get<string>('WHATSAPP_TOKEN', '');
    this.verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN', '');
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(to: string, message: string): Promise<void> {
    try {
      const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      this.logger.log(`Mensaje enviado a ${to}`);
    } catch (error) {
      this.logger.error(`Error enviando mensaje: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Normaliza el payload de Cloud API al formato interno
   */
  normalizeIncomingMessage(payload: any): NormalizedIncomingMessage | null {
    try {
      // Estructura de Cloud API
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];

      if (!message) {
        this.logger.warn('No se encontró mensaje en el payload');
        return null;
      }

      const from = message.from;
      const messageType = message.type;
      const messageId = message.id;
      const timestamp = new Date(parseInt(message.timestamp) * 1000);

      let text: string | undefined;
      let mediaUrl: string | undefined;

      // Extraer contenido según el tipo
      switch (messageType) {
        case 'text':
          text = message.text?.body;
          break;
        case 'image':
          mediaUrl = message.image?.id; // En Cloud API se obtiene el ID, luego se descarga
          break;
        case 'document':
          mediaUrl = message.document?.id;
          break;
        default:
          this.logger.warn(`Tipo de mensaje no soportado: ${messageType}`);
      }

      return {
        phone: from,
        text,
        mediaUrl,
        messageType: messageType as 'text' | 'image' | 'document',
        timestamp,
        messageId,
        raw: payload,
      };
    } catch (error) {
      this.logger.error(`Error normalizando mensaje: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Verifica el webhook de Cloud API
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('✅ Webhook verificado correctamente');
      return challenge;
    }

    this.logger.error('❌ Fallo en verificación de webhook');
    return null;
  }
}

