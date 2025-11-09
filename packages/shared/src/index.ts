/**
 * Tipos e interfaces compartidos entre apps
 * Este paquete es opcional para el MVP
 */

export type JobType = 'full_time' | 'part_time' | 'internship' | 'freelance';

export interface JobPosting {
  title: string;
  url: string;
  source: string;
  company?: string;
  locationRaw?: string;
  salaryRaw?: string;
  publishedAt?: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  role?: string;
  location?: string;
  jobType?: JobType;
  minSalary?: number;
  remoteAllowed?: boolean;
}

