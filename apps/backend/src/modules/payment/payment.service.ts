import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WompiWebhookPayload, WompiTransaction } from './dto/wompi-webhook.dto';
import { getFirstName } from '../conversation/helpers/input-validators';
import * as crypto from 'crypto';
import { PlanType, User } from '@prisma/client';

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly wompiEventsSecret: string;
    private readonly cioReferencePrefixPremium: string;
    private readonly cioReferencePrefixPro: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly whatsappService: WhatsappService,
    ) {
        this.wompiEventsSecret = this.configService.get<string>('WOMPI_EVENTS_SECRET', '');
        this.cioReferencePrefixPremium = this.configService.get<string>('WOMPI_CIO_REFERENCE_PREFIX', 'xTJSuZ');
        this.cioReferencePrefixPro = this.configService.get<string>('WOMPI_CIO_REFERENCE_PREFIX_PRO', '3XLQMl');
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

    /**
     * Verifica si la transacción es de CIO (Premium o Pro)
     */
    isCioTransaction(reference: string): boolean {
        const isPremium = reference.startsWith(this.cioReferencePrefixPremium);
        const isPro = reference.startsWith(this.cioReferencePrefixPro);

        if (!isPremium && !isPro) {
            this.logger.log(`ℹ️ Transacción ${reference} NO es de CIO (prefijos: ${this.cioReferencePrefixPremium}, ${this.cioReferencePrefixPro})`);
        }

        return isPremium || isPro;
    }

    /**
     * Determina el tipo de plan basado en el prefijo de la referencia
     */
    private determinePlanType(reference: string): PlanType {
        if (reference.startsWith(this.cioReferencePrefixPro)) {
            return 'PRO';
        }
        return 'PREMIUM';
    }

    /**
     * Obtiene la duración del plan en días
     */
    private getPlanDurationDays(planType: PlanType): number {
        switch (planType) {
            case 'PRO':
                return 90; // 3 meses
            case 'PREMIUM':
            default:
                return 30; // 1 mes
        }
    }

    async handleTransactionUpdate(payload: WompiWebhookPayload): Promise<void> {
        const { transaction } = payload.data;

        this.logger.log(
            `💳 Transacción ${transaction.id}: ${transaction.status} - Email: ${transaction.customer_email} - Ref: ${transaction.reference}`,
        );

        // Solo procesar transacciones de CIO
        if (!this.isCioTransaction(transaction.reference)) {
            this.logger.log(`⏭️ Ignorando transacción ${transaction.id} (no es de CIO)`);
            return;
        }

        // Determinar tipo de plan
        const planType = this.determinePlanType(transaction.reference);
        this.logger.log(`📋 Plan detectado: ${planType}`);

        // Guardar/actualizar transacción en BD
        await this.prisma.transaction.upsert({
            where: { wompiId: transaction.id },
            update: {
                wompiStatus: transaction.status,
                rawPayload: payload as any,
                planType: planType,
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
                planType: planType,
                rawPayload: payload as any,
            },
        });

        this.logger.log(`✅ Transacción ${transaction.id} guardada en BD (Plan: ${planType})`);

        if (transaction.status === 'APPROVED') {
            await this.tryLinkAndActivatePlan(transaction, planType);
        }
    }

    /**
     * Vincula una transacción aprobada con un usuario (existente o nuevo)
     */
    private async tryLinkAndActivatePlan(
        transaction: WompiTransaction,
        planType: PlanType
    ): Promise<void> {
        const email = transaction.customer_email.toLowerCase();
        const customerData = transaction.customer_data;
        const phone = customerData?.phone_number?.replace(/\D/g, '') || '';
        const fullName = customerData?.full_name || '';

        this.logger.log(`🔍 Buscando usuario: email=${email}, phone=${phone}, name=${fullName}`);

        // 1. Buscar usuario por email primero (prioridad)
        let user = await this.prisma.user.findFirst({
            where: { email },
            include: { subscription: true },
        });

        // 2. Si no existe por email, buscar por teléfono
        if (!user && phone) {
            user = await this.prisma.user.findFirst({
                where: { phone },
                include: { subscription: true },
            });

            // Si encontramos por phone, actualizar el email
            if (user) {
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { email },
                });
                this.logger.log(`📧 Email actualizado para usuario ${user.id}`);
            }
        }

        // 3. Si no existe, CREAR USUARIO NUEVO desde datos de Wompi
        if (!user) {
            if (!phone) {
                this.logger.warn(`⚠️ No se puede crear usuario sin teléfono. Email: ${email}`);
                return;
            }

            user = await this.createUserFromWompi(email, fullName, phone);
            this.logger.log(`🆕 Usuario creado automáticamente: ${user.id} (${user.phone})`);
        }

        // 4. Verificar si la transacción ya está vinculada
        const existingTransaction = await this.prisma.transaction.findUnique({
            where: { wompiId: transaction.id },
        });

        if (existingTransaction?.userId) {
            this.logger.log(`ℹ️ Transacción ${transaction.id} ya vinculada a usuario ${existingTransaction.userId}`);
            return;
        }

        // 5. Vincular transacción al usuario
        await this.prisma.transaction.update({
            where: { wompiId: transaction.id },
            data: {
                userId: user.id,
                linkedAt: new Date(),
            },
        });

        // 6. Activar plan
        await this.activatePlan(user.id, planType);

        // 7. Enviar mensaje de bienvenida
        await this.sendWelcomeMessage(user, planType);
    }

    /**
     * Crea un nuevo usuario desde los datos de Wompi
     */
    private async createUserFromWompi(
        email: string,
        name: string,
        phone: string
    ): Promise<User & { subscription: any }> {
        // Crear usuario
        const user = await this.prisma.user.create({
            data: {
                phone,
                name: name || 'Usuario',
                email: email.toLowerCase(),
            },
        });

        // Crear subscription vacía (se actualizará después)
        const subscription = await this.prisma.subscription.create({
            data: {
                userId: user.id,
                plan: 'FREEMIUM',
                status: 'ACTIVE',
            },
        });

        return { ...user, subscription };
    }

    /**
     * Activa el plan para un usuario
     */
    private async activatePlan(userId: string, planType: PlanType): Promise<void> {
        const now = new Date();
        const durationDays = this.getPlanDurationDays(planType);
        const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        // Verificar si el usuario ya tiene un plan activo
        const existingSubscription = await this.prisma.subscription.findUnique({
            where: { userId },
        });

        // Si ya tiene plan activo del mismo tipo o superior, extender la fecha
        if (existingSubscription?.status === 'ACTIVE' &&
            (existingSubscription.plan === planType || existingSubscription.plan === 'PRO')) {

            const currentEndDate = existingSubscription.premiumEndDate || now;
            const newEndDate = new Date(Math.max(currentEndDate.getTime(), now.getTime()) + durationDays * 24 * 60 * 60 * 1000);

            await this.prisma.subscription.update({
                where: { userId },
                data: {
                    premiumEndDate: newEndDate,
                    premiumUsesLeft: 5, // Resetear usos semanales
                    premiumWeekStart: now,
                },
            });

            this.logger.log(`🔄 Plan extendido para usuario ${userId} hasta ${newEndDate.toISOString()}`);
            return;
        }

        // Activar nuevo plan
        await this.prisma.subscription.upsert({
            where: { userId },
            update: {
                plan: planType,
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: endDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now,
                freemiumExpired: true,
            },
            create: {
                userId,
                plan: planType,
                status: 'ACTIVE',
                premiumStartDate: now,
                premiumEndDate: endDate,
                premiumUsesLeft: 5,
                premiumWeekStart: now,
                freemiumExpired: true,
            },
        });

        // Reactivar alertas si estaban deshabilitadas
        const alertPref = await this.prisma.alertPreference.findUnique({
            where: { userId }
        });

        if (alertPref && !alertPref.enabled) {
            await this.prisma.alertPreference.update({
                where: { userId },
                data: { enabled: true }
            });
            this.logger.log(`🔔 Alertas reactivadas para usuario ${userId}`);
        }

        this.logger.log(`🎉 Usuario ${userId} activado como ${planType} por ${durationDays} días (hasta ${endDate.toISOString()})`);
    }

    /**
     * Envía mensaje de bienvenida por WhatsApp
     */
    private async sendWelcomeMessage(
        user: User & { subscription: any },
        planType: PlanType
    ): Promise<void> {
        const durationDays = this.getPlanDurationDays(planType);
        const durationText = planType === 'PRO' ? '90 días (3 meses)' : '30 días';
        const planName = planType === 'PRO' ? 'Plan Pro' : 'Plan Premium';
        const isNewUser = !user.subscription || user.subscription.plan === 'FREEMIUM';

        try {
            if (isNewUser) {
                // Usuario nuevo - mensaje de bienvenida completo
                await this.whatsappService.sendBotReply(user.phone, {
                    text: `🎉 *¡Bienvenido a CIO, ${getFirstName(user.name)}!*

Tu pago ha sido confirmado y hemos creado tu cuenta automáticamente.

✨ Ya tienes acceso al *${planName}* por ${durationText}:
• 5 búsquedas semanales
• Alertas personalizadas de empleo
• Soporte prioritario
${planType === 'PRO' ? '• Acceso a GPT Almia Career Advisor' : ''}

💡 Para comenzar, cuéntame: *¿qué rol buscas?* (ej: "desarrollador", "diseñador", "analista")`,
                });
            } else {
                // Usuario existente - mensaje de activación
                await this.whatsappService.sendBotReply(user.phone, {
                    text: `🎉 *¡Felicidades ${getFirstName(user.name)}!*

Tu pago ha sido confirmado exitosamente.

✨ Ya tienes acceso al *${planName}* por ${durationText}:
• 5 búsquedas semanales (${durationDays === 90 ? '60' : '20'} al mes)
• Alertas personalizadas de empleo
• Soporte prioritario
${planType === 'PRO' ? '• Acceso a GPT Almia Career Advisor' : ''}

💡 _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._`,
                    listTitle: 'Ver opciones',
                    listSections: [
                        {
                            title: 'Comandos disponibles',
                            rows: [
                                { id: 'cmd_buscar', title: '🔍 Buscar empleos', description: 'Encontrar ofertas ahora' },
                                { id: 'cmd_editar', title: '✏️ Editar perfil', description: 'Ajustar tus preferencias' },
                            ],
                        },
                    ],
                });
            }

            this.logger.log(`📱 Notificación de ${planType} enviada a ${user.phone}`);
        } catch (error) {
            this.logger.warn(`⚠️ No se pudo notificar al usuario ${user.phone}: ${error}`);
        }
    }

    /**
     * Busca una transacción aprobada por email (para verificación manual desde chat)
     */
    async findApprovedTransactionByEmail(email: string): Promise<any | null> {
        return this.prisma.transaction.findFirst({
            where: {
                email: email.toLowerCase(),
                wompiStatus: 'APPROVED',
                OR: [
                    { wompiReference: { startsWith: this.cioReferencePrefixPremium } },
                    { wompiReference: { startsWith: this.cioReferencePrefixPro } },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Busca una transacción aprobada por teléfono (alternativa si no hay email)
     */
    async findApprovedTransactionByPhone(phone: string): Promise<any | null> {
        // Buscar en rawPayload donde customer_data.phone_number coincida
        const transactions = await this.prisma.transaction.findMany({
            where: {
                wompiStatus: 'APPROVED',
                userId: null, // Solo transacciones no vinculadas
                OR: [
                    { wompiReference: { startsWith: this.cioReferencePrefixPremium } },
                    { wompiReference: { startsWith: this.cioReferencePrefixPro } },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        // Buscar en rawPayload el teléfono
        for (const tx of transactions) {
            const payload = tx.rawPayload as any;
            const txPhone = payload?.data?.transaction?.customer_data?.phone_number?.replace(/\D/g, '');
            if (txPhone === phone) {
                return tx;
            }
        }

        return null;
    }
}
