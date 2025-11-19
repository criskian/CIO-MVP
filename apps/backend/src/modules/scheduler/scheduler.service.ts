import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobSearchService } from '../job-search/job-search.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

// Configurar dayjs con soporte de zona horaria
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobSearchService: JobSearchService,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.startJobAlertsCron();
  }

  /**
   * Inicia el cron para enviar alertas de empleo
   */
  private startJobAlertsCron() {
    // Ejecutar cada 5 minutos (para demo)
    // En producción: ajustar según necesidades
    cron.schedule('*/5 * * * *', async () => {
      this.logger.log('⏰ Ejecutando tarea de alertas de empleo...');
      await this.checkAndSendAlerts();
    });

    this.logger.log('✅ Scheduler de alertas iniciado (cada 5 minutos)');
  }

  /**
   * Revisa qué usuarios deben recibir alertas ahora y las envía
   */
  private async checkAndSendAlerts() {
    try {
      this.logger.log('🔍 Verificando usuarios para alertas...');

      // 1. Obtener todas las preferencias de alerta activas
      const alertPreferences = await this.prisma.alertPreference.findMany({
        where: { enabled: true },
        include: { user: true },
      });

      this.logger.log(`📊 ${alertPreferences.length} usuarios con alertas activas`);

      if (alertPreferences.length === 0) {
        this.logger.log('No hay usuarios para notificar');
        return;
      }

      // 2. Filtrar usuarios que deben recibir alerta AHORA
      const usersToNotify = alertPreferences.filter((pref) => this.shouldSendAlertNow(pref));

      this.logger.log(`📮 ${usersToNotify.length} usuarios deben recibir alerta ahora`);

      if (usersToNotify.length === 0) {
        return;
      }

      // 3. Enviar alertas a cada usuario (con manejo de errores individual)
      let successCount = 0;
      let failCount = 0;

      for (const alertPref of usersToNotify) {
        try {
          await this.runJobSearchAndNotifyUser(alertPref.userId);
          successCount++;
        } catch (error) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`❌ Error notificando a usuario ${alertPref.userId}: ${errorMessage}`);
          // Continuar con el siguiente usuario
        }
      }

      this.logger.log(`✅ Alertas enviadas: ${successCount} exitosas, ${failCount} fallidas`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error en checkAndSendAlerts: ${errorMessage}`);
    }
  }

  /**
   * Determina si un usuario debe recibir alerta ahora
   * Considera: hora configurada, frecuencia y última notificación
   */
  private shouldSendAlertNow(alertPref: any): boolean {
    try {
      const now = dayjs().tz(alertPref.timezone || 'America/Bogota');

      // Extraer hora y minutos configurados (formato "HH:mm" ej: "09:00")
      const [targetHour, targetMinute] = alertPref.alertTimeLocal.split(':').map(Number);

      const currentHour = now.hour();
      const currentMinute = now.minute();

      // Verificar si estamos en la ventana de tiempo (±5 minutos)
      const isWithinTimeWindow =
        currentHour === targetHour &&
        currentMinute >= targetMinute &&
        currentMinute < targetMinute + 5;

      if (!isWithinTimeWindow) {
        return false;
      }

      // Si no hay última notificación, es la primera vez → enviar
      if (!alertPref.lastNotification) {
        this.logger.debug(`✅ Usuario ${alertPref.userId}: Primera notificación → enviar`);
        return true;
      }

      // Verificar frecuencia
      const lastNotif = dayjs(alertPref.lastNotification).tz(
        alertPref.timezone || 'America/Bogota',
      );
      const hoursSinceLastAlert = now.diff(lastNotif, 'hours');

      let shouldSend = false;

      switch (alertPref.alertFrequency) {
        case 'daily':
          // Enviar si pasaron al menos 22 horas (~1 día)
          shouldSend = hoursSinceLastAlert >= 22;
          break;

        case 'every_3_days':
          // Enviar si pasaron al menos 70 horas (~3 días)
          shouldSend = hoursSinceLastAlert >= 70;
          break;

        case 'weekly':
          // Enviar si pasaron al menos 166 horas (~7 días)
          shouldSend = hoursSinceLastAlert >= 166;
          break;

        case 'monthly':
          // Enviar si pasaron al menos 718 horas (~30 días)
          shouldSend = hoursSinceLastAlert >= 718;
          break;

        default:
          // Default: diario
          shouldSend = hoursSinceLastAlert >= 22;
      }

      if (shouldSend) {
        this.logger.debug(
          `✅ Usuario ${alertPref.userId}: ${alertPref.alertFrequency}, última alerta hace ${hoursSinceLastAlert}h → enviar`,
        );
      }

      return shouldSend;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error evaluando si enviar alerta a ${alertPref.userId}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Ejecuta búsqueda de empleos y notifica a un usuario específico
   * Método reutilizable para scheduler Y búsquedas manuales
   */
  async runJobSearchAndNotifyUser(userId: string): Promise<void> {
    try {
      this.logger.log(`🔍 Buscando empleos para usuario ${userId}...`);

      // 1. Buscar empleos usando el JobSearchService
      const searchResult = await this.jobSearchService.searchJobsForUser(userId);

      // 2. Obtener teléfono del usuario
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // 3. Preparar y enviar mensaje
      let messageText: string;

      if (searchResult.jobs.length === 0) {
        // No hay ofertas nuevas
        messageText = `🔍 Hola! He buscado nuevas ofertas para ti, pero no encontré resultados nuevos que coincidan con tu perfil en este momento. 😔

Te volveré a notificar cuando encuentre algo interesante. ✨`;
      } else {
        // Hay ofertas → formatear y enviar
        const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(searchResult.jobs);

        messageText = `🎯 *¡Nuevas ofertas de empleo para ti!*\n\n${formattedJobs}\n\n_Te seguiré enviando alertas según tu configuración._ ⏰`;

        // 4. Marcar ofertas como enviadas
        await this.jobSearchService.markJobsAsSent(userId, searchResult.jobs);
      }

      // 5. Enviar mensaje por WhatsApp
      await this.whatsappService.sendBotReply(user.phone, { text: messageText });

      // 6. Actualizar lastNotification en AlertPreference
      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: {
          lastNotification: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.log(`✅ Usuario ${userId} notificado con ${searchResult.jobs.length} ofertas`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error en runJobSearchAndNotifyUser para ${userId}: ${errorMessage}`);

      // Intentar enviar mensaje de error al usuario
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { phone: true },
        });

        if (user) {
          await this.whatsappService.sendBotReply(user.phone, {
            text: 'Lo siento, hubo un problema temporal al buscar ofertas. Intentaré de nuevo en la próxima alerta. 🔄',
          });
        }
      } catch (sendError) {
        this.logger.error('No se pudo enviar mensaje de error al usuario');
      }

      throw error;
    }
  }
}
