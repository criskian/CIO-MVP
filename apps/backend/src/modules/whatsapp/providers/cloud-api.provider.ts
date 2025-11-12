import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  IWhatsappProvider,
  NormalizedIncomingMessage,
  BotReply,
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
   * Envía un mensaje (texto simple o interactivo con botones/listas)
   */
  async sendMessage(to: string, reply: BotReply): Promise<void> {
    try {
      const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

      // Asegurar que el número tenga el formato correcto (+número)
      const formattedTo = to.startsWith('+') ? to : `+${to}`;

      this.logger.debug(`📤 Enviando mensaje a ${formattedTo}`);
      this.logger.debug(`URL: ${url}`);

      let messageBody: any;

      // Si tiene botones de respuesta rápida (máximo 3)
      if (reply.buttons && reply.buttons.length > 0) {
        this.logger.debug(`🔘 Enviando mensaje con ${reply.buttons.length} botones`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: reply.text,
            },
            action: {
              buttons: reply.buttons.slice(0, 3).map((btn) => ({
                type: 'reply',
                reply: {
                  id: btn.id,
                  title: btn.title.substring(0, 20), // Máximo 20 caracteres
                },
              })),
            },
          },
        };
      }
      // Si tiene lista desplegable
      else if (reply.listSections && reply.listSections.length > 0) {
        this.logger.debug(`📋 Enviando mensaje con lista desplegable`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: {
              text: reply.text,
            },
            action: {
              button: reply.listTitle || 'Ver opciones',
              sections: reply.listSections.map((section) => ({
                title: section.title,
                rows: section.rows.slice(0, 10).map((row) => ({
                  id: row.id,
                  title: row.title.substring(0, 24), // Máximo 24 caracteres
                  description: row.description?.substring(0, 72), // Máximo 72 caracteres
                })),
              })),
            },
          },
        };
      }
      // Mensaje de texto simple (caso por defecto)
      else {
        this.logger.debug(`💬 Enviando mensaje de texto simple`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'text',
          text: {
            body: reply.text,
          },
        };
      }

      await axios.post(url, messageBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

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
   * Soporta mensajes de texto, interactivos (botones/listas), imágenes y documentos
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

        case 'interactive':
          // Usuario respondió a un botón o lista interactiva
          const interactiveType = message.interactive?.type;

          if (interactiveType === 'button_reply') {
            // Respuesta de botón
            text = message.interactive.button_reply.title;
            this.logger.debug(
              `🔘 Botón presionado - ID: ${message.interactive.button_reply.id}, Texto: ${text}`,
            );
          } else if (interactiveType === 'list_reply') {
            // Respuesta de lista
            text = message.interactive.list_reply.title;
            this.logger.debug(
              `📋 Opción de lista seleccionada - ID: ${message.interactive.list_reply.id}, Texto: ${text}`,
            );
          } else {
            this.logger.warn(`Tipo de interacción no soportado: ${interactiveType}`);
            return null;
          }
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
        messageType: messageType === 'interactive' ? 'text' : (messageType as 'text' | 'image' | 'document'),
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

