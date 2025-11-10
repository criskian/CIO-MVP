import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  IWhatsappProvider,
  NormalizedIncomingMessage,
} from '../interfaces/whatsapp-provider.interface';

/**
 * Provider para Twilio WhatsApp API
 * Documentación: https://www.twilio.com/docs/whatsapp
 */
@Injectable()
export class TwilioProvider implements IWhatsappProvider {
  private readonly logger = new Logger(TwilioProvider.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    this.fromNumber = this.configService.get<string>(
      'TWILIO_WHATSAPP_NUMBER',
      'whatsapp:+14155238886',
    );
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(to: string, message: string): Promise<void> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      // Twilio requiere formato whatsapp:+número
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:+${to}`;

      const params = new URLSearchParams();
      params.append('From', this.fromNumber);
      params.append('To', formattedTo);
      params.append('Body', message);

      await axios.post(url, params, {
        auth: {
          username: this.accountSid,
          password: this.authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.logger.log(`Mensaje enviado a ${to} via Twilio`);
    } catch (error) {
      this.logger.error(`Error enviando mensaje: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Normaliza el payload de Twilio al formato interno
   */
  normalizeIncomingMessage(payload: any): NormalizedIncomingMessage | null {
    try {
      // Twilio envía los datos en formato form-urlencoded
      const from = payload.From?.replace('whatsapp:', '') || payload.from?.replace('whatsapp:', '');
      const body = payload.Body || payload.body;
      const messageType = payload.MediaUrl0 || payload.mediaUrl0 ? 'image' : 'text';
      const mediaUrl = payload.MediaUrl0 || payload.mediaUrl0;
      const messageSid = payload.MessageSid || payload.messageSid;

      if (!from) {
        this.logger.warn('No se encontró remitente en el payload de Twilio');
        return null;
      }

      return {
        phone: from,
        text: body,
        mediaUrl,
        messageType: messageType as 'text' | 'image' | 'document',
        timestamp: new Date(),
        messageId: messageSid,
        raw: payload,
      };
    } catch (error) {
      this.logger.error(`Error normalizando mensaje de Twilio: ${error.message}`, error.stack);
      return null;
    }
  }
}

