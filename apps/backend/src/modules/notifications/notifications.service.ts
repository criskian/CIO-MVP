import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class NotificationsService {
    private resend: Resend;
    private readonly logger = new Logger(NotificationsService.name);

    constructor(private configService: ConfigService) {
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
    }): Promise<{ id: string | null }> {
        const { to, subject, html } = params;

        const data = await this.resend.emails.send({
            from: 'CIO <contacto@almia.com.co>',
            to: [to],
            subject,
            html,
        });

        if (data.error) {
            this.logger.error(`Error sending email to ${to}: ${data.error.message}`);
            throw new Error(data.error.message);
        }

        return { id: data.data?.id || null };
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

    async sendWelcomeEmail(to: string, name: string) {
        try {
            const htmlContent = this.getWelcomeEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: 'Bienvenido a CIO - Tu Cazador de Oportunidades',
                html: htmlContent,
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

    async sendOnboardingEmail(to: string, name: string) {
        try {
            const htmlContent = this.getOnboardingEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: '¡Ahora sí, a cazar ofertas de forma inteligente! 🚀',
                html: htmlContent,
            });
            this.logger.log(`Onboarding email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending onboarding email to ${to}`, error);
            throw error;
        }
    }

    async sendProfileUpdateEmail(to: string, name: string) {
        try {
            const htmlContent = this.getProfileUpdateEmailHtml(name);
            const result = await this.sendEmail({
                to,
                subject: '¿Ya actualizaste tu perfil en los portales de empleo?',
                html: htmlContent,
            });
            this.logger.log(`Profile update email sent to ${to}: ${result.id}`);
            return result;
        } catch (error) {
            this.logger.error(`Error sending profile update email to ${to}`, error);
            throw error;
        }
    }

    async sendCustomEmail(to: string, subject: string, html: string): Promise<{ id: string | null }> {
        try {
            const result = await this.sendEmail({ to, subject, html });
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
    }): Promise<{ id: string | null }> {
        const { slug, to, name, subject, html } = input;
        const safeName = (name || 'Usuario').trim() || 'Usuario';

        if (slug === 'welcome_email') {
            return this.sendWelcomeEmail(to, safeName);
        }

        if (slug === 'onboarding_email') {
            return this.sendOnboardingEmail(to, safeName);
        }

        if (slug === 'profile_update_email') {
            return this.sendProfileUpdateEmail(to, safeName);
        }

        if (!subject || !html) {
            throw new Error('La plantilla personalizada requiere subject y html');
        }

        return this.sendCustomEmail(to, subject, html);
    }
}

