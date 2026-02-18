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

    getWelcomeEmailHtml(name: string): string {
        const backendUrl = process.env.NODE_ENV === 'production'
            ? 'https://api.cio.almia.com.co'
            : 'http://localhost:3001';

        return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a CIO</title>
    <!-- Import Poppins Font -->
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        table { border-collapse: collapse !important; }
        body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: 'Poppins', Arial, sans-serif; }
        
        /* Mobile styles */
        @media screen and (max-width: 600px) {
            .mobile-width { width: 100% !important; max-width: 100% !important; }
            .mobile-stack { display: block !important; width: 100% !important; }
            .mobile-center { text-align: center !important; }
            .mobile-padding { padding: 20px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Poppins', Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="background-color: #f4f4f4;">
                <table border="0" cellpadding="0" cellspacing="0" width="600" class="mobile-width" style="background-color: #ffffff; max-width: 600px;">
                    
                    <!-- Header with Logo & Title -->
                    <tr>
                        <td align="center" style="background-color: #73439e; padding: 20px 0;">
                            <img src="${backendUrl}/assets/images/AlmiaLogoBlanco.svg" alt="Almia" width="120" style="display: block; margin-bottom: 15px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="80%">
                                <tr>
                                    <td align="center" style="background-color: #3bc8b8; border-radius: 20px; padding: 15px 20px;">
                                        <p style="margin: 0; color: #ffffff; font-size: 22px; line-height: 1.3; font-weight: 600;">
                                            ¡Encuentra <strong>empleo</strong> sin <strong>perder</strong><br>tanto <strong>tiempo</strong> buscando!
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Hero Image (Placeholder or Hosted URL) -->
                    <tr>
                        <td align="center">
                            <!-- NOTE: Replace with the actual URL of the 'People Smiling' image -->
                            <img src="${backendUrl}/assets/images/personas-felices.png" alt="Personas felices" width="600" style="display: block; width: 100%; max-width: 600px;">
                        </td>
                    </tr>

                    <!-- Problem Section -->
                    <tr>
                        <td align="center" style="padding: 10px 20px 10px;">
                            <p style="text-transform: uppercase; color: #666666; font-size: 18px; margin: 0 0 5px 0; letter-spacing: 3px; font-weight: 600;">Hoy el problema no es la falta de empleo</p>
                            <h2 style="text-transform: uppercase; color: #73439e; font-size: 18px; margin: 0 0 20px 0; letter-spacing: 1px; font-weight: 800;">Es no ver las oportunidades a tiempo</h2>
                            
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td valign="middle" width="100%" align="center" class="mobile-stack">
                                        <ul style="color: #555555; font-size: 16px; padding: 0; margin: 0; text-align: center; list-style-position: inside;">
                                            <li style="margin-bottom: 8px;">Las <strong>ofertas</strong> se publican <strong>todos</strong> los días</li>
                                            <li style="margin-bottom: 8px;">Están en <strong>muchos portales</strong> distintos</li>
                                            <li style="margin-bottom: 8px;">Algunas duran solo <strong>horas</strong> activas</li>
                                        </ul>
                                        <p style="text-align: center; color: #888888; font-size: 16px; margin-top: 15px;">Ahí es donde entra <a href="https://cio.almia.com.co" style="color: #666666; text-decoration: underline;"><strong>CIO</strong></a></p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Hunter Bar -->
                    <tr>
                        <td style="background-color: #3bc8b8; padding: 15px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="100%" align="center" class="mobile-stack mobile-center" style="color: #ffffff; text-transform: uppercase; font-size: 20px; line-height: 1.4; letter-spacing: 3px;">
                                        El <strong>Cazador</strong> de ofertas de<br><strong>empleo</strong> más grande de <strong>LATAM</strong>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                        <td style="background-color: #a676d1; padding: 30px 0 10px 20px; color: #ffffff;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <!-- Dark Purple Box with Text -->
                                <tr>
                                    <td colspan="2" align="center" style="padding-bottom: 20px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #5d3283; border-radius: 20px 0 0 20px;">
                                            <tr>
                                                <td align="center" style="padding: 20px;">
                                                    <p style="margin: 0; font-size: 18px; line-height: 1.4; color: #ffffff;">
                                                        <strong>CIO</strong> te da visibilidad <strong>diaria</strong> de <strong>oportunidades</strong><br>
                                                        de <strong>empleo, sin</strong> que tengas que <strong>buscarlas</strong>.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Bullet Points & Auto Text -->
                                <tr>
                                    <td valign="top" width="60%" class="mobile-stack">
                                        <ul style="font-size: 15px; padding-left: 20px; line-height: 1.5; margin: 0; color: #ffffff;">
                                            <li style="margin-bottom: 5px;">Revisa <strong>múltiples</strong> portales por ti</li>
                                            <li style="margin-bottom: 5px;">Detecta ofertas <strong>activas</strong> y <strong>recientes</strong></li>
                                            <li style="margin-bottom: 5px;">Filtra solo las que <strong>encajan</strong> con tu <strong>rol</strong></li>
                                            <li style="margin-bottom: 5px;">Te las envía directo a tu <strong>WhatsApp</strong></li>
                                        </ul>
                                    </td>
                                    <td valign="middle" width="40%" align="center" class="mobile-stack mobile-center" style="padding-right: 20px;">
                                        <p style="font-size: 16px; font-weight: bold; margin: 0; text-align: center; color: #ffffff;">
                                            Todo automático y<br>enfocado en ti...
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Ideal For Section (Purple Light) -->
                    <tr>
                        <td align="center" style="background: linear-gradient(180deg, #a676d1 60%, #ffffff 60%); padding: 0 50px;">
                            <p style="color: #ffffff; font-style: italic; margin-bottom: 20px;">Ideal para personas que:</p>
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <!-- Col 1 -->
                                    <td width="33%" valign="top" style="padding: 0 5px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #5d3283; border-radius: 10px; padding: 20px 30px; height: 190px; margin-bottom: -20px;">
                                            <tr>
                                                <td align="center" valign="middle">
                                                    <p style="color: #ffffff; font-size: 13px; margin: 0; line-height: 1.4;">
                                                        No tienen <strong>tiempo</strong> para buscar empleo todos los <strong>días</strong>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <!-- Col 2 -->
                                    <td width="33%" valign="top" style="padding: 0 5px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #5d3283; border-radius: 10px; padding: 20px 30px; height: 190px; margin-bottom: -20px;">
                                            <tr>
                                                <td align="center" valign="middle">
                                                    <p style="color: #ffffff; font-size: 13px; margin: 0; line-height: 1.4;">
                                                        Quieren <strong>oportunidades</strong> sin estar <strong>activamente</strong> buscando
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <!-- Col 3 -->
                                    <td width="33%" valign="top" style="padding: 0 5px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #5d3283; border-radius: 10px; padding: 20px 30px; height: 190px; margin-bottom: -20px;">
                                            <tr>
                                                <td align="center" valign="middle">
                                                    <p style="color: #ffffff; font-size: 13px; margin: 0; line-height: 1.4;">
                                                        Están empleados o desempleados, <strong>abiertos</strong> a algo <strong>mejor</strong>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- CTA Section (Teal Box) -->
                    <tr>
                        <td align="center" style="background-color: #ffffff; padding: 0 20px 40px 20px; position: relative; z-index: 10; margin-top: -30px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #3bc8b8; border-radius: 30px;">
                                <tr>
                                    <td style="padding: 30px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <!-- Left Col: Button & Text -->
                                                <td width="60%" valign="middle" class="mobile-stack">
                                                    <!-- Button -->
                                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                        <tr>
                                                            <td align="center" style="background-color: #ffffff; border-radius: 15px; padding: 10px 20px;">
                                                                <a href="https://cio.almia.com.co" style="color: #3bc8b8; font-weight: bold; text-decoration: underline; font-size: 14px; text-transform: uppercase; display: block;">
                                                                    Clic aquí para activar CIO y empezar a recibir oportunidades hoy
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    
                                                    <p style="color: #ffffff; font-size: 16px; margin: 20px 0 0 0; line-height: 1.4;">
                                                        Si hay una <strong>oferta laboral</strong> alineada a<br>
                                                        tu perfil, <strong>CIO</strong> te la hace <strong>visible</strong>.
                                                    </p>
                                                    
                                                    <p style="color: #ffffff; font-size: 24px; margin: 10px 0 0 0; letter-spacing: 2px;">
                                                        &gt;&gt;&gt;&gt;
                                                    </p>
                                                </td>
                                                
                                                <!-- Right Col: Image -->
                                                <td width="40%" valign="middle" align="center" class="mobile-stack mobile-center" style="padding-left: 20px;">
                                                    <img src="${backendUrl}/assets/images/personas-felices2.png" alt="Personas" width="180" style="border-radius: 20px; display: block; max-width: 100%; height: auto; filter: grayscale(100%);">
                                                </td>
                                            </tr>
                                            
                                            <!-- Logo (less padding) -->
                                            <tr>
                                                <td colspan="2" align="center" style="padding-top: 0;">
                                                    <img src="${backendUrl}/assets/images/AlmiaLogoBlanco.svg" alt="almia" width="100">
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Contact Links (Outside & Purple) -->
                            <p style="color: #73439e; font-size: 12px; margin: 10px 0 0 0; font-weight: 600;">
                                @almialatam &nbsp;&nbsp; +57 3135064977 &nbsp;&nbsp; almia.com.co
                            </p>
                        </td>
                    </tr>



                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
    }

    async sendWelcomeEmail(to: string, name: string) {
        try {
            const htmlContent = this.getWelcomeEmailHtml(name);

            const data = await this.resend.emails.send({
                from: 'CIO <contacto@almia.com.co>',
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
