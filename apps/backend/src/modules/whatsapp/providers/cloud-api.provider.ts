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

      // Timeout más largo para mensajes interactivos (listas y botones)
      const isInteractive = reply.buttons || reply.listSections;
      const timeout = isInteractive ? 30000 : 10000; // 30s para interactivos, 10s para texto

      await axios.post(url, messageBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout,
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

      // Extraer el Phone Number ID del payload (está en metadata.phone_number_id)
      const incomingPhoneNumberId = change?.value?.metadata?.phone_number_id;

      // FILTRO: Solo procesar mensajes del número configurado en .env
      if (incomingPhoneNumberId && incomingPhoneNumberId !== this.phoneNumberId) {
        this.logger.debug(
          `🚫 Mensaje ignorado: llegó al número ${incomingPhoneNumberId}, pero este backend está configurado para ${this.phoneNumberId}`,
        );
        return null;
      }

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
            const buttonId = message.interactive.button_reply.id;
            const buttonTitle = message.interactive.button_reply.title;

            // Si el ID es de frecuencia (ej: freq_daily), extraer el valor
            if (buttonId.startsWith('freq_')) {
              const freqValue = buttonId.replace('freq_', ''); // "freq_daily" -> "daily"
              // Mapear al texto esperado por el validador
              const freqMap: Record<string, string> = {
                daily: 'diariamente',
                every_3_days: 'cada 3 días',
                weekly: 'semanalmente',
                monthly: 'mensualmente',
              };
              text = freqMap[freqValue] || buttonTitle;
            }
            // Si el ID es de modalidad de trabajo (ej: work_remoto)
            else if (buttonId.startsWith('work_')) {
              text = buttonId.replace('work_', ''); // "work_remoto" -> "remoto"
            }
            // Si el ID es de experiencia (ej: exp_junior)
            else if (buttonId.startsWith('exp_')) {
              text = buttonId.replace('exp_', ''); // "exp_junior" -> "junior"
            }
            // Para otros casos, usar el título del botón
            else {
              text = buttonTitle;
            }

            this.logger.debug(`🔘 Botón presionado - ID: ${buttonId}, Texto extraído: ${text}`);
          } else if (interactiveType === 'list_reply') {
            // Respuesta de lista
            const listReplyId = message.interactive.list_reply.id;
            const listReplyTitle = message.interactive.list_reply.title;

            // Si el ID es un comando (ej: cmd_buscar), extraer el comando
            if (listReplyId.startsWith('cmd_')) {
              text = listReplyId.replace('cmd_', ''); // "cmd_buscar" -> "buscar"
            }
            // Si el ID es un campo de edición (ej: edit_rol), extraer el campo
            else if (listReplyId.startsWith('edit_')) {
              text = listReplyId.replace('edit_', ''); // "edit_rol" -> "rol"
            }
            // Si el ID es de hora (ej: time_09:00), extraer la hora
            else if (listReplyId.startsWith('time_')) {
              text = listReplyId.replace('time_', ''); // "time_09:00" -> "09:00"
            }
            // Para otros casos (ej: full_time, part_time), usar el ID directamente
            else {
              text = listReplyTitle;
            }

            this.logger.debug(
              `📋 Opción de lista seleccionada - ID: ${listReplyId}, Comando/Campo extraído: ${text}`,
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
        messageType:
          messageType === 'interactive' ? 'text' : (messageType as 'text' | 'image' | 'document'),
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
    this.logger.debug(
      `🔍 Verificando webhook - mode: ${mode}, token recibido: ${token}, token esperado: ${this.verifyToken}, challenge: ${challenge}`,
    );

    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('✅ Webhook verificado correctamente');
      return challenge;
    }

    this.logger.error(
      `❌ Fallo en verificación de webhook - mode: ${mode}, token match: ${token === this.verifyToken}`,
    );
    return null;
  }
}
