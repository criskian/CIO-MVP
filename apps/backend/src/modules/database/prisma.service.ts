import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Configuración para reducir el uso de conexiones
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Base de datos conectada');
    
    // Configurar para liberar conexiones más rápido
    this.$on('beforeExit' as never, async () => {
      this.logger.log('🔌 Desconectando Prisma...');
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Base de datos desconectada');
  }

  // Método helper para usar en transacciones largas
  async cleanupIdleConnections() {
    await this.$disconnect();
    await this.$connect();
    this.logger.debug('♻️ Conexiones de BD recicladas');
  }
}
