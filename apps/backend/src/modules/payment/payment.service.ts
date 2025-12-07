import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WompiWebhookPayload } from './dto/wompi-webhook.dto';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly wompiEventsSecret: string;
    private readonly cioReferencePrefix: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly whatsappService: WhatsappService,
    ) {
        this.wompiEventsSecret = this.configService.get<string>('WOMPI_EVENTS_SECRET', '');
        this.cioReferencePrefix = this.configService.get<string>('WOMPI_CIO_REFERENCE_PREFIX', 'CIO-');
    }

    verifyWebhookSignature(payload: WompiWebhookPayload, checksum?: string): boolean {
        try {
            if (!this.wompiEventsSecret) {
                this.logger.warn('⚠️ WOMPI_EVENTS_SECRET no configurado, aceptando webhook sin verificar');
                return true;
            }
            const properties = payload.signature.properties;
            const transaction = payload.data.transaction;

            let stringToSign = '';
            for (const prop of properties) {
                const value = this.getNestedProperty(transaction, prop);
                stringToSign += value;
            }
            stringToSign += payload.timestamp;
            stringToSign += this.wompiEventsSecret;

            const calculatedChecksum = crypto
                .createHash('sha256')
                .update(stringToSign)
                .digest('hex');

            const expectedChecksum = checksum || payload.signature.checksum;
            const isValid = calculatedChecksum === expectedChecksum;

            if (!isValid) {
                this.logger.warn(`⚠️ Firma inválida. Esperada: ${expectedChecksum}, Calculada: ${calculatedChecksum}`);
            }

            return isValid;
        } catch (error) {
            this.logger.error('Error verificando firma de webhook:', error);
            return false;
        }
    }

    private getNestedProperty(obj: any, path: string): string {
        const cleanPath = path.replace(/^transaction\./, '');
        return cleanPath.split('.').reduce((acc, part) => acc && acc[part], obj)?.toString() || '';
    }

    isCioTransaction(reference: string): boolean {
        const isCio = reference.startsWith(this.cioReferencePrefix);
        if (!isCio) {
            this.logger.log(`ℹ️ Transacción ${reference} NO es de CIO (no empieza con ${this.cioReferencePrefix})`);
        }
        return isCio;
    }

    async handleTransactionUpdate(payload: WompiWebhookPayload): Promise<void> {
        const { transaction } = payload.data;

        this.logger.log(
            `💳 Transacción ${transaction.id}: ${transaction.status} - Email: ${transaction.customer_email} - Ref: ${transaction.reference}`,
        );

        // solo procesar transacciones de CIO
        if (!this.isCioTransaction(transaction.reference)) {
            this.logger.log(`⏭️ Ignorando transacción ${transaction.id} (no es de CIO)`);
            return;
        }

        // Guardar/actualizar transacción en BD
        await this.prisma.transaction.upsert({
            where: { wompiId: transaction.id },
            update: {
                wompiStatus: transaction.status,
                rawPayload: payload as any,
                updatedAt: new Date(),
            },
            create: {
                wompiId: transaction.id,
                wompiReference: transaction.reference,
                wompiStatus: transaction.status,
                amount: transaction.amount_in_cents,
                currency: transaction.currency,
                paymentMethod: transaction.payment_method_type,
                email: transaction.customer_email.toLowerCase(),
                rawPayload: payload as any,
            },
        });

        this.logger.log(`✅ Transacción ${transaction.id} guardada en BD`);

        if (transaction.status === 'APPROVED') {
            await this.tryLinkAndActivatePremium(
                transaction.id,
                transaction.customer_email.toLowerCase(),
            );
        }
    }

    /**
     * vincular una transacción aprobada con un usuario existente
     */
    private async tryLinkAndActivatePremium(wompiId: string, email: string): Promise<void> {
        const user = await this.prisma.user.findFirst({
            where: { email },
            include: { subscription: true },
        });

        if (!user) {
            this.logger.log(
                `ℹ️ No hay usuario registrado con email ${email}. Se vinculará cuando ingrese su email en el chat.`,
            );
            return;
        }

        // Verificar si la transacción ya está vinculada
        const transaction = await this.prisma.transaction.findUnique({
            where: { wompiId },
        });

        if (transaction?.userId) {
            this.logger.log(`ℹ️ Transacción ${wompiId} ya vinculada a usuario ${transaction.userId}`);
            return;
        }

        // Verificar que el usuario no sea ya premium
        if (user.subscription?.plan === 'PREMIUM' && user.subscription?.status === 'ACTIVE') {
            this.logger.log(`ℹ️ Usuario ${user.id} ya es PREMIUM activo`);
            // Igual vincular la transacción
            await this.prisma.transaction.update({
                where: { wompiId },
                data: {
                    userId: user.id,
                    linkedAt: new Date(),
                },
            });
            return;
        }

        await this.prisma.transaction.update({
            where: { wompiId },
            data: {
                userId: user.id,
                linkedAt: new Date(),
            },
        });

        // Activar premium
        await this.prisma.subscription.upsert({
            where: { userId: user.id },
            update: {
                plan: 'PREMIUM',
                status: 'ACTIVE',
                premiumStartDate: new Date(),
                premiumUsesLeft: 5,
                premiumWeekStart: this.getWeekStart(new Date()),
                freemiumExpired: true, // Marcar freemium como usado
            },
            create: {
                userId: user.id,
                plan: 'PREMIUM',
                status: 'ACTIVE',
                premiumStartDate: new Date(),
                premiumUsesLeft: 5,
                premiumWeekStart: this.getWeekStart(new Date()),
                freemiumExpired: true,
            },
        });

        this.logger.log(`🎉 Usuario ${user.id} (${user.phone}) activado como PREMIUM automáticamente`);
        try {
            await this.whatsappService.sendBotReply(user.phone, {
                text: `🎉 *¡Felicidades${user.name ? ', ' + user.name : ''}!*

Tu pago ha sido confirmado exitosamente.

✨ Ya tienes acceso al *Plan Premium*:
• 5 búsquedas/alertas por semana
• Sin límite de tiempo
• Acceso prioritario a nuevas funciones

¿Qué te gustaría hacer?
• Escribe *"buscar"* para encontrar ofertas ahora
• Escribe *"editar"* para ajustar tus preferencias`,
            });
            this.logger.log(`📱 Notificación de Premium enviada a ${user.phone}`);
        } catch (error) {
            this.logger.warn(`⚠️ No se pudo notificar al usuario ${user.phone}: ${error}`);
        }
    }

    /**
     * Obtiene el inicio de la semana actual (lunes a las 00:00)
     */
    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     Busca una transacción aprobada por email (para verificación manual desde chat)
     */
    async findApprovedTransactionByEmail(email: string): Promise<any | null> {
        return this.prisma.transaction.findFirst({
            where: {
                email: email.toLowerCase(),
                wompiStatus: 'APPROVED',
                wompiReference: {
                    startsWith: this.cioReferencePrefix,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
