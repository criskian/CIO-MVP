import { Controller, Post, Get, Body, Query, HttpCode, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

/**
 * Controlador de webhooks de WhatsApp
 * Endpoints:
 * - GET: Verificación de webhook (Cloud API)
 * - POST: Recepción de mensajes
 */
@Controller('webhook/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * GET /webhook/whatsapp
   * Endpoint para verificación del webhook (WhatsApp Cloud API)
   * Parámetros: hub.mode, hub.verify_token, hub.challenge
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    this.logger.log('🔍 Solicitud de verificación de webhook');
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  /**
   * POST /webhook/whatsapp
   * Endpoint para recibir mensajes entrantes de WhatsApp
   */
  @Post()
  @HttpCode(200)
  async handleIncomingMessage(@Body() payload: any) {
    this.logger.log('📨 POST recibido en webhook');
    return this.whatsappService.handleIncomingWebhook(payload);
  }
}
