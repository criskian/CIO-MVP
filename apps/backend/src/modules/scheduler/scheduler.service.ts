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
  ) { }

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
      const usersToNotify = alertPreferences.filter((pref: any) => this.shouldSendAlertNow(pref));

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
      const userId = alertPref.userId;

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
        this.logger.debug(
          `⏰ Usuario ${userId}: Fuera de ventana horaria (actual: ${currentHour}:${currentMinute}, objetivo: ${targetHour}:${targetMinute}) → NO ENVIAR`,
        );
        return false;
      }

      // Si no hay última notificación, es la primera vez → enviar
      if (!alertPref.lastNotification) {
        this.logger.log(`✅ Usuario ${userId}: Primera notificación (${alertPref.alertFrequency}) → ENVIAR`);
        return true;
      }

      // Calcular tiempo desde última notificación
      const lastNotif = dayjs(alertPref.lastNotification).tz(
        alertPref.timezone || 'America/Bogota',
      );

      // [FIX] Usar diferencia en DÍAS para mayor precisión
      const daysSinceLastAlert = now.diff(lastNotif, 'day', true); // true = con decimales
      const hoursSinceLastAlert = now.diff(lastNotif, 'hour');

      this.logger.debug(
        `⏰ Usuario ${userId}: Última alerta hace ${daysSinceLastAlert.toFixed(2)} días (${hoursSinceLastAlert} horas)`,
      );

      // Verificar según frecuencia configurada
      let shouldSend = false;

      switch (alertPref.alertFrequency) {
        case 'daily':
          // [FIX] Enviar si pasaron al menos 23 horas (casi un día completo)
          // Esto evita enviar 2 veces el mismo día pero asegura que se envíe diariamente
          shouldSend = hoursSinceLastAlert >= 23;
          break;

        case 'every_3_days':
          // Enviar si pasaron al menos 2.9 días (~70 horas)
          shouldSend = daysSinceLastAlert >= 2.9;
          break;

        case 'weekly':
          // Enviar si pasaron al menos 6.9 días (~166 horas)
          shouldSend = daysSinceLastAlert >= 6.9;
          break;

        case 'monthly':
          // Enviar si pasaron al menos 29 días
          shouldSend = daysSinceLastAlert >= 29;
          break;

        default:
          // Si frecuencia no reconocida, loguear y usar diario
          this.logger.warn(`⚠️ Usuario ${userId}: Frecuencia desconocida "${alertPref.alertFrequency}", usando diario`);
          shouldSend = hoursSinceLastAlert >= 23;
      }

      // Loguear decisión para debug
      if (shouldSend) {
        this.logger.log(
          `✅ Usuario ${userId}: Frecuencia=${alertPref.alertFrequency}, última alerta hace ${daysSinceLastAlert.toFixed(1)} días (${hoursSinceLastAlert}h) → ENVIAR`,
        );
      } else {
        this.logger.debug(
          `⏳ Usuario ${userId}: Frecuencia=${alertPref.alertFrequency}, última alerta hace ${daysSinceLastAlert.toFixed(1)} días (${hoursSinceLastAlert}h) → NO ENVIAR AÚN`,
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
   * INCLUYE: Verificación de plan y descuento de uso
   */
  async runJobSearchAndNotifyUser(userId: string): Promise<void> {
    try {
      this.logger.log(`🔍 Buscando empleos para usuario ${userId}...`);

      // 1. Verificar usos disponibles ANTES de buscar
      const usageCheck = await this.checkAndDeductAlertUsage(userId);

      if (!usageCheck.allowed) {
        this.logger.log(`⏩ Usuario ${userId}: ${usageCheck.reason || 'Sin usos disponibles'}`);
        // Si el plan expiró, opcionalmente notificar al usuario
        if (usageCheck.shouldNotify) {
          await this.notifyPlanExpired(userId);
        }
        return;
      }

      // 2. Obtener teléfono del usuario
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, name: true },
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // 3. Buscar empleos usando el JobSearchService
      const searchResult = await this.jobSearchService.searchJobsForUser(userId);

      // 4. Preparar y enviar mensaje
      let messageText: string;

      if (searchResult.jobs.length === 0) {
        // No hay ofertas nuevas
        messageText = `🔍 Hola! He buscado nuevas ofertas para ti, pero no encontré resultados nuevos que coincidan con tu perfil en este momento. 😔

Te volveré a notificar cuando encuentre algo interesante. ✨`;
      } else {
        // Hay ofertas → formatear y enviar
        const formattedJobs = this.jobSearchService.formatJobsForWhatsApp(searchResult.jobs);

        messageText = `🎯 *¡Nuevas ofertas de empleo para ti!*\n\n${formattedJobs}`;

        // Marcar ofertas como enviadas
        await this.jobSearchService.markJobsAsSent(userId, searchResult.jobs);
      }

      // 5. Agregar info de usos restantes al final del mensaje
      if (usageCheck.usesLeft !== undefined) {
        if (usageCheck.plan === 'PREMIUM') {
          messageText += `\n\n📊 _Te quedan *${usageCheck.usesLeft}* búsqueda${usageCheck.usesLeft !== 1 ? 's' : ''} esta semana._`;
        } else {
          messageText += `\n\n📊 _Te quedan *${usageCheck.usesLeft}* búsqueda${usageCheck.usesLeft !== 1 ? 's' : ''} gratuita${usageCheck.usesLeft !== 1 ? 's' : ''}._`;
        }
      }

      messageText += `\n\n_Te seguiré enviando alertas según tu configuración._ ⏰`;

      // 6. Enviar mensaje por WhatsApp
      await this.whatsappService.sendBotReply(user.phone, { text: messageText });

      // 7. Actualizar lastNotification en AlertPreference
      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: {
          lastNotification: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.log(`✅ Usuario ${userId} notificado con ${searchResult.jobs.length} ofertas (usos restantes: ${usageCheck.usesLeft})`);
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

  /**
   * Verifica si el usuario puede recibir una alerta y descuenta el uso
   * Similar a checkAndDeductUsage en ConversationService pero para alertas
   */
  private async checkAndDeductAlertUsage(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    usesLeft?: number;
    plan?: 'FREEMIUM' | 'PREMIUM';
    shouldNotify?: boolean;
  }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripción, no debería tener alertas activas
    if (!subscription) {
      return { allowed: false, reason: 'Sin suscripción' };
    }

    // PLAN PREMIUM
    if (subscription.plan === 'PREMIUM' && subscription.status === 'ACTIVE') {
      // Verificar si es nueva semana
      const weekStart = subscription.premiumWeekStart;
      const now = new Date();

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        // Resetear usos semanales
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 que está usando ahora
            premiumWeekStart: this.getWeekStart(now),
          },
        });
        return { allowed: true, usesLeft: 4, plan: 'PREMIUM' };
      }

      if (subscription.premiumUsesLeft > 0) {
        const newUsesLeft = subscription.premiumUsesLeft - 1;
        await this.prisma.subscription.update({
          where: { userId },
          data: { premiumUsesLeft: newUsesLeft },
        });
        return { allowed: true, usesLeft: newUsesLeft, plan: 'PREMIUM' };
      }

      return {
        allowed: false,
        reason: 'Límite semanal premium alcanzado',
        plan: 'PREMIUM',
      };
    }

    // PLAN FREEMIUM
    // Verificar si ya expiró (flag o días)
    if (subscription.freemiumExpired) {
      return {
        allowed: false,
        reason: 'Freemium expirado',
        plan: 'FREEMIUM',
        shouldNotify: true,
      };
    }

    // Verificar si pasaron 3 días
    const daysSinceStart = Math.floor(
      (Date.now() - subscription.freemiumStartDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceStart >= 3 || subscription.freemiumUsesLeft <= 0) {
      // Marcar freemium como expirado
      await this.prisma.subscription.update({
        where: { userId },
        data: { freemiumExpired: true },
      });

      return {
        allowed: false,
        reason: 'Freemium expirado (tiempo o usos agotados)',
        plan: 'FREEMIUM',
        shouldNotify: true,
      };
    }

    // Deducir uso freemium
    const newUsesLeft = subscription.freemiumUsesLeft - 1;
    await this.prisma.subscription.update({
      where: { userId },
      data: { freemiumUsesLeft: newUsesLeft },
    });

    return { allowed: true, usesLeft: newUsesLeft, plan: 'FREEMIUM' };
  }

  /**
   * Notifica al usuario que su plan expiró
   */
  private async notifyPlanExpired(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, name: true },
      });

      if (!user) return;

      const message = `⏰ *Hola${user.name ? ` ${user.name}` : ''}*

Tu período de prueba gratuita ha terminado y no puedo seguir enviándote alertas de empleo.

✨ Para continuar recibiendo ofertas personalizadas, activa el *Plan Premium*:

🔗 *Enlace de pago:* ${process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ'}

Una vez realices el pago, escríbeme por este chat para activar tu cuenta.`;

      await this.whatsappService.sendBotReply(user.phone, { text: message });

      // Desactivar alertas para no seguir intentando
      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: { enabled: false },
      });

      this.logger.log(`📧 Usuario ${userId} notificado de expiración de plan`);
    } catch (error) {
      this.logger.error(`Error notificando expiración a usuario ${userId}`);
    }
  }

  /**
   * Verifica si estamos en una nueva semana (lunes a domingo)
   */
  private isNewWeek(weekStart: Date, now: Date): boolean {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return now >= weekEnd;
  }

  /**
   * Obtiene el inicio de la semana actual (lunes 00:00)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

