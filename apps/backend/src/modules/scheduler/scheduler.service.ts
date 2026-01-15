/**
 * SCHEDULER SERVICE - Sistema de Alertas de Empleo
 * 
 * Envía alertas automáticas de ofertas de empleo a usuarios según sus preferencias.
 * 
 * CARACTERÍSTICAS:
 * ✅ Procesamiento por lotes (10 usuarios en paralelo por defecto)
 * ✅ Delays entre lotes para respetar rate limits de WhatsApp/Twilio
 * ✅ Protección contra ejecuciones concurrentes (overlapping)
 * ✅ Ventana de tiempo amplia (10 minutos) para procesar múltiples usuarios
 * ✅ Prevención de alertas duplicadas en la misma ventana
 * ✅ Manejo individual de errores (un usuario fallido no afecta a otros)
 * ✅ Logging detallado para monitoreo
 * ✅ Respeto de zonas horarias individuales
 * ✅ Verificación de planes y límites de uso
 * 
 * CONFIGURACIÓN AJUSTABLE:
 * - BATCH_SIZE: Usuarios a procesar en paralelo (default: 10)
 * - DELAY_BETWEEN_BATCHES_MS: Delay entre lotes en ms (default: 2000)
 * - MAX_PROCESSING_TIME_MINUTES: Tiempo máximo de procesamiento (default: 4)
 * - Ventana de tiempo: 10 minutos desde hora configurada
 * - Protección anti-duplicados: 15 minutos mínimo entre alertas
 * 
 * ESCALABILIDAD:
 * Con configuración actual puede manejar ~120 usuarios por hora sin problemas.
 * Para más usuarios, ajustar BATCH_SIZE y/o reducir DELAY_BETWEEN_BATCHES_MS.
 */

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
  private isProcessing = false; // [FIX] Bandera para evitar overlapping

  // [CONFIGURACIÓN] Ajustar según necesidades de producción
  private readonly BATCH_SIZE = 10; // Procesar 10 usuarios en paralelo
  private readonly DELAY_BETWEEN_BATCHES_MS = 2000; // 2 segundos entre lotes para respetar rate limits
  private readonly MAX_PROCESSING_TIME_MINUTES = 4; // Máximo tiempo de procesamiento para estar dentro de ventana

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobSearchService: JobSearchService,
    private readonly whatsappService: WhatsappService,
  ) { }

  onModuleInit() {
    this.startJobAlertsCron();
    this.startFreemiumReminderCron();
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
   * Inicia el cron para enviar recordatorios de freemium (23 horas después)
   */
  private startFreemiumReminderCron() {
    // Ejecutar cada hora para revisar usuarios pendientes
    cron.schedule('0 * * * *', async () => {
      this.logger.log('⏰ Revisando recordatorios de freemium...');
      await this.sendFreemiumReminders();
    });

    this.logger.log('✅ Scheduler de recordatorios freemium iniciado (cada hora)');
  }

  /**
   * Envía recordatorios a usuarios que recibieron FREEMIUM_EXPIRED hace 23+ horas
   * y no han respondido ni pagado
   */
  private async sendFreemiumReminders() {
    try {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);

      // Buscar usuarios que:
      // - Tienen freemiumExpiredSentAt (se les envió FREEMIUM_EXPIRED)
      // - Hace más de 23 horas
      // - No se les ha enviado el reminder todavía
      // - Siguen sin pagar (plan = FREEMIUM y freemiumExpired = true)
      const usersToRemind = await this.prisma.subscription.findMany({
        where: {
          freemiumExpiredSentAt: {
            not: null,
            lte: twentyThreeHoursAgo,
          },
          freemiumReminderSent: false,
          plan: 'FREEMIUM',
          freemiumExpired: true,
        },
        include: {
          user: true,
        },
      });

      this.logger.log(`📬 ${usersToRemind.length} usuarios pendientes de recordatorio freemium`);

      for (const subscription of usersToRemind) {
        try {
          const userName = subscription.user?.name;
          const phone = subscription.user?.phone;

          if (!phone) continue;

          // Importar mensaje dinámicamente para evitar dependencia circular
          const { BotMessages } = await import('../conversation/helpers/bot-messages');

          await this.whatsappService.sendBotReply(phone, {
            text: BotMessages.FREEMIUM_REMINDER(userName),
          });

          // Marcar como enviado
          await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { freemiumReminderSent: true },
          });

          this.logger.log(`✅ Recordatorio enviado a ${phone}`);
        } catch (error) {
          this.logger.error(`❌ Error enviando recordatorio a ${subscription.userId}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Error en sendFreemiumReminders: ${error}`);
    }
  }

  /**
   * Revisa qué usuarios deben recibir alertas ahora y las envía
   * [MEJORADO] Procesamiento por lotes con delays para evitar rate limiting
   */
  private async checkAndSendAlerts() {
    // [FIX] Prevenir ejecuciones concurrentes (overlapping)
    if (this.isProcessing) {
      this.logger.warn('⚠️ Ya hay una ejecución en curso, saltando esta iteración');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

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

      // [MEJORADO] 3. Procesar usuarios en LOTES para mejor rendimiento y control de rate limiting
      const totalUsers = usersToNotify.length;
      let successCount = 0;
      let failCount = 0;
      let batchNumber = 0;

      // Dividir usuarios en lotes
      for (let i = 0; i < totalUsers; i += this.BATCH_SIZE) {
        batchNumber++;
        const batch = usersToNotify.slice(i, i + this.BATCH_SIZE);

        this.logger.log(`📦 Procesando lote ${batchNumber} (${batch.length} usuarios)...`);

        // [FIX] Procesar lote en PARALELO (pero limitado por BATCH_SIZE)
        const batchPromises = batch.map(async (alertPref) => {
          try {
            await this.runJobSearchAndNotifyUser(alertPref.userId);
            return { success: true, userId: alertPref.userId };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`❌ Error notificando a usuario ${alertPref.userId}: ${errorMessage}`);
            return { success: false, userId: alertPref.userId, error: errorMessage };
          }
        });

        // Esperar a que termine el lote completo
        const batchResults = await Promise.allSettled(batchPromises);

        // Contar resultados del lote
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            failCount++;
          }
        });

        // [FIX] Delay entre lotes para respetar rate limits de WhatsApp/Twilio
        // Solo si no es el último lote
        if (i + this.BATCH_SIZE < totalUsers) {
          this.logger.debug(`⏳ Esperando ${this.DELAY_BETWEEN_BATCHES_MS}ms antes del siguiente lote...`);
          await this.sleep(this.DELAY_BETWEEN_BATCHES_MS);
        }

        // [FIX] Verificar si estamos excediendo el tiempo máximo
        const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
        if (elapsedMinutes > this.MAX_PROCESSING_TIME_MINUTES) {
          this.logger.warn(`⚠️ Tiempo máximo de procesamiento alcanzado (${elapsedMinutes.toFixed(1)} min). Usuarios restantes: ${totalUsers - (i + this.BATCH_SIZE)}`);
          break;
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`✅ Alertas completadas en ${totalTime}s: ${successCount} exitosas, ${failCount} fallidas`);

      // [NUEVO] Log de advertencia si hay muchos fallos
      if (failCount > 0 && failCount / totalUsers > 0.2) {
        this.logger.warn(`⚠️ Tasa de fallos alta: ${((failCount / totalUsers) * 100).toFixed(1)}% de alertas fallaron`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error crítico en checkAndSendAlerts: ${errorMessage}`);
    } finally {
      // [FIX] Siempre liberar el lock, incluso si hay error
      this.isProcessing = false;
    }
  }

  /**
   * Helper para esperar un tiempo determinado
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Determina si un usuario debe recibir alerta ahora
   * Considera: hora configurada, frecuencia y última notificación
   * [MEJORADO] Ventana ampliada y mejor logging
   */
  private shouldSendAlertNow(alertPref: any): boolean {
    try {
      const now = dayjs().tz(alertPref.timezone || 'America/Bogota');
      const userId = alertPref.userId;

      // Extraer hora y minutos configurados (formato "HH:mm" ej: "09:00")
      const [targetHour, targetMinute] = alertPref.alertTimeLocal.split(':').map(Number);

      const currentHour = now.hour();
      const currentMinute = now.minute();

      // [FIX] Ampliar ventana a 10 minutos para dar más margen de procesamiento
      // Calcular minutos totales desde medianoche para comparación más precisa
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const targetTotalMinutes = targetHour * 60 + targetMinute;
      const minutesDiff = currentTotalMinutes - targetTotalMinutes;

      // Ventana: desde la hora exacta hasta 10 minutos después
      const isWithinTimeWindow = minutesDiff >= 0 && minutesDiff < 10;

      if (!isWithinTimeWindow) {
        this.logger.debug(
          `⏰ Usuario ${userId}: Fuera de ventana horaria (actual: ${currentHour}:${String(currentMinute).padStart(2, '0')}, objetivo: ${targetHour}:${String(targetMinute).padStart(2, '0')}, diff: ${minutesDiff} min) → NO ENVIAR`,
        );
        return false;
      }

      this.logger.debug(
        `✅ Usuario ${userId}: Dentro de ventana horaria (diff: ${minutesDiff} min desde objetivo)`,
      );

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
      const minutesSinceLastAlert = now.diff(lastNotif, 'minute');

      this.logger.debug(
        `⏰ Usuario ${userId}: Última alerta hace ${daysSinceLastAlert.toFixed(2)} días (${hoursSinceLastAlert}h ${minutesSinceLastAlert % 60}m)`,
      );

      // [FIX CRÍTICO] Evitar enviar múltiples veces en la misma ventana horaria
      // Si la última alerta fue hace menos de 15 minutos, NO enviar (incluso si cumple frecuencia)
      if (minutesSinceLastAlert < 15) {
        this.logger.debug(
          `⏭️ Usuario ${userId}: Ya recibió alerta hace ${minutesSinceLastAlert} minutos (muy reciente) → NO ENVIAR`,
        );
        return false;
      }

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
      const now = new Date();

      // Verificar si el plan premium expiró (30 días)
      if (subscription.premiumEndDate && now > subscription.premiumEndDate) {
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            status: 'EXPIRED',
            plan: 'FREEMIUM',
            freemiumExpired: true,
          },
        });
        return {
          allowed: false,
          reason: 'Plan Premium expirado (30 días)',
          plan: 'PREMIUM',
          shouldNotify: true,
        };
      }

      // Verificar si es nueva semana (cada 7 días desde premiumWeekStart)
      const weekStart = subscription.premiumWeekStart;

      if (!weekStart || this.isNewWeek(weekStart, now)) {
        // Resetear usos semanales
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            premiumUsesLeft: 4, // 5 - 1 que está usando ahora
            premiumWeekStart: now, // Nueva semana empieza desde ahora
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
   * Verifica si han pasado 7 días desde el inicio de la semana premium
   */
  private isNewWeek(weekStart: Date, now: Date): boolean {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return now >= weekEnd;
  }

  /**
   * Ya no se usa - mantenido por compatibilidad
   * @deprecated Ahora premiumWeekStart se establece como la fecha actual
   */
  private getWeekStart(date: Date): Date {
    return new Date(date);
  }
}

