import { Controller, Post, Get, Body, Query, HttpCode } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('webhook/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * Endpoint GET para verificación del webhook (WhatsApp Cloud API)
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  /**
   * Endpoint POST para recibir mensajes de WhatsApp
   */
  @Post()
  @HttpCode(200)
  async handleIncomingMessage(@Body() payload: any) {
    return this.whatsappService.handleIncomingWebhook(payload);
  }
}

