/**
 * SCHEDULER SERVICE - Sistema de Alertas de Empleo
 * 
 * Envía alertas automáticas de ofertas de empleo a usuarios según sus preferencias.
 * 
 * CARACTERÍSTICAS:
 * ?S& Procesamiento por lotes (10 usuarios en paralelo por defecto)
 * ?S& Delays entre lotes para respetar rate limits de WhatsApp/Twilio
 * ✅ Protección contra ejecuciones concurrentes (overlapping)
 * ✅ Ventana de tiempo amplia (10 minutos) para procesar múltiples usuarios
 * ✅ Prevención de alertas duplicadas en la misma ventana
 * ?S& Manejo individual de errores (un usuario fallido no afecta a otros)
 * ?S& Logging detallado para monitoreo
 * ?S& Respeto de zonas horarias individuales
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
import { AdminService } from '../admin/admin.service';
import { getFirstName } from '../conversation/helpers/input-validators';
import { shouldExpireFreemiumByPolicy } from '../conversation/helpers/date-utils';
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
    private readonly adminService: AdminService,
  ) { }

  onModuleInit() {
    this.startJobAlertsCron();
    // [DESACTIVADO] Violación de política WhatsApp - envía mensajes proactivos sin template aprobado
    // this.startFreemiumReminderCron();
    this.startFreemiumExpirationCron();
    this.startPremiumExpirationCron();
    this.startScheduledEmailsCron();
  }

  /**
   * Inicia el cron para enviar alertas de empleo
   */
  private startJobAlertsCron() {
    // Ejecutar cada 5 minutos (para demo)
    // En producción: ajustar según necesidades
    cron.schedule('*/5 * * * *', async () => {
      this.logger.log('Ejecutando tarea de alertas de empleo...');
      await this.checkAndSendAlerts();
    });

    this.logger.log('Scheduler de alertas iniciado (cada 5 minutos)');
  }

  /**
   * Inicia el cron para procesar campañas de email programadas.
   */
  private startScheduledEmailsCron() {
    cron.schedule('* * * * *', async () => {
      try {
        await this.adminService.processScheduledEmailCampaigns();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error procesando campañas de email programadas: `);
      }
    });

    this.logger.log('Scheduler de campañas de email iniciado (cada minuto)');
  }
  /**
   * Inicia el cron para enviar recordatorios de freemium (23 horas después)
   */
  // [DESACTIVADO] Violación de política WhatsApp - envía mensajes promocionales con links de pago fuera de la ventana 24h sin template
  // private startFreemiumReminderCron() {
  //   cron.schedule('0 * * * *', async () => {
  //     this.logger.log('? Revisando recordatorios de freemium...');
  //     await this.sendFreemiumReminders();
  //   });
  //   this.logger.log('?S& Scheduler de recordatorios freemium iniciado (cada hora)');
  // }

  /**
   * Envía recordatorios a usuarios que recibieron FREEMIUM_EXPIRED hace 23+ horas
   * y no han respondido ni pagado
   */
  // [DESACTIVADO] Violación de política WhatsApp - envía mensajes promocionales con links de pago fuera de la ventana 24h sin template
  // private async sendFreemiumReminders() {
  //   try {
  //     const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
  //     const usersToRemind = await this.prisma.subscription.findMany({
  //       where: {
  //         freemiumExpiredSentAt: { not: null, lte: twentyThreeHoursAgo },
  //         freemiumReminderSent: false,
  //         plan: 'FREEMIUM',
  //         freemiumExpired: true,
  //       },
  //       include: { user: true },
  //     });
  //     for (const subscription of usersToRemind) {
  //       const userName = getFirstName(subscription.user?.name);
  //       const phone = subscription.user?.phone;
  //       if (!phone) continue;
  //       const { BotMessages } = await import('../conversation/helpers/bot-messages');
  //       await this.whatsappService.sendBotReply(phone, {
  //         text: BotMessages.FREEMIUM_REMINDER(userName),
  //       });
  //       await this.prisma.subscription.update({
  //         where: { id: subscription.id },
  //         data: { freemiumReminderSent: true },
  //       });
  //     }
  //   } catch (error) {
  //     this.logger.error(`?R Error en sendFreemiumReminders: ${error}`);
  //   }
  // }

  /**
   * Inicia el cron para verificar y expirar usuarios premium que cumplieron 30 días
   * Se ejecuta 2 veces al día: a medianoche (00:00) y al mediodía (12:00)
   */
  private startPremiumExpirationCron() {
    // Ejecutar a las 00:00 y 12:00 (zona horaria del servidor - Colombia)
    cron.schedule('0 0,12 * * *', async () => {
      this.logger.log('Verificando expiraciones de premium (30 dias)...');
      await this.expirePremiumSubscriptions();
    });

    this.logger.log('Scheduler de expiracion premium iniciado (medianoche y mediodia)');
  }

  /**
   * Inicia el cron para expirar planes freemium por tiempo/usos.
   * Se ejecuta 2 veces al día para mantener consistencia de métricas en admin.
   */
  private startFreemiumExpirationCron() {
    cron.schedule('30 0,12 * * *', async () => {
      this.logger.log('Verificando expiraciones de freemium...');
      await this.expireFreemiumSubscriptions();
    });

    this.logger.log('Scheduler de expiracion freemium iniciado (00:30 y 12:30)');
  }

  /**
   * Expira suscripciones FREEMIUM por:
   * - 5 días hábiles transcurridos
   * - 0 usos restantes
   */
  private async expireFreemiumSubscriptions() {
    try {
      const candidates = await this.prisma.subscription.findMany({
        where: {
          plan: 'FREEMIUM',
          OR: [
            { freemiumExpired: false },
            { status: 'ACTIVE' },
          ],
        },
      });

      if (candidates.length === 0) {
        this.logger.log('No hay suscripciones freemium para revisar');
        return;
      }

      let expiredCount = 0;
      for (const subscription of candidates) {
        const shouldExpire = shouldExpireFreemiumByPolicy({
          startDate: subscription.freemiumStartDate,
          usesLeft: subscription.freemiumUsesLeft,
          freemiumPolicy: (subscription as any).freemiumPolicy,
          freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
        });

        if (!shouldExpire) continue;

        await this.prisma.subscription.update({
          where: { userId: subscription.userId },
          data: {
            freemiumExpired: true,
            status: 'EXPIRED',
          },
        });
        expiredCount++;
      }

      this.logger.log(`Freemium expirados en esta ejecucion: ${expiredCount}/${candidates.length}`);
    } catch (error) {
      this.logger.error(`Error en expireFreemiumSubscriptions: ${error}`);
    }
  }

  /**
   * Verifica y expira suscripciones pagadas (PREMIUM y PRO) que cumplieron su período
   * - PREMIUM: 30 días
   * - PRO: 90 días
   * Maneja dos casos:
   * 1. Usuarios con premiumEndDate poblado
   * 2. Usuarios antiguos que solo tienen premiumStartDate (sin premiumEndDate)
   */
  private async expirePremiumSubscriptions() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      let totalExpired = 0;

      // CASO 1: Usuarios con premiumEndDate poblado (incluye PREMIUM y PRO)
      const expiredByEndDate = await this.prisma.subscription.findMany({
        where: {
          plan: { in: ['PREMIUM', 'PRO'] },
          status: 'ACTIVE',
          premiumEndDate: {
            not: null,
            lte: now,
          },
        },
        include: {
          user: true,
        },
      });

      this.logger.log(`${expiredByEndDate.length} usuarios (PREMIUM/PRO) con premiumEndDate vencido`);

      for (const subscription of expiredByEndDate) {
        try {
          await this.prisma.subscription.update({
            where: { userId: subscription.userId },
            data: {
              status: 'EXPIRED',
              plan: 'FREEMIUM',
              freemiumExpired: true,
            },
          });
          totalExpired++;
          this.logger.log(`Usuario ${subscription.userId} (${subscription.user?.name}) - ${subscription.plan} expirado por premiumEndDate`);
        } catch (error) {
          this.logger.error(`Error expirando usuario ${subscription.userId}: ${error}`);
        }
      }

      // CASO 2: Usuarios antiguos sin premiumEndDate pero con premiumStartDate > 30 días (solo PREMIUM antiguo)
      const expiredByStartDate = await this.prisma.subscription.findMany({
        where: {
          plan: 'PREMIUM',
          status: 'ACTIVE',
          premiumEndDate: null, // No tienen fecha de expiración
          premiumStartDate: {
            not: null,
            lte: thirtyDaysAgo, // premiumStartDate fue hace más de 30 días
          },
        },
        include: {
          user: true,
        },
      });

      this.logger.log(`${expiredByStartDate.length} usuarios PREMIUM antiguos sin premiumEndDate (30+ dias desde activacion)`);

      for (const subscription of expiredByStartDate) {
        try {
          await this.prisma.subscription.update({
            where: { userId: subscription.userId },
            data: {
              status: 'EXPIRED',
              plan: 'FREEMIUM',
              freemiumExpired: true,
            },
          });
          totalExpired++;
          this.logger.log(`Usuario ${subscription.userId} (${subscription.user?.name}) PREMIUM expirado por premiumStartDate (usuario antiguo)`);
        } catch (error) {
          this.logger.error(`Error expirando usuario ${subscription.userId}: ${error}`);
        }
      }

      if (totalExpired > 0) {
        this.logger.log(`Se expiraron ${totalExpired} usuarios (PREMIUM/PRO) en total`);
      } else {
        this.logger.log(`No hay usuarios PREMIUM/PRO para expirar en este momento`);
      }
    } catch (error) {
      this.logger.error(`Error en expirePremiumSubscriptions: ${error}`);
    }
  }

  /**
   * Revisa qué usuarios deben recibir alertas ahora y las envía
   * [MEJORADO] Procesamiento por lotes con delays para evitar rate limiting
   */
  private async checkAndSendAlerts() {
    // [FIX] Prevenir ejecuciones concurrentes (overlapping)
    if (this.isProcessing) {
      this.logger.warn('Ya hay una ejecucion en curso, saltando esta iteracion');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.log('Verificando usuarios para alertas...');

      // 1. Obtener todas las preferencias de alerta activas
      const alertPreferences = await this.prisma.alertPreference.findMany({
        where: { enabled: true },
        include: { user: true },
      });

      this.logger.log(`${alertPreferences.length} usuarios con alertas activas`);

      if (alertPreferences.length === 0) {
        this.logger.log('No hay usuarios para notificar');
        return;
      }

      // 2. Filtrar usuarios que deben recibir alerta AHORA
      const usersToNotify = alertPreferences.filter((pref: any) => this.shouldSendAlertNow(pref));

      this.logger.log(`${usersToNotify.length} usuarios deben recibir alerta ahora`);

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

        this.logger.log(`Procesando lote ${batchNumber} (${batch.length} usuarios)...`);

        // [FIX] Procesar lote en PARALELO (pero limitado por BATCH_SIZE)
        const batchPromises = batch.map(async (alertPref) => {
          try {
            await this.runJobSearchAndNotifyUser(alertPref.userId);
            return { success: true, userId: alertPref.userId };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error notificando a usuario ${alertPref.userId}: ${errorMessage}`);
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
        // Solo si no es el ?ltimo lote
        if (i + this.BATCH_SIZE < totalUsers) {
          this.logger.debug(`Esperando ${this.DELAY_BETWEEN_BATCHES_MS}ms antes del siguiente lote...`);
          await this.sleep(this.DELAY_BETWEEN_BATCHES_MS);
        }

        // [FIX] Verificar si estamos excediendo el tiempo máximo
        const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
        if (elapsedMinutes > this.MAX_PROCESSING_TIME_MINUTES) {
          this.logger.warn(`Tiempo maximo de procesamiento alcanzado (${elapsedMinutes.toFixed(1)} min). Usuarios restantes: ${totalUsers - (i + this.BATCH_SIZE)}`);
          break;
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`Alertas completadas en ${totalTime}s: ${successCount} exitosas, ${failCount} fallidas`);

      // [NUEVO] Log de advertencia si hay muchos fallos
      if (failCount > 0 && failCount / totalUsers > 0.2) {
        this.logger.warn(`Tasa de fallos alta: ${((failCount / totalUsers) * 100).toFixed(1)}% de alertas fallaron`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error critico en checkAndSendAlerts: ${errorMessage}`);
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
   * Considera: hora configurada, frecuencia, última notificación Y días hábiles
   * [MEJORADO] Ventana ampliada, mejor logging y solo días hábiles
   */
  private shouldSendAlertNow(alertPref: any): boolean {
    try {
      const now = dayjs().tz(alertPref.timezone || 'America/Bogota');
      const userId = alertPref.userId;

      // [NUEVO] Solo días hábiles (lunes=1 a viernes=5)
      const dayOfWeek = now.day(); // 0=domingo, 1=lunes, ..., 6=sábado
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        this.logger.debug(
          `Usuario ${userId}: Hoy es ${dayOfWeek === 0 ? 'domingo' : 'sabado'} -> NO ENVIAR (solo dias habiles)`,
        );
        return false;
      }

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
          `Usuario ${userId}: Fuera de ventana horaria (actual: ${currentHour}:${String(currentMinute).padStart(2, '0')}, objetivo: ${targetHour}:${String(targetMinute).padStart(2, '0')}, diff: ${minutesDiff} min) -> NO ENVIAR`,
        );
        return false;
      }

      this.logger.debug(
        `Usuario ${userId}: Dentro de ventana horaria (diff: ${minutesDiff} min desde objetivo)`,
      );

      // Si no hay última notificación, es la primera vez → enviar
      if (!alertPref.lastNotification) {
        this.logger.log(`Usuario ${userId}: Primera notificacion (${alertPref.alertFrequency}) -> ENVIAR`);
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
        `Usuario ${userId}: Ultima alerta hace ${daysSinceLastAlert.toFixed(2)} dias (${hoursSinceLastAlert}h ${minutesSinceLastAlert % 60}m)`,
      );

      // [FIX CRÍTICO] Evitar enviar múltiples veces en la misma ventana horaria
      // Si la ?ltima alerta fue hace menos de 15 minutos, NO enviar (incluso si cumple frecuencia)
      if (minutesSinceLastAlert < 15) {
        this.logger.debug(
          `Usuario ${userId}: Ya recibio alerta hace ${minutesSinceLastAlert} minutos (muy reciente) -> NO ENVIAR`,
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
          this.logger.warn(`Usuario ${userId}: Frecuencia desconocida "${alertPref.alertFrequency}", usando diario`);
          shouldSend = hoursSinceLastAlert >= 23;
      }

      // Loguear decisión para debug
      if (shouldSend) {
        this.logger.log(
          `Usuario ${userId}: Frecuencia=${alertPref.alertFrequency}, ultima alerta hace ${daysSinceLastAlert.toFixed(1)} dias (${hoursSinceLastAlert}h) -> ENVIAR`,
        );
      } else {
        this.logger.debug(
          `Usuario ${userId}: Frecuencia=${alertPref.alertFrequency}, ultima alerta hace ${daysSinceLastAlert.toFixed(1)} dias (${hoursSinceLastAlert}h) -> NO ENVIAR AUN`,
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
      this.logger.log(`Buscando empleos para usuario ${userId}...`);

      // 1. Verificar usos disponibles ANTES de buscar
      const usageCheck = await this.checkAndDeductAlertUsage(userId);

      if (!usageCheck.allowed) {
        this.logger.log(`Usuario ${userId}: ${usageCheck.reason || 'Sin usos disponibles'}`);
        // Si el plan expir?, opcionalmente notificar al usuario
        if (usageCheck.shouldNotify) {
          await this.notifyPlanExpired(userId, usageCheck.plan);
        }
        return;
      }

      // 2. Obtener datos del usuario
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // 3. Buscar empleos usando el JobSearchService
      const searchResult = await this.jobSearchService.searchJobsForUser(userId);

      if (searchResult.jobs.length === 0) {
        // No hay ofertas nuevas ?  enviar mensaje simple
        this.logger.log(`Usuario ${userId}: Sin ofertas nuevas, no se envia notificacion`);
        return;
      }

      // 4. Guardar ofertas en PendingJobAlert para que el usuario las pida después
      await this.prisma.pendingJobAlert.create({
        data: {
          userId,
          jobs: searchResult.jobs as any,
          jobCount: searchResult.jobs.length,
        },
      });

      this.logger.log(`${searchResult.jobs.length} ofertas guardadas como pendientes para ${userId}`);

      // 5. Enviar template de notificación (fuera de ventana 24h)
      const userName = getFirstName(user.name);
      const jobCount = String(searchResult.jobs.length);
      const roleName = user.profile?.role || 'tu perfil';

      await this.whatsappService.sendTemplateMessage(
        user.phone,
        'job_alert_notification',  // Nombre del template aprobado
        'es_CO',                   // Idioma
        [userName, jobCount, roleName]  // Variables: {{1}}, {{2}}, {{3}}
      );

      // 6. Actualizar lastNotification en AlertPreference  
      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: {
          lastNotification: new Date(),
          updatedAt: new Date(),
        },
      });

      // 7. Incrementar contador de templates enviados
      await this.prisma.subscription.updateMany({
        where: { userId },
        data: { templatesSentCount: { increment: 1 } },
      });

      this.logger.log(`Usuario ${userId} notificado via template con ${searchResult.jobs.length} ofertas pendientes`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error en runJobSearchAndNotifyUser para ${userId}: ${errorMessage}`);

      // [DESACTIVADO] Violación de política WhatsApp - envía mensaje proactivo sin template fuera de la ventana 24h
      // try {
      //   const user = await this.prisma.user.findUnique({
      //     where: { id: userId },
      //     select: { phone: true },
      //   });
      //   if (user) {
      //     await this.whatsappService.sendBotReply(user.phone, {
      //       text: 'Lo siento, hubo un problema temporal al buscar ofertas. Intentaré de nuevo en la próxima alerta. ⏰',
      //     });
      //   }
      // } catch (sendError) {
      //   this.logger.error('No se pudo enviar mensaje de error al usuario');
      // }

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
    plan?: 'FREEMIUM' | 'PREMIUM' | 'PRO';
    shouldNotify?: boolean;
  }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Si no tiene suscripción, no debería tener alertas activas
    if (!subscription) {
      return { allowed: false, reason: 'Sin suscripción' };
    }

    // PLAN PAGADO (PREMIUM o PRO)
    if ((subscription.plan === 'PREMIUM' || subscription.plan === 'PRO') && subscription.status === 'ACTIVE') {
      const now = new Date();

      // Verificar si el plan expir? (basado en premiumEndDate)
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
          reason: `Plan ${subscription.plan} expirado`,
          plan: subscription.plan as 'PREMIUM' | 'PRO',
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
            premiumUsesLeft: 4, // 5 - 1 que est? usando ahora
            premiumWeekStart: now, // Nueva semana empieza desde ahora
          },
        });
        return { allowed: true, usesLeft: 4, plan: subscription.plan as 'PREMIUM' | 'PRO' };
      }

      if (subscription.premiumUsesLeft > 0) {
        const newUsesLeft = subscription.premiumUsesLeft - 1;
        await this.prisma.subscription.update({
          where: { userId },
          data: { premiumUsesLeft: newUsesLeft },
        });
        return { allowed: true, usesLeft: newUsesLeft, plan: subscription.plan as 'PREMIUM' | 'PRO' };
      }

      return {
        allowed: false,
        reason: `Límite semanal  alcanzado`,
        plan: subscription.plan as 'PREMIUM' | 'PRO',
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

    if (shouldExpireFreemiumByPolicy({
      startDate: subscription.freemiumStartDate,
      usesLeft: subscription.freemiumUsesLeft,
      freemiumPolicy: (subscription as any).freemiumPolicy,
      freemiumExpiresAt: (subscription as any).freemiumExpiresAt,
    })) {
      // Marcar freemium como expirado
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          freemiumExpired: true,
          status: 'EXPIRED',
        },
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
   * Notifica al usuario que su plan expir?
   * @param expiredPlan - El plan que expir? ('PREMIUM', 'PRO' o 'FREEMIUM')
   */
  // [DESACTIVADO] Violación de política WhatsApp - envía mensajes con links de pago fuera de la ventana 24h sin template
  private async notifyPlanExpired(userId: string, expiredPlan?: 'FREEMIUM' | 'PREMIUM' | 'PRO'): Promise<void> {
    this.logger.log(`notifyPlanExpired desactivado para usuario ${userId} (plan: ${expiredPlan || 'desconocido'}). Requiere template aprobado por Meta.`);

    // Solo desactivar alertas, sin enviar mensaje proactivo
    try {
      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: { enabled: false },
      });
    } catch (error) {
      this.logger.error(`Error desactivando alertas para usuario ${userId}`);
    }
    return;

    // --- CÓDIGO ORIGINAL COMENTADO (viola política WhatsApp) ---
    /*
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, name: true },
      });

      if (!user) return;

      const isPaidPlanExpired = expiredPlan === 'PREMIUM' || expiredPlan === 'PRO';
      const planName = expiredPlan === 'PRO' ? 'Pro' : 'Premium';

      const message = isPaidPlanExpired
        ? `👋 *Hola ${getFirstName(user.name)}*

Tu *Plan ${planName}* ha finalizado.

🚀 *No frenes tu búsqueda ahora.*

*Elige tu plan para continuar:*

💳 *CIO Premium* → $20.000 COP / 30 días
🔗 ${process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ'}

⭐ *CIO Pro* → $54.000 COP / 90 días _(Mejor valor)_
🔗 ${process.env.WOMPI_CHECKOUT_LINK_PRO || 'https://checkout.wompi.co/l/3XLQMl'}

Una vez realices el pago, escríbeme por este chat para activar tu cuenta.`
        : `👋 *Hola ${getFirstName(user.name)}*

Tu período de prueba gratuita ha terminado y no puedo seguir enviándote alertas de empleo.

*Elige tu plan para continuar:*

💳 *CIO Premium* → $20.000 COP / 30 días
🔗 ${process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ'}

⭐ *CIO Pro* → $54.000 COP / 90 días _(Mejor valor)_
🔗 ${process.env.WOMPI_CHECKOUT_LINK_PRO || 'https://checkout.wompi.co/l/3XLQMl'}

Una vez realices el pago, escríbeme por este chat para activar tu cuenta.`;

      await this.whatsappService.sendBotReply(user.phone, { text: message });

      await this.prisma.alertPreference.updateMany({
        where: { userId },
        data: { enabled: false },
      });

      this.logger.log(`Usuario ${userId} notificado de expiracion de plan ${expiredPlan || 'desconocido'}`);
    } catch (error) {
      this.logger.error(`Error notificando expiracion a usuario ${userId}`);
    }
    */
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


