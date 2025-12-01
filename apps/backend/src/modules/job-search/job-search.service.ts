import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';
import { JobPosting, JobSearchQuery, JobSearchResult } from './types/job-posting';
import { getExperienceKeywords } from '../conversation/helpers/input-validators';
import { ExperienceLevel } from '../conversation/types/conversation-states';

/**
 * Servicio de búsqueda de empleos
 * Utiliza SerpApi Google Jobs API para acceder al panel de "Google for Jobs"
 * NO contiene lógica de conversación, solo búsqueda y ranking
 */
@Injectable()
export class JobSearchService {
  private readonly logger = new Logger(JobSearchService.name);
  private readonly serpApiKey: string;
  private readonly serpApiUrl = 'https://serpapi.com/search'; // SerpApi endpoint

  // Palabras excluidas de búsqueda (para filtrar ofertas no deseadas)
  private readonly excludedKeywords = [
    'call center',
    'callcenter',
    'telemarketing',
    'vendedor',
    'ventas puerta',
    'ventas de campo',
  ];

  // Portales de empleo NO confiables (se excluyen completamente)
  private readonly excludedSources = [
    'bebee.com',
    'jobrapido.com',
    'jooble.com',
    'jobleads.com',
    'trabajozy.com',
    'cazvid.com',
  ];

  // Portales de empleo confiables (se priorizan en el scoring)
  private readonly trustedSources = [
    'magneto365.com',
    'magneto.com.co',
    'elempleo.com',
    'indeed.com',
    'computrabajo.com',
    'linkedin.com',
  ];

