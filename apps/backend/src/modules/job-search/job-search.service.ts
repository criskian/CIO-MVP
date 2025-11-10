import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';
import { JobPosting, JobSearchQuery, JobSearchResult } from './types/job-posting';

/**
 * Servicio de búsqueda de empleos
 * Utiliza Google Custom Search JSON API para encontrar ofertas
 * NO contiene lógica de conversación, solo búsqueda y ranking
 */
@Injectable()
export class JobSearchService {
  private readonly logger = new Logger(JobSearchService.name);
  private readonly googleApiKey: string;
  private readonly googleCx: string;
  private readonly googleSearchUrl = 'https://www.googleapis.com/customsearch/v1';

  // Palabras excluidas de búsqueda (para filtrar ofertas no deseadas)
  private readonly excludedKeywords = [
    'call center',
    'callcenter',
    'telemarketing',
    'vendedor',
    'ventas puerta',
    'ventas de campo',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.googleApiKey = this.configService.get<string>('GOOGLE_CSE_API_KEY', '');
    this.googleCx = this.configService.get<string>('GOOGLE_CSE_CX', '');

    if (!this.googleApiKey || !this.googleCx) {
      this.logger.warn(
        '⚠️ Google CSE credentials no configuradas. Job search no funcionará correctamente.',
      );
    }
  }

  /**
   * Busca empleos para un usuario específico
   * Lee su perfil de la DB y ejecuta búsqueda
   */
  async searchJobsForUser(userId: string): Promise<JobSearchResult> {
    try {
      this.logger.log(`🔍 Iniciando búsqueda de empleos para usuario ${userId}`);

      // 1. Obtener perfil del usuario
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
      });

      if (!profile || !profile.role) {
        throw new Error('Usuario no tiene perfil configurado');
      }

      // 2. Construir query de búsqueda
      const searchQuery: JobSearchQuery = {
        role: profile.role,
        location: profile.location || undefined,
        jobType: profile.jobType || undefined,
        minSalary: profile.minSalary || undefined,
        remoteAllowed: profile.remoteAllowed || false,
      };

      // 3. Ejecutar búsqueda
      const result = await this.searchJobs(searchQuery);

      // 4. Registrar en log
      await this.logSearch(userId, result);

      // 5. Filtrar ofertas ya enviadas
      const filteredJobs = await this.filterAlreadySentJobs(userId, result.jobs);

      this.logger.log(
        `✅ Búsqueda completada: ${filteredJobs.length} ofertas nuevas de ${result.total} totales`,
      );

