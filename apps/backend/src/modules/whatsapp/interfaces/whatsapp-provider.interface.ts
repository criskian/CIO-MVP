/**
 * Interfaz para abstraer proveedores de WhatsApp (Cloud API, Twilio, etc.)
 * Permite cambiar de proveedor sin modificar el resto del código
 */

export interface NormalizedIncomingMessage {
  phone: string;
  text?: string;
  mediaUrl?: string;
  messageType: 'text' | 'image' | 'document';
  timestamp?: Date;
  messageId?: string;
  raw: any; // Payload original del proveedor
}

export interface BotReply {
  text: string;
  // Futuro: botones, listas, templates, etc.
}

export interface IWhatsappProvider {
  /**
   * Envía un mensaje de texto a un número de WhatsApp
   */
  sendMessage(to: string, message: string): Promise<void>;

  /**
   * Normaliza el payload entrante del proveedor al formato interno
   */
  normalizeIncomingMessage(payload: any): NormalizedIncomingMessage | null;

  /**
   * Verifica el webhook (solo para Cloud API)
   */
  verifyWebhook?(mode: string, token: string, challenge: string): string | null;
}

