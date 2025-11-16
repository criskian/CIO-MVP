/**
 * Tipos para búsqueda de empleos
 */

/**
 * Representa una oferta de empleo normalizada
 */
export interface JobPosting {
  title: string;
  url: string;
  source: string; // dominio (ej: "computrabajo.com.co")
  snippet: string; // descripción corta
  company?: string;
  locationRaw?: string;
  salaryRaw?: string;
  publishedAt?: Date;
  score?: number; // score de relevancia (usado para ranking)
}

/**
 * Query para búsqueda de empleos
 */
export interface JobSearchQuery {
  role: string;
  location?: string;
  jobType?: string;
  minSalary?: number;
  remoteAllowed?: boolean;
  experienceKeywords?: string[]; // Palabras clave para filtrar por experiencia (e.g., ['junior', 'jr'])
}

/**
 * Resultado de la búsqueda
 */
export interface JobSearchResult {
  jobs: JobPosting[];
  total: number;
  query: string;
  executedAt: Date;
}

