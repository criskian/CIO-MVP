import { Controller, Post, Body, HttpCode, Logger, Headers } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { WompiWebhookPayload, WebhookResponse } from './dto/wompi-webhook.dto';

@Controller('webhook')
export class PaymentController {
    private readonly logger = new Logger(PaymentController.name);

    constructor(private readonly paymentService: PaymentService) { }

    /**
     * POST /webhook/wompi
     * Endpoint para recibir notificaciones de Wompi
     * 
     * Configurar en Wompi Dashboard:
     * URL: https://TU-DOMINIO/webhook/wompi
     * Eventos: transaction.updated
     */
    @Post('wompi')
    @HttpCode(200)
    async handleWompiWebhook(
        @Body() payload: WompiWebhookPayload,
        @Headers('x-event-checksum') checksum?: string,
    ): Promise<WebhookResponse> {
        this.logger.log(`💳 Webhook de Wompi recibido: ${payload.event}`);

        try {
            // Verificar que sea un evento válido
            if (!payload.event || !payload.data?.transaction) {
                this.logger.warn('⚠️ Payload de webhook inválido');
                return { status: 'error', message: 'Invalid payload' };
            }

            // Verificar firma del webhook
            const isValid = this.paymentService.verifyWebhookSignature(payload, checksum);

            if (!isValid) {
                this.logger.warn('⚠️ Firma de webhook inválida');
                return { status: 'invalid_signature' };
            }

            // Filtrar: solo procesar transacciones de CIO
            if (!this.paymentService.isCioTransaction(payload.data.transaction.reference)) {
                this.logger.log(`⏭️ Ignorando transacción (no es de CIO): ${payload.data.transaction.reference}`);
                return { status: 'ignored', message: 'Not a CIO transaction' };
            }

            // Procesar según el evento
            if (payload.event === 'transaction.updated') {
                await this.paymentService.handleTransactionUpdate(payload);
                return { status: 'ok' };
            }

            this.logger.log(`ℹ️ Evento no procesado: ${payload.event}`);
            return { status: 'ignored', message: `Event ${payload.event} not handled` };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`❌ Error procesando webhook Wompi: ${errorMessage}`);
            return { status: 'error', message: errorMessage };
        }
    }

    /**
     * POST /webhook/wompi/test
     * Endpoint de prueba para verificar que el webhook está funcionando
     * Útil para configuración inicial
     */
    @Post('wompi/test')
    @HttpCode(200)
    async testWebhook(@Body() body: any): Promise<{ status: string; received: any }> {
        this.logger.log('🧪 Webhook de prueba recibido');
        this.logger.debug('Payload:', JSON.stringify(body, null, 2));

        return {
            status: 'ok',
            received: body,
        };
    }
}
