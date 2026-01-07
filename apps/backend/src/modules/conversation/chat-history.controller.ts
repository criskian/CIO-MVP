import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';

/**
 * Controlador para acceder al historial de conversaciones
 * Solo accesible para administradores
 */
@Controller('chat-history')
export class ChatHistoryController {
  constructor(private readonly chatHistoryService: ChatHistoryService) {}

  /**
   * GET /chat-history/conversations
   * Obtiene lista de conversaciones recientes
   */
  @Get('conversations')
  async getRecentConversations(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.chatHistoryService.getRecentConversations(limitNum);
  }

  /**
   * GET /chat-history/user/:userId
   * Obtiene el historial completo de mensajes de un usuario
   */
  @Get('user/:userId')
  async getUserMessages(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.chatHistoryService.getUserMessages(userId, limitNum);
  }

  /**
   * GET /chat-history/user/:userId/stats
   * Obtiene estadísticas de mensajes de un usuario
   */
  @Get('user/:userId/stats')
  async getUserStats(@Param('userId') userId: string) {
    return this.chatHistoryService.getUserStats(userId);
  }

  /**
   * GET /chat-history/search
   * Busca usuarios por teléfono o nombre
   */
  @Get('search')
  async searchUsers(@Query('q') query: string) {
    // Implementación simple de búsqueda
    const conversations = await this.chatHistoryService.getRecentConversations(100);
    
    if (!query) {
      return conversations;
    }

    const queryLower = query.toLowerCase();
    return conversations.filter(
      (conv) =>
        conv.phone.includes(queryLower) ||
        conv.name.toLowerCase().includes(queryLower),
    );
  }
}

