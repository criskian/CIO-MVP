import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';

/**
 * Tipo para representar una oferta de empleo
 */
export interface JobPosting {
  title: string;
  url: string;
  source: string; // dominio
  company?: string;
  locationRaw?: string;
  salaryRaw?: string;
  publishedAt?: Date;
}

@Injectable()
export class JobSearchService {
  private readonly logger = new Logger(JobSearchService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Busca empleos para un usuario usando Google Custom Search
   */
  async searchJobsForUser(userId: string): Promise<JobPosting[]> {
    // TODO: Implementar búsqueda con Google Custom Search JSON API
    this.logger.log(`Buscando empleos para usuario ${userId}`);

    return [];
  }

  /**
   * Calcula un score para una oferta según el perfil del usuario
   */
  private scoreJob(job: JobPosting, profile: any): number {
    // TODO: Implementar lógica de scoring
    return 0;
  }
}

