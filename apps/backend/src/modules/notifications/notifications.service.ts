import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';

type EmailSendMetadata = {
    userId?: string | null;
    recipientName?: string | null;
    skipDispatchLog?: boolean;
};

@Injectable()
export class NotificationsService {
    private resend: Resend;
    private readonly logger = new Logger(NotificationsService.name);
    private readonly systemCampaignPrefix = '[SYSTEM]';

    constructor(
        private configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        if (!apiKey) {
            this.logger.warn('RESEND_API_KEY is not defined in env variables');
        }
        this.resend = new Resend(apiKey);
    }

    private async sendEmail(params: {
        to: string;
        subject: string;
        html: string;
        templateSlug: string;
        metadata?: EmailSendMetadata;
    }): Promise<{ id: string | null }> {
        const { to, subject, html, templateSlug, metadata } = params;

        try {
            const data = await this.resend.emails.send({
                from: 'CIO <contacto@almia.com.co>',
                to: [to],
                subject,
                html,
            });

            if (data.error) {
                throw new Error(data.error.message);
            }

            const messageId = data.data?.id || null;
            await this.recordEmailDispatch({
                templateSlug,
                to,
                status: 'SENT',
                providerMessageId: messageId,
                userId: metadata?.userId || null,
                recipientName: metadata?.recipientName || null,
                skipDispatchLog: metadata?.skipDispatchLog,
            });

            return { id: messageId };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.recordEmailDispatch({
                templateSlug,
                to,
                status: 'FAILED',
                errorMessage,
                userId: metadata?.userId || null,
                recipientName: metadata?.recipientName || null,
                skipDispatchLog: metadata?.skipDispatchLog,
            });
            this.logger.error(`Error sending email to ${to}: ${errorMessage}`);
            throw error;
        }
    }

