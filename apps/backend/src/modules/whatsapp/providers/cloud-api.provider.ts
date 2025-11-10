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

      // Asegurar que el número tenga el formato correcto (+número)
      const formattedTo = to.startsWith('+') ? to : `+${to}`;

      this.logger.debug(`📤 Enviando mensaje a ${formattedTo}`);
      this.logger.debug(`URL: ${url}`);

      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: formattedTo,
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

      this.logger.log(`✅ Mensaje enviado a ${formattedTo}`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Log detallado del error de Meta
      if (error?.response?.data) {
        this.logger.error(`❌ Error de Meta API: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      this.logger.error(`Error enviando mensaje: ${errorMessage}`, errorStack);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error normalizando mensaje: ${errorMessage}`, errorStack);
      return null;
    }
  }

  /**
   * Verifica el webhook de Cloud API
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    this.logger.debug(`🔍 Verificando webhook - mode: ${mode}, token recibido: ${token}, token esperado: ${this.verifyToken}, challenge: ${challenge}`);
    
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('✅ Webhook verificado correctamente');
      return challenge;
    }

    this.logger.error(`❌ Fallo en verificación de webhook - mode: ${mode}, token match: ${token === this.verifyToken}`);
    return null;
  }
}

