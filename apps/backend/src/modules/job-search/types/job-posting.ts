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
  jobTypeRaw?: string; // Tipo de empleo como texto (ej: "Full-time", "Part-time")
  postedAtRaw?: string; // Fecha como texto (ej: "hace 20 días", "2 days ago")
  publishedAt?: Date; // Fecha parseada (si es posible)
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
  workMode?: string; // presencial, remoto, hibrido, sin_preferencia
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
  offersExhausted?: boolean; // true cuando no hay más ofertas disponibles (cache vacío + sin más páginas)
}
