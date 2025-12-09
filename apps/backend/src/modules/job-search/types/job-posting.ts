/**
 * Representa una oferta de empleo normalizada
 */
export interface JobPosting {
  title: string;
  url: string;
  source: string; // dominio
  snippet: string; // descripción corta
  company?: string;
  locationRaw?: string;
  salaryRaw?: string;
  jobTypeRaw?: string; // Tipo de empleo como texto
  postedAtRaw?: string; // Fecha como texto 
  publishedAt?: Date; // Fecha parseada 
  score?: number; // score de relevancia
}

/**
 * Query para búsqueda de empleos
 */
export interface JobSearchQuery {
  role: string;
  location?: string;
  jobType?: string;
  minSalary?: number;
  workMode?: string; // presencial, remoto, hibrido, sin_preferencia
  experienceKeywords?: string[]; // Palabras clave para filtrar por experiencia 
}

/**
 * Resultado de la búsqueda
 */
export interface JobSearchResult {
  jobs: JobPosting[];
  total: number;
  query: string;
  executedAt: Date;
  offersExhausted?: boolean; // true cuando no hay más ofertas disponibles
}
