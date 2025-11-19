import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Procesa un CV desde una URL de WhatsApp
   * Por ahora es un stub
   */
  async processCvFromUrl(userId: string, mediaUrl: string): Promise<void> {
    // TODO: Implementar
    // 1. Descargar el archivo
    // 2. Subirlo a storage
    // 3. Llamar al microservicio Python para parsing
    // 4. Actualizar UserProfile con los datos extraídos

    this.logger.log(`Procesando CV para usuario ${userId} desde ${mediaUrl}`);
  }
}
