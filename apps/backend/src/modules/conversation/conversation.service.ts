import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
  timestamp?: Date;
  messageId?: string;
  raw: any;
}

/**
 * Respuesta del bot
 */
export interface BotReply {
  text: string;
  // Más adelante: botones, listas, etc.
}

/**
 * Servicio de conversación - Orquestador principal
 * Implementa la state machine del flujo conversacional
 */
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
   * Por ahora es un stub que responde con un mensaje fijo
   * TODO: Implementar la state machine completa en Fase 4
   */
  async handleIncomingMessage(message: NormalizedIncomingMessage): Promise<BotReply> {
    try {
      this.logger.log(`💬 Procesando mensaje de ${message.phone}: ${message.text}`);

      // TODO Fase 4: Implementar state machine completa
      // Por ahora: respuesta fija para probar el canal

      // Buscar o crear usuario
      let user = await this.prisma.user.findUnique({
        where: { phone: message.phone },
      });

      if (!user) {
        this.logger.log(`👤 Nuevo usuario: ${message.phone}`);
        user = await this.prisma.user.create({
          data: { phone: message.phone },
        });
      }

      // Respuesta de bienvenida temporal (Fase 3)
      return {
        text: `¡Hola! 👋 Soy CIO, tu Cazador Inteligente de Oportunidades.\n\nEstoy aquí para ayudarte a encontrar las mejores ofertas de empleo en Colombia.\n\n✨ Por ahora estoy en fase de pruebas, pero pronto podré:\n• Buscar empleos personalizados para ti\n• Enviarte alertas diarias\n• Filtrar por ubicación, salario y tipo de trabajo\n\n¡Gracias por probarme! 🚀`,
      };
    } catch (error) {
      this.logger.error(`❌ Error en handleIncomingMessage: ${error.message}`, error.stack);

      return {
        text: 'Lo siento, tuve un problema técnico. Por favor intenta de nuevo en unos momentos.',
      };
    }
  }
}
