import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface SaveMessageParams {
  userId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  conversationState?: string;
  intent?: string;
  messageId?: string;
  isError?: boolean;
  errorMessage?: string;
  metadata?: any;
}

/**
 * Servicio para gestionar el historial de mensajes de chat
 * Guarda todos los mensajes entre usuarios y el bot para análisis posterior
 */
@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger(ChatHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda un mensaje en el historial
   */
  async saveMessage(params: SaveMessageParams): Promise<void> {
    try {
      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          direction: params.direction,
          content: params.content,
          conversationState: params.conversationState,
          intent: params.intent,
          messageId: params.messageId,
          isError: params.isError || false,
          errorMessage: params.errorMessage,
          metadata: params.metadata,
        },
      });

      this.logger.debug(
        `💾 Mensaje guardado: ${params.direction} - Usuario: ${params.userId.substring(0, 8)}...`,
      );
    } catch (error) {
      // No queremos que un error al guardar el mensaje detenga el flujo principal
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error guardando mensaje: ${errorMessage}`);
    }
  }

  /**
   * Guarda un mensaje del usuario (inbound)
   */
  async saveInboundMessage(
    userId: string,
    content: string,
    state?: string,
    intent?: string,
    messageId?: string,
  ): Promise<void> {
    await this.saveMessage({
      userId,
      direction: 'inbound',
      content,
      conversationState: state,
      intent,
      messageId,
    });
  }

  /**
   * Guarda un mensaje del bot (outbound)
   */
  async saveOutboundMessage(
    userId: string,
    content: string,
    state?: string,
    metadata?: any,
  ): Promise<void> {
    await this.saveMessage({
      userId,
      direction: 'outbound',
      content,
      conversationState: state,
      metadata,
    });
  }

  /**
   * Guarda un mensaje de error
   */
  async saveErrorMessage(
    userId: string,
    errorMessage: string,
    state?: string,
  ): Promise<void> {
    await this.saveMessage({
      userId,
      direction: 'outbound',
      content: errorMessage,
      conversationState: state,
      isError: true,
      errorMessage,
    });
  }

  /**
   * Obtiene el historial de mensajes de un usuario
   */
  async getUserMessages(userId: string, limit: number = 100) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Obtiene los últimos mensajes de todos los usuarios (para el admin)
   */
  async getRecentConversations(limit: number = 50) {
    // Obtener usuarios con sus últimos mensajes
    const users = await this.prisma.user.findMany({
      include: {
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Solo el último mensaje de cada usuario
        },
        profile: true,
      },
      where: {
        chatMessages: {
          some: {}, // Solo usuarios que tienen mensajes
        },
      },
      orderBy: {
        chatMessages: {
          _count: 'desc', // Ordenar por cantidad de mensajes (más activos primero)
        },
      },
      take: limit,
    });

    return users.map((user) => ({
      userId: user.id,
      phone: user.phone,
      name: user.name || 'Sin nombre',
      lastMessage: user.chatMessages[0]?.content || '',
      lastMessageDate: user.chatMessages[0]?.createdAt,
      totalMessages: user.chatMessages.length,
    }));
  }

  /**
   * Obtiene estadísticas de mensajes por usuario
   */
  async getUserStats(userId: string) {
    const [total, errors, byState] = await Promise.all([
      // Total de mensajes
      this.prisma.chatMessage.count({ where: { userId } }),
      
      // Mensajes con error
      this.prisma.chatMessage.count({ where: { userId, isError: true } }),
      
      // Mensajes por estado de conversación
      this.prisma.chatMessage.groupBy({
        by: ['conversationState'],
        where: { userId },
        _count: true,
      }),
    ]);

    return {
      totalMessages: total,
      errorMessages: errors,
      byState: byState.map((s) => ({
        state: s.conversationState,
        count: s._count,
      })),
    };
  }

  /**
   * Elimina mensajes antiguos (para limpieza periódica)
   */
  async deleteOldMessages(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.chatMessage.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `🗑️ Eliminados ${result.count} mensajes anteriores a ${cutoffDate.toISOString()}`,
    );

    return result.count;
  }
}

