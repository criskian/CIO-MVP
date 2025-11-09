import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
// TODO: Importar JobSearchService y LlmService cuando se implementen

/**
 * Estados posibles de la conversación
 */
export type SessionState =
  | 'NEW'
  | 'ASK_TERMS'
  | 'ASK_ROLE'
  | 'ASK_LOCATION'
  | 'ASK_JOB_TYPE'
  | 'ASK_MIN_SALARY'
  | 'ASK_ALERT_TIME'
  | 'READY';

/**
 * Tipo de mensaje normalizado (interno)
 */
export interface NormalizedIncomingMessage {
  phone: string;
  text?: string;
  mediaUrl?: string;
  messageType: 'text' | 'image' | 'document';
  raw: any;
}

/**
 * Respuesta del bot
 */
export interface BotReply {
  text: string;
  // Más adelante: botones, listas, etc.
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    // private readonly jobSearchService: JobSearchService,
    // private readonly llmService: LlmService,
  ) {}

  /**
   * Maneja un mensaje entrante y devuelve la respuesta del bot
   */
  async handleIncomingMessage(message: NormalizedIncomingMessage): Promise<BotReply> {
    // TODO: Implementar la lógica de state machine
    this.logger.log(`Mensaje de ${message.phone}: ${message.text}`);

    return {
      text: 'Hola, soy CIO. Esta funcionalidad está en desarrollo.',
    };
  }
}