    private async recordEmailDispatch(input: {
        templateSlug: string;
        to: string;
        status: 'SENT' | 'FAILED';
        providerMessageId?: string | null;
        errorMessage?: string;
        userId?: string | null;
        recipientName?: string | null;
        skipDispatchLog?: boolean;
    }): Promise<void> {
        if (input.skipDispatchLog) {
            return;
        }

        try {
            const campaignId = await this.ensureSystemCampaignForTemplate(input.templateSlug);
            await (this.prisma as any).emailDispatch.create({
                data: {
                    campaignId,
                    userId: input.userId || null,
                    email: input.to,
                    name: input.recipientName || null,
                    status: input.status,
                    providerMessageId: input.providerMessageId || null,
                    errorMessage: input.errorMessage || null,
                    sentAt: input.status === 'SENT' ? new Date() : null,
                },
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error registrando envío de email (${input.templateSlug}) para ${input.to}: ${errorMessage}`);
        }
    }

    private async ensureSystemCampaignForTemplate(templateSlug: string): Promise<string> {
        const template = await this.ensureTemplateExists(templateSlug);
        const campaignName = `${this.systemCampaignPrefix} ${template.slug}`;

        let campaign = await (this.prisma as any).emailCampaign.findFirst({
            where: {
                name: campaignName,
                templateId: template.id,
            },
            select: { id: true },
        });

        if (!campaign) {
            campaign = await (this.prisma as any).emailCampaign.create({
                data: {
                    name: campaignName,
                    templateId: template.id,
                    recipientList: 'ALL_USERS',
                    status: 'SENT',
                    sentAt: new Date(),
                    totalRecipients: 0,
                    successCount: 0,
                    failureCount: 0,
                },
                select: { id: true },
            });
        }

        return campaign.id;
    }

    private async ensureTemplateExists(slug: string): Promise<{ id: string; slug: string }> {
        const existing = await (this.prisma as any).emailTemplate.findUnique({
            where: { slug },
            select: { id: true, slug: true },
        });

        if (existing) {
            return existing;
        }

        const defaults: Record<string, { name: string; description: string; subject: string }> = {
            welcome_email: {
                name: 'Bienvenida CIO',
                description: 'Correo de bienvenida general de CIO',
                subject: 'Bienvenido a CIO - Tu Cazador de Oportunidades',
            },
            onboarding_email: {
                name: 'Onboarding CIO',
                description: 'Correo de onboarding con instrucciones de uso de CIO',
                subject: '¡Ahora sí, a cazar ofertas de forma inteligente! 🚀',
            },
            profile_update_email: {
                name: 'Actualización de Perfil en Portales',
                description: 'Correo para mejorar perfil en portales de empleo',
                subject: '¿Ya actualizaste tu perfil en los portales de empleo?',
            },
            premium_activation_email: {
                name: 'Activación Premium/Pro',
                description: 'Correo de bienvenida al plan pago tras compra en Wompi',
                subject: '¡Tu plan ya está activo en CIO! 🎉',
            },
        };

        const fallback = {
            name: slug,
            description: `Plantilla automática (${slug})`,
            subject: 'Notificación CIO',
        };

        const def = defaults[slug] || fallback;

        return (this.prisma as any).emailTemplate.create({
            data: {
                name: def.name,
                slug,
                description: def.description,
                subject: def.subject,
                type: 'PREDEFINED',
                isActive: true,
            },
            select: { id: true, slug: true },
        });
    }

    private getBackendUrl(): string {
        return process.env.NODE_ENV === 'production'
            ? 'https://api.cio.almia.com.co'
            : 'http://localhost:3001';
    }

    private getTemplatePath(fileName: string): string {
        const candidates = [
            path.join(__dirname, 'templates', fileName),
            path.join(process.cwd(), 'apps', 'backend', 'src', 'modules', 'notifications', 'templates', fileName),
            path.join(process.cwd(), 'src', 'modules', 'notifications', 'templates', fileName),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        throw new Error(`Email template not found: ${fileName}`);
    }

    private renderTemplate(fileName: string, vars: Record<string, string>): string {
        const templatePath = this.getTemplatePath(fileName);
        const template = fs.readFileSync(templatePath, 'utf8');

        return Object.entries(vars).reduce((html, [key, value]) => {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            return html.replace(regex, value);
        }, template);
    }

    getWelcomeEmailHtml(name: string): string {
        return this.renderTemplate('welcome.html', {
            name: (name || 'Usuario').trim() || 'Usuario',
            backendUrl: this.getBackendUrl(),
            ctaUrl: 'https://cio.almia.com.co',
        });
    }

    async sendWelcomeEmail(to: string, name: string, metadata?: EmailSendMetadata) {
        try {
            const htmlContent = this.getWelcomeEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: 'Bienvenido a CIO - Tu Cazador de Oportunidades',
                html: htmlContent,
                templateSlug: 'welcome_email',
                metadata: {
                    ...metadata,
                    recipientName: metadata?.recipientName || name,
                },
            });
            this.logger.log(`Welcome email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending email to ${to}`, error);
            throw error;
        }
    }

    getOnboardingEmailHtml(name: string): string {
        return this.renderTemplate('onboarding.html', {
            name: (name || 'Usuario').trim() || 'Usuario',
            backendUrl: this.getBackendUrl(),
            ctaUrl: 'https://wa.me/573226906461',
        });
    }

    getProfileUpdateEmailHtml(name: string): string {
        return this.renderTemplate('profile_update_email.html', {
            name: (name || 'Usuario').trim() || 'Usuario',
            backendUrl: this.getBackendUrl(),
            ctaUrl: 'https://wa.me/573226906461',
        });
    }

    getPremiumActivationEmailHtml(name: string, planName: string = 'Premium'): string {
        const safePlanName = planName === 'PRO' ? 'Pro' : 'Premium';
        const planDuration = safePlanName === 'Pro' ? '90 días' : '30 días';
        const proBenefitBlock = safePlanName === 'Pro'
            ? '<li style=\"margin: 0 0 6px 0;\">Acceso a funcionalidades avanzadas de asesoría profesional</li>'
            : '';

        return this.renderTemplate('premium_activation_email.html', {
            name: (name || 'Usuario').trim() || 'Usuario',
            planName: safePlanName,
            planDuration,
            proBenefitBlock,
            backendUrl: this.getBackendUrl(),
            ctaUrl: 'https://wa.me/573226906461',
        });
    }

    async sendOnboardingEmail(to: string, name: string, metadata?: EmailSendMetadata) {
        try {
            const htmlContent = this.getOnboardingEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: '¡Ahora sí, a cazar ofertas de forma inteligente! 🚀',
                html: htmlContent,
                templateSlug: 'onboarding_email',
                metadata: {
                    ...metadata,
                    recipientName: metadata?.recipientName || name,
                },
            });
            this.logger.log(`Onboarding email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending onboarding email to ${to}`, error);
            throw error;
        }
    }

    async sendProfileUpdateEmail(to: string, name: string, metadata?: EmailSendMetadata) {
        try {
            const htmlContent = this.getProfileUpdateEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: '¿Ya actualizaste tu perfil en los portales de empleo?',
                html: htmlContent,
                templateSlug: 'profile_update_email',
                metadata: {
                    ...metadata,
                    recipientName: metadata?.recipientName || name,
                },
            });
            this.logger.log(`Profile update email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending profile update email to ${to}`, error);
            throw error;
        }
    }

    async sendPremiumActivationEmail(
        to: string,
        name: string,
        planName: string = 'Premium',
        metadata?: EmailSendMetadata,
    ) {
        try {
            const htmlContent = this.getPremiumActivationEmailHtml(name, planName);
            const safePlanName = planName === 'PRO' ? 'Pro' : 'Premium';
            const result = await this.sendEmail({
                to,
                subject: `¡Tu Plan ${safePlanName} ya está activo en CIO! 🎉`,
                html: htmlContent,
                templateSlug: 'premium_activation_email',
                metadata: {
                    ...metadata,
                    recipientName: metadata?.recipientName || name,
                },
            });
            this.logger.log(`Premium activation email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending premium activation email to ${to}`, error);
            throw error;
        }
    }

    async sendCustomEmail(
        to: string,
        subject: string,
        html: string,
        metadata?: EmailSendMetadata,
        templateSlug: string = 'custom_email',
    ): Promise<{ id: string | null }> {
        try {
            const result = await this.sendEmail({
                to,
                subject,
                html,
                templateSlug,
                metadata,
            });
            this.logger.log(`Custom email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending custom email to ${to}`, error);
            throw error;
        }
    }

    async sendTemplateEmailBySlug(input: {
        slug: string;
        to: string;
        name?: string | null;
        subject?: string;
        html?: string | null;
        metadata?: EmailSendMetadata;
    }): Promise<{ id: string | null }> {
        const { slug, to, name, subject, html, metadata } = input;
        const safeName = (name || 'Usuario').trim() || 'Usuario';

        if (slug === 'welcome_email') {
            return this.sendWelcomeEmail(to, safeName, metadata);
        }

        if (slug === 'onboarding_email') {
            return this.sendOnboardingEmail(to, safeName, metadata);
        }

        if (slug === 'profile_update_email') {
            return this.sendProfileUpdateEmail(to, safeName, metadata);
        }

        if (slug === 'premium_activation_email') {
            return this.sendPremiumActivationEmail(to, safeName, 'Premium', metadata);
        }

        if (!subject || !html) {
            throw new Error('La plantilla personalizada requiere subject y html');
        }

        return this.sendCustomEmail(to, subject, html, metadata, slug);
    }
}