      return {
        ...result,
        jobs: filteredJobs.slice(0, 5), // Máximo 5 ofertas
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error en búsqueda de empleos: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Ejecuta búsqueda en Google Custom Search API
   */
  private async searchJobs(query: JobSearchQuery): Promise<JobSearchResult> {
    try {
      // Construir query string
      const queryString = this.buildQueryString(query);

      this.logger.debug(`🔎 Query Google CSE: "${queryString}"`);

      // Llamar a Google CSE API
      const response = await axios.get(this.googleSearchUrl, {
        params: {
          key: this.googleApiKey,
          cx: this.googleCx,
          q: queryString,
          num: 10, // Pedir 10 resultados
          lr: 'lang_es', // Idioma español
          gl: 'co', // Geolocalización Colombia
        },
        timeout: 10000, // 10 segundos timeout
      });

      // Normalizar resultados
      const items = response.data.items || [];
      const jobs = items.map((item: any) => this.normalizeGoogleResult(item));

      // Aplicar filtrado y ranking
      const filteredJobs = this.filterJobs(jobs, query);
      const rankedJobs = this.rankJobs(filteredJobs, query);

      return {
        jobs: rankedJobs,
        total: rankedJobs.length,
        query: queryString,
        executedAt: new Date(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Error llamando Google CSE API: ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`,
        );
      }
      throw new Error(
        'No pude buscar ofertas en este momento. Por favor intenta de nuevo más tarde.',
      );
    }
  }

  /**
   * Construye el query string para Google CSE
   */
  private buildQueryString(query: JobSearchQuery): string {
    const parts: string[] = [];

    // Rol/cargo (obligatorio)
    parts.push(query.role);

    // Añadir "empleo", "trabajo", "vacante"
    parts.push('(empleo OR trabajo OR vacante)');

    // Ubicación
    if (query.location && !query.remoteAllowed) {
      parts.push(query.location);
    }

    // Si es remoto
    if (query.remoteAllowed) {
      parts.push('(remoto OR "trabajo remoto" OR "desde casa")');
    }

    // Tipo de jornada
    if (query.jobType) {
      const jobTypeMap: Record<string, string> = {
        full_time: '"tiempo completo"',
        part_time: '"medio tiempo"',
        internship: '(pasantía OR práctica)',
        freelance: 'freelance',
      };
      if (jobTypeMap[query.jobType]) {
        parts.push(jobTypeMap[query.jobType]);
      }
    }

    // Colombia (para enfocar resultados)
    parts.push('Colombia');

    // Construir query final
    return parts.join(' ');
  }

  /**
   * Normaliza un resultado de Google CSE al formato JobPosting
   */
  private normalizeGoogleResult(item: any): JobPosting {
    // Extraer dominio de la URL
    const source = this.extractDomain(item.link);

    // Intentar extraer información estructurada si existe
    const company = this.extractCompanyName(item);
    const locationRaw = this.extractLocation(item);
    const salaryRaw = this.extractSalary(item);

    return {
      title: item.title || 'Sin título',
      url: item.link,
      source,
      snippet: item.snippet || '',
      company,
      locationRaw,
      salaryRaw,
    };
  }

  /**
   * Extrae el dominio de una URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'desconocido';
    }
  }

  /**
   * Intenta extraer el nombre de la empresa del resultado
   */
  private extractCompanyName(item: any): string | undefined {
    // Buscar en metadata estructurada si existe
    if (item.pagemap?.metatags?.[0]?.['og:site_name']) {
      return item.pagemap.metatags[0]['og:site_name'];
    }

    // Intentar extraer del snippet
    const match = item.snippet?.match(/empresa:?\s*([A-Za-z0-9\s]+)/i);
    if (match) {
      return match[1].trim();
    }

    return undefined;
  }

  /**
   * Intenta extraer la ubicación del resultado
   */
  private extractLocation(item: any): string | undefined {
    // Buscar en el snippet
    const cities = [
      'Bogotá',
      'Medellín',
      'Cali',
      'Barranquilla',
      'Cartagena',
      'Cúcuta',
      'Bucaramanga',
      'Pereira',
      'Manizales',
      'Ibagué',
    ];

    for (const city of cities) {
      if (item.snippet?.includes(city) || item.title?.includes(city)) {
        return city;
      }
    }

    // Buscar "remoto"
    if (
      item.snippet?.toLowerCase().includes('remoto') ||
      item.title?.toLowerCase().includes('remoto')
    ) {
      return 'Remoto';
    }

    return undefined;
  }

  /**
   * Intenta extraer el salario del resultado
   */
  private extractSalary(item: any): string | undefined {
    // Buscar patrones de salario en el snippet
    const salaryPatterns = [
      /\$\s*[\d,.]+(\.000)?/g, // $2.500.000
      /[\d,.]+ millones?/gi, // 2.5 millones
      /salario:?\s*\$?[\d,.]+/gi, // Salario: $2500000
    ];

    for (const pattern of salaryPatterns) {
      const match = item.snippet?.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  /**
   * Filtra ofertas no deseadas
   */
  private filterJobs(jobs: JobPosting[], query: JobSearchQuery): JobPosting[] {
    return jobs.filter((job) => {
      // Filtrar por palabras excluidas
      const textToCheck = `${job.title} ${job.snippet}`.toLowerCase();
      for (const keyword of this.excludedKeywords) {
        if (textToCheck.includes(keyword)) {
          this.logger.debug(`🚫 Oferta excluida por keyword "${keyword}": ${job.title}`);
          return false;
        }
      }

      // Filtrar por salario mínimo si está presente
      if (query.minSalary && job.salaryRaw) {
        const extractedSalary = this.extractSalaryNumber(job.salaryRaw);
        if (extractedSalary && extractedSalary < query.minSalary) {
          this.logger.debug(
            `🚫 Oferta excluida por salario bajo (${extractedSalary} < ${query.minSalary}): ${job.title}`,
          );
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Extrae el número de salario de un string
   */
  private extractSalaryNumber(salaryStr: string): number | null {
    // Remover símbolos y convertir
    const cleaned = salaryStr.replace(/[$.,']/g, '').trim();

    // Si dice "millones"
    if (salaryStr.toLowerCase().includes('millon')) {
      const match = cleaned.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]) * 1000000;
      }
    }

    // Número directo
    const match = cleaned.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  /**
   * Rankea ofertas por relevancia
   */
  private rankJobs(jobs: JobPosting[], query: JobSearchQuery): JobPosting[] {
    // Calcular score para cada oferta
    const jobsWithScore = jobs.map((job) => ({
      ...job,
      score: this.calculateJobScore(job, query),
    }));

    // Ordenar por score descendente
    jobsWithScore.sort((a, b) => (b.score || 0) - (a.score || 0));

    return jobsWithScore;
  }

  /**
   * Calcula el score de relevancia de una oferta
   */
  private calculateJobScore(job: JobPosting, query: JobSearchQuery): number {
    let score = 0;

    const titleLower = job.title.toLowerCase();
    const snippetLower = job.snippet.toLowerCase();
    const roleLower = query.role.toLowerCase();

    // +10 puntos si el rol aparece en el título
    if (titleLower.includes(roleLower)) {
      score += 10;
    }

    // +5 puntos si el rol aparece en el snippet
    if (snippetLower.includes(roleLower)) {
      score += 5;
    }

    // +8 puntos si la ubicación coincide
    if (query.location && job.locationRaw) {
      if (job.locationRaw.toLowerCase().includes(query.location.toLowerCase())) {
        score += 8;
      }
    }

    // +5 puntos si es remoto y el usuario lo permite
    if (query.remoteAllowed && job.locationRaw?.toLowerCase().includes('remoto')) {
      score += 5;
    }

    // +3 puntos si tiene salario visible
    if (job.salaryRaw) {
      score += 3;
    }

    // +2 puntos si tiene empresa identificada
    if (job.company) {
      score += 2;
    }

    // +5 puntos por fuentes confiables
    const trustedSources = [
      'linkedin.com',
      'elempleo.com',
      'computrabajo.com',
      'magneto365.com',
    ];
    if (trustedSources.some((source) => job.source.includes(source))) {
      score += 5;
    }

    return score;
  }

  /**
   * Filtra ofertas que ya fueron enviadas al usuario
   */
  private async filterAlreadySentJobs(
    userId: string,
    jobs: JobPosting[],
  ): Promise<JobPosting[]> {
    try {
      // Obtener URLs de ofertas ya enviadas
      const sentJobs = await this.prisma.sentJob.findMany({
        where: { userId },
        select: { url: true },
      });

      const sentUrls = new Set(sentJobs.map((job) => job.url));

      // Filtrar ofertas ya enviadas
      return jobs.filter((job) => !sentUrls.has(job.url));
    } catch (error) {
      this.logger.warn('No se pudo filtrar ofertas ya enviadas, devolviendo todas');
      return jobs;
    }
  }

  /**
   * Registra la búsqueda en el log
   */
  private async logSearch(userId: string, result: JobSearchResult): Promise<void> {
    try {
      await this.prisma.jobSearchLog.create({
        data: {
          userId,
          query: result.query,
          resultCount: result.total,
          success: true,
        },
      });
    } catch (error) {
      this.logger.warn('No se pudo registrar búsqueda en log');
    }
  }

  /**
   * Marca ofertas como enviadas al usuario
   */
  async markJobsAsSent(userId: string, jobs: JobPosting[]): Promise<void> {
    try {
      await this.prisma.sentJob.createMany({
        data: jobs.map((job) => ({
          userId,
          url: job.url,
          title: job.title,
          company: job.company || 'Sin especificar',
        })),
        skipDuplicates: true, // Por si acaso
      });

      this.logger.debug(`✅ ${jobs.length} ofertas marcadas como enviadas`);
    } catch (error) {
      this.logger.warn('No se pudieron marcar ofertas como enviadas');
    }
  }

  /**
   * Formatea ofertas para enviar por WhatsApp
   */
  formatJobsForWhatsApp(jobs: JobPosting[]): string {
    if (jobs.length === 0) {
      return `No encontré ofertas que coincidan con tu perfil en este momento. 😔

Intenta de nuevo más tarde o ajusta tus preferencias.`;
    }

    const header = `🎯 *Encontré ${jobs.length} ${jobs.length === 1 ? 'oferta' : 'ofertas'} para ti:*\n\n`;

    const jobsText = jobs
      .map((job, index) => {
        let text = `*${index + 1}. ${job.title}*\n`;

        if (job.company) {
          text += `🏢 ${job.company}\n`;
        }

        if (job.locationRaw) {
          text += `📍 ${job.locationRaw}\n`;
        }

        if (job.salaryRaw) {
          text += `💰 ${job.salaryRaw}\n`;
        }

        text += `🔗 ${job.url}\n`;

        return text;
      })
      .join('\n');

    const footer = `\n_Tip: Click en los enlaces para ver más detalles y aplicar._ 🚀`;

    return header + jobsText + footer;
  }
}