  // Patrones de URL que indican páginas de búsqueda o listados múltiples (NO ofertas individuales)
  private readonly searchUrlPatterns = [
    '/search',
    '/buscar',
    '/busqueda',
    '/search-jobs',
    '/empleos/buscar',
    '/ofertas-empleo/buscar',
    '/vacantes/buscar',
    '?q=',
    '?search=',
    '?buscar=',
    '?keyword=',
    '/jobs/search',
    '/q-', // Indeed pattern: /q-keyword-empleos
    'facebook.com/groups', // Facebook groups
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.serpApiKey = this.configService.get<string>('SERPAPI_API_KEY', '');

    if (!this.serpApiKey) {
      this.logger.warn(
        '⚠️ SerpApi API Key no configurada. Job search no funcionará correctamente.',
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
      const experienceKeywords = profile.experienceLevel
        ? getExperienceKeywords(profile.experienceLevel as ExperienceLevel)
        : undefined;

      const searchQuery: JobSearchQuery = {
        role: profile.role,
        location: profile.location || undefined,
        jobType: profile.jobType || undefined,
        minSalary: profile.minSalary || undefined,
        workMode: profile.workMode || undefined,
        experienceKeywords,
      };

      // 3. Ejecutar búsqueda principal
      const result = await this.searchJobs(searchQuery);
      let allJobs = [...result.jobs];

      // ========================================
      // BÚSQUEDA ADICIONAL SIN FILTRO DE MODALIDAD - COMENTADO TEMPORALMENTE
      // Esta lógica complementaba el filtro de modalidad. Como el filtro de modalidad
      // está desactivado, esta búsqueda adicional no es necesaria.
      // Descomentar junto con el filtro de modalidad en buildQueryString()
      // ========================================
      // if (
      //   profile.workMode &&
      //   profile.workMode !== 'sin_preferencia' &&
      //   allJobs.length < 3 &&
      //   profile.location
      // ) {
      //   this.logger.log(
      //     `📍 Pocas ofertas con modalidad "${profile.workMode}" (${allJobs.length}), buscando sin filtro de modalidad...`,
      //   );
      //
      //   // Buscar sin especificar modalidad (todas las modalidades)
      //   const generalQuery: JobSearchQuery = {
      //     ...searchQuery,
      //     workMode: undefined, // Sin filtro de modalidad
      //   };
      //
      //   const generalResult = await this.searchJobs(generalQuery);
      //
      //   // Agregar solo las ofertas que no estén ya en la lista
      //   const existingUrls = new Set(allJobs.map((j) => j.url));
      //   const newJobs = generalResult.jobs.filter((j) => !existingUrls.has(j.url));
      //   allJobs = [...allJobs, ...newJobs];
      //
      //   this.logger.log(
      //     `✅ Se agregaron ${newJobs.length} ofertas adicionales. Total: ${allJobs.length}`,
      //   );
      // }

      // 4. Registrar en log
      await this.logSearch(userId, {
        ...result,
        jobs: allJobs,
        total: allJobs.length,
      });

      // 5. Filtrar ofertas ya enviadas
      const filteredJobs = await this.filterAlreadySentJobs(userId, allJobs);

      this.logger.log(
        `✅ Búsqueda completada: ${filteredJobs.length} ofertas nuevas de ${allJobs.length} totales`,
      );

      return {
        ...result,
        jobs: filteredJobs.slice(0, 5), // Máximo 5 ofertas
        total: allJobs.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error en búsqueda de empleos: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Ejecuta búsqueda en SerpApi con Google Jobs API
   */
  private async searchJobs(query: JobSearchQuery): Promise<JobSearchResult> {
    try {
      // Construir query string
      const queryString = this.buildQueryString(query);

      this.logger.debug(`🔎 Query SerpApi Google Jobs: "${queryString}"`);

      // Determinar ubicación para SerpApi
      // Si es "Remoto", usar "Colombia" como ubicación base
      const normalizedLocation =
        query.location?.toLowerCase() === 'remoto' ? 'Colombia' : query.location || 'Colombia';

      // Llamar a SerpApi con engine=google_jobs (método GET según documentación)
      const response = await axios.get(this.serpApiUrl, {
        params: {
          engine: 'google_jobs', // Parámetro requerido para usar Google Jobs API
          q: queryString,
          location: normalizedLocation,
          gl: 'co', // Country code: Colombia
          hl: 'es', // Language: español
          api_key: this.serpApiKey,
          num: 20, // Número de resultados (máx 10 por página en SerpApi)
        },
        timeout: 15000, // 15 segundos timeout
      });

      // Debug: Ver respuesta completa de SerpApi
      this.logger.debug(`📊 Respuesta de SerpApi:`, JSON.stringify(response.data, null, 2));

      // Normalizar resultados desde SerpApi
      // SerpApi devuelve datos estructurados en response.data.jobs_results
      const jobsData = response.data.jobs_results || [];

      this.logger.debug(`📊 SerpApi Google Jobs devolvió ${jobsData.length} resultados crudos`);

      const jobs = jobsData.map((item: any) => this.normalizeSerpApiJobResult(item));

      this.logger.debug(`📊 Después de normalizar: ${jobs.length} ofertas`);

      // Aplicar filtrado y ranking
      const filteredJobs = this.filterJobs(jobs, query);
      const rankedJobs = this.rankJobs(filteredJobs, query);

      this.logger.log(`✅ Después de filtrar: ${rankedJobs.length} ofertas válidas`);

      // Eliminar duplicados (misma empresa + mismo rol en diferentes portales)
      const uniqueJobs = this.removeDuplicateJobs(rankedJobs);

      this.logger.log(`✅ Después de eliminar duplicados: ${uniqueJobs.length} ofertas únicas`);

      // Si no hay resultados y el rol tiene múltiples palabras, intentar búsqueda más amplia
      if (uniqueJobs.length === 0 && query.role.split(' ').length > 1) {
        this.logger.log(
          `🔄 No se encontraron resultados con "${query.role}". Intentando búsqueda más amplia...`,
        );

        // Obtener la primera palabra del rol (ej: "diseñador UI" -> "diseñador")
        const broadRole = query.role.split(' ')[0];
        const broadQuery = { ...query, role: broadRole };

        return await this.searchJobs(broadQuery);
      }

      return {
        jobs: uniqueJobs,
        total: uniqueJobs.length,
        query: queryString,
        executedAt: new Date(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Error llamando SerpApi: ${error.response?.status} - ${error.response?.data?.error || error.message}`,
        );
        if (error.response?.data) {
          this.logger.error(`Respuesta completa: ${JSON.stringify(error.response.data, null, 2)}`);
        }
      }
      throw new Error(
        'No pude buscar ofertas en este momento. Por favor intenta de nuevo más tarde.',
      );
    }
  }

  /**
   * Construye el query string para SerpApi Google Jobs
   * Formato simple para Google Jobs API
   */
  private buildQueryString(query: JobSearchQuery): string {
    const parts: string[] = [];

    // Rol/cargo (obligatorio) - SIN comillas para ser menos restrictivo
    parts.push(query.role);

    // Ubicación (ya se pasa como parámetro separado en location)
    // No la incluimos en el query para evitar redundancia

    // ========================================
    // FILTRO DE MODALIDAD DE TRABAJO - COMENTADO TEMPORALMENTE
    // Descomentar para volver a activar el filtro por modalidad (remoto/híbrido/presencial)
    // ========================================
    // if (query.workMode) {
    //   if (query.workMode === 'remoto') {
    //     parts.push('remoto');
    //   } else if (query.workMode === 'hibrido') {
    //     parts.push('híbrido');
    //   } else if (query.workMode === 'presencial') {
    //     parts.push('presencial');
    //   }
    //   // Si es 'sin_preferencia', no agregar nada (buscar todas)
    // }

    // Tipo de jornada (simplificado)
    if (query.jobType) {
      const jobTypeMap: Record<string, string> = {
        full_time: 'tiempo completo',
        part_time: 'medio tiempo',
        internship: 'pasantía',
        freelance: 'freelance',
      };
      if (jobTypeMap[query.jobType]) {
        parts.push(jobTypeMap[query.jobType]);
      }
    }

    // Construir query final (más simple y menos restrictivo)
    return parts.join(' ');
  }

  /**
   * Normaliza un resultado de SerpApi Google Jobs API
   * Según documentación: jobs_results contiene datos estructurados completos
   */
  private normalizeSerpApiJobResult(item: any): JobPosting {
    // Extraer URL de aplicación desde apply_options (primer elemento)
    let url = '';
    if (item.apply_options && Array.isArray(item.apply_options) && item.apply_options.length > 0) {
      url = item.apply_options[0].link || '';
    }

    // Si no hay apply_options, usar share_link o cualquier otro link disponible
    if (!url) {
      url = item.share_link || item.link || '';
    }

    const source = this.extractDomain(url);

    // Extraer información directamente de los campos estructurados de SerpApi
    const company = item.company_name || undefined;
    const locationRaw = item.location || undefined;

    // Salario y tipo de empleo: pueden venir en detected_extensions
    let salaryRaw: string | undefined;
    let jobTypeRaw: string | undefined;

    if (item.detected_extensions) {
      // Buscar salario en detected_extensions
      if (item.detected_extensions.salary) {
        salaryRaw = item.detected_extensions.salary;
      }

      // Buscar tipo de empleo en schedule_type
      if (item.detected_extensions.schedule_type) {
        const schedule = item.detected_extensions.schedule_type;
        // Si schedule_type contiene salario, no es el tipo de empleo
        if (schedule && !(schedule.includes('$') || schedule.toLowerCase().includes('cop'))) {
          jobTypeRaw = schedule;
        } else if (schedule && (schedule.includes('$') || schedule.toLowerCase().includes('cop'))) {
          // A veces el salario viene en schedule_type
          salaryRaw = schedule;
        }
      }
    }

    // Fecha de publicación: puede venir en detected_extensions.posted_at
    let postedAtRaw: string | undefined;
    if (item.detected_extensions?.posted_at) {
      postedAtRaw = item.detected_extensions.posted_at;
    }

    // Intentar parsear la fecha a Date
    const publishedAt = postedAtRaw ? this.parsePostedAtDate(postedAtRaw) : undefined;

    return {
      title: item.title || 'Sin título',
      url: url,
      source,
      snippet: item.description || '',
      company,
      locationRaw,
      salaryRaw,
      jobTypeRaw,
      postedAtRaw,
      publishedAt,
    };
  }

  /**
   * Normaliza un resultado de Serper Search (búsqueda web regular)
   * NOTA: Este método ya no se usa, pero se mantiene por si acaso
   */
  private normalizeSerperResult(item: any): JobPosting {
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
      // 1. FILTRAR URLs DE BÚSQUEDA O LISTADOS MÚLTIPLES
      if (this.isSearchOrListingUrl(job)) {
        this.logger.debug(`🚫 URL de búsqueda/listado excluida: ${job.url}`);
        return false;
      }

      // 2. FILTRAR PORTALES NO CONFIABLES
      for (const excludedSource of this.excludedSources) {
        if (job.source.includes(excludedSource)) {
          this.logger.debug(`🚫 Portal no confiable excluido: ${job.title} (${job.source})`);
          return false;
        }
      }

      // 3. Filtrar por palabras excluidas
      const textToCheck = `${job.title} ${job.snippet}`.toLowerCase();
      for (const keyword of this.excludedKeywords) {
        if (textToCheck.includes(keyword)) {
          this.logger.debug(`🚫 Oferta excluida por keyword "${keyword}": ${job.title}`);
          return false;
        }
      }

      // 4. Filtrar títulos que indican listados múltiples
      if (this.isMultipleJobListing(job)) {
        this.logger.debug(`🚫 Listado múltiple excluido: ${job.title}`);
        return false;
      }

      // 5. Filtrar por salario mínimo si está presente
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
   * Detecta si una URL es de búsqueda o listado (NO oferta individual)
   */
  private isSearchOrListingUrl(job: JobPosting): boolean {
    const urlLower = job.url.toLowerCase();

    // Verificar patrones de URL de búsqueda
    for (const pattern of this.searchUrlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // URLs que terminan en categorías generales sin ID
    const genericEndings = ['/empleos', '/trabajos', '/ofertas', '/vacantes', '/jobs'];

    for (const ending of genericEndings) {
      // Si termina EXACTAMENTE con la categoría (sin nada después), es un listado
      if (urlLower.endsWith(ending) || urlLower.endsWith(ending + '/')) {
        return true;
      }
    }

    // CASO ESPECIAL: Indeed - Filtrar solo búsquedas obvias
    if (urlLower.includes('indeed.com')) {
      // Excluir URLs con patrón de búsqueda: /q-keyword-empleos.html
      if (urlLower.match(/\/q-.+-empleos\.html?/)) {
        this.logger.debug(`🚫 Indeed: Búsqueda detectada: ${job.url}`);
        return true;
      }
    }

    // CASO ESPECIAL: elempleo.com - Filtrar rutas de búsqueda específicas
    if (urlLower.includes('elempleo.com')) {
      // Excluir: /ofertas-empleo/trabajo-* (son búsquedas)
      if (urlLower.includes('/ofertas-empleo/trabajo-')) {
        this.logger.debug(`🚫 ElEmpleo: Ruta de búsqueda: ${job.url}`);
        return true;
      }
    }

    // CASO ESPECIAL: computrabajo.com - Filtrar búsquedas
    if (urlLower.includes('computrabajo.com')) {
      // Excluir: /trabajo-de-* (son búsquedas genéricas con hash)
      // Permitir: /ofertas-de-trabajo/oferta-de-trabajo-de-* (ofertas individuales)
      if (
        urlLower.includes('/trabajo-de-') &&
        !urlLower.includes('/ofertas-de-trabajo/oferta-de-trabajo-de-')
      ) {
        this.logger.debug(`🚫 Computrabajo: Búsqueda genérica: ${job.url}`);
        return true;
      }
    }

    // CASO ESPECIAL: linkedin.com - Solo permitir ofertas individuales
    if (urlLower.includes('linkedin.com')) {
      // Solo permitir: /jobs/view/* (ofertas individuales con ID)
      if (!urlLower.includes('/jobs/view/')) {
        this.logger.debug(`🚫 LinkedIn: No es una oferta individual: ${job.url}`);
        return true;
      }
    }

    // CASO ESPECIAL: Grupos de Facebook
    if (urlLower.includes('facebook.com/groups')) {
      this.logger.debug(`🚫 Grupo de Facebook excluido: ${job.url}`);
      return true;
    }

    // CASO ESPECIAL: Páginas genéricas de careers SIN oferta específica
    if (urlLower.match(/\/careers?\/?$/)) {
      this.logger.debug(`🚫 Página genérica de careers: ${job.url}`);
      return true;
    }

    return false;
  }

  /**
   * Detecta si el título/snippet indica un listado múltiple
   */
  private isMultipleJobListing(job: JobPosting): boolean {
    const textToCheck = `${job.title} ${job.snippet}`.toLowerCase();

    const multipleListingPatterns = [
      /\d+\s*(ofertas?|empleos?|trabajos?|vacantes?)/i, // "174 ofertas", "50 empleos"
      /ver\s+(todas?|más)\s+(ofertas?|empleos?)/i, // "Ver todas las ofertas"
      /encuentra\s+\d+/i, // "Encuentra 100 ofertas"
      /listado\s+de/i, // "Listado de empleos"
      /bolsa\s+de\s+(empleo|trabajo)/i, // "Bolsa de empleo"
    ];

    return multipleListingPatterns.some((pattern) => pattern.test(textToCheck));
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
    const urlLower = job.url.toLowerCase();

    // +15 puntos si el rol completo aparece en el título (match exacto)
    if (titleLower.includes(roleLower)) {
      score += 15;
    } else {
      // +10 puntos si al menos la primera palabra del rol aparece
      const firstWord = roleLower.split(' ')[0];
      if (titleLower.includes(firstWord)) {
        score += 10;
      }
    }

    // +7 puntos si el rol completo aparece en el snippet
    if (snippetLower.includes(roleLower)) {
      score += 7;
    } else {
      // +3 puntos si al menos la primera palabra del rol aparece
      const firstWord = roleLower.split(' ')[0];
      if (snippetLower.includes(firstWord)) {
        score += 3;
      }
    }

    // +5 puntos extra si todas las palabras del rol aparecen (aunque no juntas)
    const roleWords = roleLower.split(' ').filter((w) => w.length > 2);
    if (roleWords.length > 1) {
      const allWordsPresent = roleWords.every(
        (word) => titleLower.includes(word) || snippetLower.includes(word),
      );
      if (allWordsPresent) {
        score += 5;
      }
    }

    // +8 puntos si la ubicación coincide
    if (query.location && job.locationRaw) {
      if (job.locationRaw.toLowerCase().includes(query.location.toLowerCase())) {
        score += 8;
      }
    }

    // +5 puntos si el tipo de empleo coincide
    if (query.jobType && job.jobTypeRaw) {
      const normalizedJobType = this.normalizeJobType(job.jobTypeRaw);
      if (normalizedJobType === query.jobType) {
        score += 5;
      }
    }

    // Nota: La modalidad de trabajo (remoto/presencial/híbrido) se usa solo como
    // filtro de palabras clave en el query, NO como atributo estructurado porque
    // Google Jobs no devuelve este campo directamente. El filtrado se hace por keyword
    // en el buildQueryString() y SerpAPI lo procesa en la búsqueda.

    // +7 puntos si el nivel de experiencia coincide (prioriza, pero no filtra)
    if (query.experienceKeywords && query.experienceKeywords.length > 0) {
      const hasExperienceMatch = query.experienceKeywords.some(
        (keyword) =>
          titleLower.includes(keyword.toLowerCase()) ||
          snippetLower.includes(keyword.toLowerCase()),
      );
      if (hasExperienceMatch) {
        score += 7;
      }
    }

    // +3 puntos si tiene salario visible
    if (job.salaryRaw) {
      score += 3;
    }

    // +2 puntos si tiene empresa identificada
    if (job.company) {
      score += 2;
    }

    // +5 puntos por fuentes confiables (priorizadas)
    if (this.trustedSources.some((source) => job.source.includes(source))) {
      score += 5;
    }

    // +10 puntos EXTRA si la URL parece ser de una oferta individual
    if (this.looksLikeIndividualJob(urlLower)) {
      score += 10;
    }

    // Puntos por antigüedad de la oferta (favorece ofertas recientes sin opacar concordancia)
    const ageDays = this.getJobAgeDays(job);
    if (ageDays !== null) {
      if (ageDays <= 7) {
        score += 6; // Muy reciente (última semana)
      } else if (ageDays <= 15) {
        score += 4; // Reciente (últimas 2 semanas)
      } else if (ageDays <= 30) {
        score += 2; // Relativamente reciente (último mes)
      }
      // Si es mayor a 30 días, no suma puntos pero tampoco resta
    }

    // -5 puntos si el título es muy genérico o corto (probable listado)
    if (titleLower.length < 20) {
      score -= 5;
    }

    return score;
  }

  /**
   * Detecta si una URL parece ser de una oferta individual
   * URLs individuales suelen tener IDs, slugs largos, o títulos específicos
   */
  private looksLikeIndividualJob(urlLower: string): boolean {
    // Patrones que indican oferta individual
    const individualJobPatterns = [
      /\/\d{5,}/, // ID numérico largo (/12345, /567890)
      /\/viewjob\?/, // Indeed: /viewjob?jk=123456
      /\/company\//, // Indeed: /company/nombre/jobs/123
      /\/oferta\/\d+/, // ElEmpleo: /oferta/123456
      /\/job\/\d+/, // Generic: /job/123456
      /\/jobs\/view\//, // LinkedIn: /jobs/view/...
      /\/ofertas-de-trabajo\/oferta-de-trabajo-de-/, // Computrabajo: /ofertas-de-trabajo/oferta-de-trabajo-de-...
      /\/empleo\/[a-z0-9-]{15,}/, // Slug muy largo después de /empleo/
      /\/vacante\/[a-z0-9-]{15,}/, // Slug muy largo después de /vacante/
      /\/ver-oferta/, // Vista de oferta específica
      /\/detalle\/[a-z0-9-]{10,}/, // Página de detalle con slug
      /-\d{5,}($|\?)/, // Termina con ID numérico largo (-12345)
      /\/aplicar\/\d+/, // Página de aplicación con ID
      /\/postularse/, // Página de postulación
    ];

    return individualJobPatterns.some((pattern) => pattern.test(urlLower));
  }

  /**
   * Filtra ofertas que ya fueron enviadas al usuario
   */
  private async filterAlreadySentJobs(userId: string, jobs: JobPosting[]): Promise<JobPosting[]> {
    try {
      // Obtener URLs de ofertas ya enviadas
      const sentJobs = await this.prisma.sentJob.findMany({
        where: { userId },
        select: { url: true },
      });

      const sentUrls = new Set(sentJobs.map((job: { url: string }) => job.url));

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
   * Normaliza texto para comparación (elimina acentos, minúsculas, espacios extra)
   */
  private normalizeTextForComparison(text: string): string {
    if (!text) return '';

    return text
      .toLowerCase()
      .normalize('NFD') // Descomponer caracteres con acento
      .replace(/[\u0300-\u036f]/g, '') // Eliminar marcas diacríticas
      .replace(/[^\w\s]/g, '') // Eliminar caracteres especiales
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim();
  }

  /**
   * Calcula similitud entre dos strings (Jaccard similarity basado en palabras)
   * Retorna un valor entre 0 (totalmente diferente) y 1 (idéntico)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.normalizeTextForComparison(text1).split(' '));
    const words2 = new Set(this.normalizeTextForComparison(text2).split(' '));

    // Calcular intersección y unión
    const intersection = new Set([...words1].filter((word) => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    // Jaccard similarity = |intersección| / |unión|
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Elimina ofertas duplicadas basándose en empresa + título
   * Considera duplicadas las ofertas con empresa y título muy similares
   */
  private removeDuplicateJobs(jobs: JobPosting[]): JobPosting[] {
    const uniqueJobs: JobPosting[] = [];
    const seenJobs = new Map<string, JobPosting>();

    for (const job of jobs) {
      let isDuplicate = false;

      // Si no tiene empresa, no podemos comparar por empresa
      // Solo verificamos por URL exacta
      if (!job.company) {
        if (!seenJobs.has(job.url)) {
          uniqueJobs.push(job);
          seenJobs.set(job.url, job);
        }
        continue;
      }

      // Comparar con ofertas ya vistas
      for (const seenJob of seenJobs.values()) {
        // Si no tiene empresa la oferta vista, skip
        if (!seenJob.company) continue;

        // Calcular similitud de empresa y título
        const companySimilarity = this.calculateTextSimilarity(job.company, seenJob.company);
        const titleSimilarity = this.calculateTextSimilarity(job.title, seenJob.title);

        // Si empresa es muy similar (>=80%) Y título es muy similar (>=70%), es duplicado
        if (companySimilarity >= 0.8 && titleSimilarity >= 0.7) {
          isDuplicate = true;
          this.logger.debug(
            `🔄 Duplicado detectado: "${job.title}" en ${job.company} (${job.source}) - Similar a "${seenJob.title}" en ${seenJob.company} (${seenJob.source})`,
          );
          break;
        }
      }

      // Si no es duplicado, agregarlo
      if (!isDuplicate) {
        uniqueJobs.push(job);
        // Usar empresa + título normalizado como key
        const key = `${this.normalizeTextForComparison(job.company)}_${this.normalizeTextForComparison(job.title)}`;
        seenJobs.set(key, job);
      }
    }

    return uniqueJobs;
  }

  /**
   * Normaliza el tipo de empleo de SerpAPI a nuestro formato interno
   * Ejemplos: "Full-time" -> "full_time", "Part-time" -> "part_time"
   */
  private normalizeJobType(jobTypeText: string): string | undefined {
    const lowerText = jobTypeText.toLowerCase().trim();

    // Mapeo de términos comunes
    if (lowerText.includes('full') && lowerText.includes('time')) {
      return 'full_time';
    }
    if (lowerText.includes('part') && lowerText.includes('time')) {
      return 'part_time';
    }
    if (lowerText.includes('medio tiempo')) {
      return 'part_time';
    }
    if (lowerText.includes('tiempo completo')) {
      return 'full_time';
    }
    if (
      lowerText.includes('internship') ||
      lowerText.includes('pasantía') ||
      lowerText.includes('practicante')
    ) {
      return 'internship';
    }
    if (
      lowerText.includes('freelance') ||
      lowerText.includes('contractor') ||
      lowerText.includes('contrato')
    ) {
      return 'freelance';
    }
    if (lowerText.includes('temporal') || lowerText.includes('temporary')) {
      return 'freelance';
    }

    return undefined;
  }

  /**
   * Intenta parsear el texto de fecha de publicación a Date
   * Ejemplos: "hace 20 días", "2 days ago", "Today", "hace 1 hora"
   */
  private parsePostedAtDate(postedAtText: string): Date | undefined {
    try {
      const now = new Date();
      const lowerText = postedAtText.toLowerCase();

      // Patrones en español
      if (lowerText.includes('hace') && lowerText.includes('día')) {
        const match = lowerText.match(/hace\s+(\d+)\s+día/);
        if (match) {
          const daysAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setDate(date.getDate() - daysAgo);
          return date;
        }
      }

      if (lowerText.includes('hace') && lowerText.includes('hora')) {
        const match = lowerText.match(/hace\s+(\d+)\s+hora/);
        if (match) {
          const hoursAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setHours(date.getHours() - hoursAgo);
          return date;
        }
      }

      if (lowerText.includes('hace') && lowerText.includes('mes')) {
        const match = lowerText.match(/hace\s+(\d+)\s+mes/);
        if (match) {
          const monthsAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setMonth(date.getMonth() - monthsAgo);
          return date;
        }
      }

      // Patrones en inglés
      if (lowerText.includes('day') && lowerText.includes('ago')) {
        const match = lowerText.match(/(\d+)\s+day/);
        if (match) {
          const daysAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setDate(date.getDate() - daysAgo);
          return date;
        }
      }

      if (lowerText.includes('hour') && lowerText.includes('ago')) {
        const match = lowerText.match(/(\d+)\s+hour/);
        if (match) {
          const hoursAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setHours(date.getHours() - hoursAgo);
          return date;
        }
      }

      if (lowerText.includes('month') && lowerText.includes('ago')) {
        const match = lowerText.match(/(\d+)\s+month/);
        if (match) {
          const monthsAgo = parseInt(match[1]);
          const date = new Date(now);
          date.setMonth(date.getMonth() - monthsAgo);
          return date;
        }
      }

      // Casos especiales
      if (lowerText.includes('today') || lowerText.includes('hoy')) {
        return now;
      }

      if (lowerText.includes('yesterday') || lowerText.includes('ayer')) {
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        return date;
      }

      return undefined;
    } catch (error) {
      this.logger.debug(`No se pudo parsear fecha: ${postedAtText}`);
      return undefined;
    }
  }

  /**
   * Calcula cuántos días de antigüedad tiene una oferta
   * Retorna null si no se puede determinar
   */
  private getJobAgeDays(job: JobPosting): number | null {
    if (!job.publishedAt) {
      return null;
    }

    const now = new Date();
    const diffMs = now.getTime() - job.publishedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays >= 0 ? diffDays : null;
  }

  /**
   * Formatea ofertas para enviar por WhatsApp
   */
  formatJobsForWhatsApp(jobs: JobPosting[]): string {
    if (jobs.length === 0) {
      return `No encontré ofertas que coincidan con tu perfil en este momento. 😔

Intenta de nuevo más tarde o ajusta tus preferencias.`;
    }

    const header = `🎯 *Estas son las ofertas que encontré que más se ajustan a tus preferencias:*\n\n`;

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

        // Mostrar fecha de publicación si está disponible
        if (job.postedAtRaw) {
          text += `📅 Publicada ${job.postedAtRaw}\n`;
        }

        text += `🔗 ${job.url}\n`;

        return text;
      })
      .join('\n');

    const footer = `\n_Tip: Click en los enlaces para ver más detalles y aplicar._ 🚀`;

    return header + jobsText + footer;
  }
}
