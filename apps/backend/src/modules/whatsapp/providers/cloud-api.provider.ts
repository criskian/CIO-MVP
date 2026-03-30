import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  IWhatsappProvider,
  NormalizedIncomingMessage,
  BotReply,
} from '../interfaces/whatsapp-provider.interface';
import { repairMojibakeText } from '../../../common/text/mojibake.util';

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
      const safeReply = this.sanitizeOutgoingReply(reply);

      // Asegurar que el número tenga el formato correcto (+número)
      const formattedTo = to.startsWith('+') ? to : `+${to}`;

      this.logger.debug(`ðŸ“¤ Enviando mensaje a ${formattedTo}`);
      this.logger.debug(`URL: ${url}`);

      let messageBody: any;

      // Si tiene botones de respuesta rápida (máximo 3)
      if (safeReply.buttons && safeReply.buttons.length > 0) {
        this.logger.debug(`ðŸ”˜ Enviando mensaje con ${safeReply.buttons.length} botones`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: safeReply.text,
            },
            action: {
              buttons: safeReply.buttons.slice(0, 3).map((btn) => ({
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
      else if (safeReply.listSections && safeReply.listSections.length > 0) {
        this.logger.debug(`ðŸ“‹ Enviando mensaje con lista desplegable`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: {
              text: safeReply.text,
            },
            action: {
              button: safeReply.listTitle || 'Ver opciones',
              sections: safeReply.listSections.map((section) => ({
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
        this.logger.debug(`ðŸ’¬ Enviando mensaje de texto simple`);
        messageBody = {
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'text',
          text: {
            body: safeReply.text,
          },
        };
      }

      // Timeout más largo para mensajes interactivos (listas y botones)
      const isInteractive = safeReply.buttons || safeReply.listSections;
      const timeout = isInteractive ? 30000 : 10000; // 30s para interactivos, 10s para texto

      await axios.post(url, messageBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout,
      });

      this.logger.log(`âœ… Mensaje enviado a ${formattedTo}`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log detallado del error de Meta
      if (error?.response?.data) {
        this.logger.error(`âŒ Error de Meta API: ${JSON.stringify(error.response.data, null, 2)}`);
      }

      this.logger.error(`Error enviando mensaje: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Envía un mensaje de template de WhatsApp
   * Usado para notificaciones fuera de la ventana de 24 horas
   *
   * @param to - Número de teléfono destino
   * @param templateName - Nombre del template aprobado en Meta
   * @param languageCode - Código de idioma (ej: 'es_CO')
   * @param bodyParams - Parámetros para el body del template
   * @param buttonPayload - Payload opcional para botones Quick Reply (por defecto: 'SEARCH_NOW')
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
    buttonPayload: string = 'SEARCH_NOW'
  ): Promise<void> {
    try {
      const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
      // Formato correcto: sin + al inicio para la API de WhatsApp
      const formattedTo = to.replace(/^\+/, '');

      this.logger.debug(`ðŸ“¤ Enviando template "${templateName}" a ${formattedTo}`);

      // Estructura del mensaje según documentación oficial de Meta
      // https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
      const messageBody = {
        messaging_product: 'whatsapp',
        to: formattedTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            // Componente BODY con los parámetros variables
            {
              type: 'body',
              parameters: bodyParams.map(text => ({ type: 'text', text: repairMojibakeText(text) }))
            },
            // Componente BUTTON para Quick Reply (requerido para templates con botones)
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: '0',
              parameters: [
                {
                  type: 'payload',
                  payload: buttonPayload
                }
              ]
            }
          ]
        }
      };

      this.logger.debug(`ðŸ“¤ Request body: ${JSON.stringify(messageBody, null, 2)}`);

      const response = await axios.post(url, messageBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 15000,
      });

      // Log completo de respuesta de Meta para debug
      this.logger.log(`ðŸ“¨ Respuesta de Meta: ${JSON.stringify(response.data, null, 2)}`);

      // Verificar si el mensaje fue aceptado
      if (response.data?.messages?.[0]?.id) {
        this.logger.log(`âœ… Template "${templateName}" enviado exitosamente. Message ID: ${response.data.messages[0].id}`);
      } else if (response.data?.error) {
        this.logger.error(`âš ï¸ Meta devolviÃ³ error en respuesta: ${JSON.stringify(response.data.error)}`);
      } else {
        this.logger.log(`âœ… Template "${templateName}" enviado a ${formattedTo}`);
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error?.response?.data) {
        this.logger.error(`âŒ Error enviando template: ${JSON.stringify(error.response.data, null, 2)}`);
      }

      this.logger.error(`Error enviando template: ${errorMessage}`);
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
          `ðŸš« Mensaje ignorado: llegÃ³ al nÃºmero ${incomingPhoneNumberId}, pero este backend estÃ¡ configurado para ${this.phoneNumberId}`,
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
            const buttonTextById: Record<string, string> = {
              confirm_restart: 'sí, reiniciar',
              cancel_restart: 'no, cancelar',
              confirm_cancel: 'sí, confirmar',
              abort_cancel: 'no, continuar',
              accept_alerts: 'sí, activar',
              reject_alerts: 'no, gracias',
              alerts_yes: 'sí, activar',
              alerts_no: 'no, gracias',
              lead_interest_yes: 'sí, me interesó',
              lead_interest_no: 'no me interesó',
              lead_terms_accept: 'acepto',
              lead_terms_reject: 'no acepto',
            };

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
            // Para IDs conocidos, usar token canónico estable
            else if (buttonTextById[buttonId]) {
              text = buttonTextById[buttonId];
            }
            // Para otros casos, usar ID y fallback al título
            else {
              text = buttonId || buttonTitle;
            }

            this.logger.debug(`ðŸ”˜ BotÃ³n presionado - ID: ${buttonId}, Texto extraÃ­do: ${text}`);
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
            else if (listReplyId.startsWith('reason_')) {
              text = listReplyId;
            }
            else if (listReplyId.startsWith('exp_')) {
              text = listReplyId.replace('exp_', '');
            }
            // Para otros casos, preferir ID estable
            else {
              text = listReplyId || listReplyTitle;
            }

            this.logger.debug(
              `ðŸ“‹ OpciÃ³n de lista seleccionada - ID: ${listReplyId}, Comando/Campo extraÃ­do: ${text}`,
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

        case 'button':
          // Respuesta de botón Quick Reply de un template
          // Estructura: { "button": { "payload": "SEARCH_NOW", "text": "Ver ofertas ahora" } }
          const buttonPayload = message.button?.payload;
          const buttonText = message.button?.text;

          // Mapear payloads conocidos a intents/comandos
          if (buttonPayload === 'SEARCH_NOW') {
            text = 'ver ofertas'; // Esto dispara el intent SEARCH_NOW
          } else if (buttonPayload) {
            text = buttonPayload; // Usar el payload directamente
          } else {
            text = buttonText; // Fallback al texto del botón
          }

          this.logger.debug(`ðŸ”˜ Quick Reply de template - Payload: ${buttonPayload}, Texto: ${buttonText}, ExtraÃ­do: ${text}`);
          break;

        default:
          this.logger.warn(`Tipo de mensaje no soportado: ${messageType}`);
      }

      return {
        phone: from,
        text,
        mediaUrl,
        messageType:
          messageType === 'interactive' || messageType === 'button'
            ? 'text'
            : (messageType as 'text' | 'image' | 'document'),
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

  private sanitizeOutgoingReply(reply: BotReply): BotReply {
    const sanitize = (value: string | undefined): string =>
      value ? repairMojibakeText(value).trim() : '';

    return {
      ...reply,
      text: sanitize(reply.text),
      listTitle: reply.listTitle ? sanitize(reply.listTitle) : undefined,
      buttons: reply.buttons?.map((button) => ({
        ...button,
        title: sanitize(button.title),
      })),
      listSections: reply.listSections?.map((section) => ({
        ...section,
        title: sanitize(section.title),
        rows: section.rows.map((row) => ({
          ...row,
          title: sanitize(row.title),
          description: row.description ? sanitize(row.description) : undefined,
        })),
      })),
    };
  }

  /**
   * Verifica el webhook de Cloud API
   * @returns challenge si el token es válido, null si no
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    this.logger.debug(
      `ðŸ” Verificando webhook - mode: ${mode}, token recibido: ${token}, token esperado: ${this.verifyToken}, challenge: ${challenge}`,
    );

    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('✅ Webhook verificado correctamente');
      return challenge;
    }

    this.logger.error(
      `âŒ Fallo en verificaciÃ³n de webhook - mode: ${mode}, token match: ${token === this.verifyToken}`,
    );
    return null;
  }
}
