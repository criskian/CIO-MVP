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

    async sendWelcomeEmail(to: string, name: string) {
        try {
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bienvenido a CIO</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background-color: #73439e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; color: #333333; line-height: 1.6; }
    .button { display: inline-block; padding: 10px 20px; background-color: #73439e; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>¡Bienvenido a CIO!</h1>
    </div>
    <div class="content">
      <p>Hola <strong>${name}</strong>,</p>
      <p>Gracias por unirte a CIO - Tu Cazador Inteligente de Oportunidades.</p>
      <p>Estamos emocionados de ayudarte a encontrar las mejores oportunidades laborales adaptadas a tu perfil.</p>
      <p>Haz clic en el botón de abajo para completar tu perfil y empezar la búsqueda:</p>
      <center>
        <a href="https://cio-mvp.vercel.app" class="button">Ir a mi Perfil</a>
      </center>
    </div>
    <div class="footer">
      <p>&copy; 2024 CIO - Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
      `;

            const data = await this.resend.emails.send({
                from: 'CIO <onboarding@resend.dev>', // Update this with your verified domain in production
                to: [to],
                subject: 'Bienvenido a CIO - Tu Cazador de Oportunidades',
                html: htmlContent,
            });

            if (data.error) {
                this.logger.error(`Error sending email to ${to}: ${data.error.message}`);
                throw new Error(data.error.message);
            }

            this.logger.log(`Email sent to ${to}: ${data.data?.id}`);
            return data;
        } catch (error) {
            this.logger.error(`Error sending email to ${to}`, error);
            throw error;
        }
    }
}
