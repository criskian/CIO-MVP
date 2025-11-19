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

/**
 * Botón de respuesta rápida (máximo 3 por mensaje)
 */
export interface ReplyButton {
  id: string; // ID único para identificar qué botón se presionó
  title: string; // Texto del botón (máximo 20 caracteres)
}

/**
 * Fila de una lista desplegable
 */
export interface ListRow {
  id: string; // ID único
  title: string; // Texto principal (máximo 24 caracteres)
  description?: string; // Texto secundario (opcional, máximo 72 caracteres)
}

/**
 * Sección de una lista (puede tener múltiples filas)
 */
export interface ListSection {
  title?: string; // Título de la sección (opcional)
  rows: ListRow[];
}

/**
 * Respuesta del bot que puede incluir mensajes interactivos
 */
export interface BotReply {
  text: string;
  // Botones de respuesta rápida (máximo 3)
  buttons?: ReplyButton[];
  // Lista desplegable
  listTitle?: string; // Texto del botón que abre la lista (ej: "Ver opciones")
  listSections?: ListSection[]; // Secciones de la lista (máximo 10 filas por sección)
}

export interface IWhatsappProvider {
  /**
   * Envía un mensaje (texto simple o interactivo) a un número de WhatsApp
   */
  sendMessage(to: string, reply: BotReply): Promise<void>;

  /**
   * Normaliza el payload entrante del proveedor al formato interno
   */
  normalizeIncomingMessage(payload: any): NormalizedIncomingMessage | null;

  /**
   * Verifica el webhook (solo para Cloud API)
   */
  verifyWebhook?(mode: string, token: string, challenge: string): string | null;
}
