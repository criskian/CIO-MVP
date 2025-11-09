import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as cron from 'node-cron';
// TODO: Importar JobSearchService y WhatsappService

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    // private readonly jobSearchService: JobSearchService,
    // private readonly whatsappService: WhatsappService,
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
      this.logger.log('Ejecutando tarea de alertas de empleo...');
      await this.checkAndSendAlerts();
    });

    this.logger.log('✅ Scheduler de alertas iniciado (cada 5 minutos)');
  }

  /**
   * Revisa qué usuarios deben recibir alertas ahora y las envía
   */
  private async checkAndSendAlerts() {
    // TODO: Implementar lógica
    this.logger.log('Verificando usuarios para alertas...');
  }
}

