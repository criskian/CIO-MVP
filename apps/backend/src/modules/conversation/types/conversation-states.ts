/**
 * Estados de la máquina de conversación
 * Flujo: NEW → ASK_DEVICE → ASK_TERMS → ASK_ROLE → ASK_EXPERIENCE → ASK_LOCATION → ASK_WORK_MODE → ASK_JOB_TYPE → ASK_MIN_SALARY → ASK_ALERT_FREQUENCY → ASK_ALERT_TIME → READY
 */
export enum ConversationState {
  NEW = 'NEW',
  ASK_DEVICE = 'ASK_DEVICE', // Preguntar si está en celular o PC
  ASK_TERMS = 'ASK_TERMS',
  ASK_ROLE = 'ASK_ROLE',
  ASK_EXPERIENCE = 'ASK_EXPERIENCE', // Pregunta por años de experiencia
  ASK_LOCATION = 'ASK_LOCATION', // Pregunta por la ciudad
  ASK_WORK_MODE = 'ASK_WORK_MODE', // Pregunta si quiere remoto o presencial
  ASK_JOB_TYPE = 'ASK_JOB_TYPE',
  ASK_MIN_SALARY = 'ASK_MIN_SALARY',
  ASK_ALERT_FREQUENCY = 'ASK_ALERT_FREQUENCY', // Pregunta con qué frecuencia desea alertas
  ASK_ALERT_TIME = 'ASK_ALERT_TIME', // Pregunta a qué hora desea alertas
  READY = 'READY',
  // Estados adicionales para flujos especiales
  WAITING_CV = 'WAITING_CV', // Usuario quiere enviar CV
  PROCESSING_CV = 'PROCESSING_CV', // CV siendo procesado
  CONFIRM_RESTART = 'CONFIRM_RESTART', // Confirmando reinicio de perfil
  CONFIRM_CANCEL_SERVICE = 'CONFIRM_CANCEL_SERVICE', // Confirmando cancelación del servicio
  EDITING_PROFILE = 'EDITING_PROFILE', // Usuario está editando su perfil
  EDIT_ROLE = 'EDIT_ROLE', // Editando rol específicamente
  EDIT_EXPERIENCE = 'EDIT_EXPERIENCE', // Editando experiencia
  EDIT_LOCATION = 'EDIT_LOCATION', // Editando ubicación (ciudad)
  EDIT_WORK_MODE = 'EDIT_WORK_MODE', // Editando modalidad (remoto/presencial)
  EDIT_JOB_TYPE = 'EDIT_JOB_TYPE', // Editando tipo de empleo
  EDIT_MIN_SALARY = 'EDIT_MIN_SALARY', // Editando salario mínimo
  EDIT_ALERT_FREQUENCY = 'EDIT_ALERT_FREQUENCY', // Editando frecuencia de alertas
  EDIT_ALERT_TIME = 'EDIT_ALERT_TIME', // Editando horario de alertas
}

/**
 * Tipo de trabajo
 */
export enum JobType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
}

/**
 * Nivel de experiencia
 */
export enum ExperienceLevel {
  NONE = 'none', // Sin experiencia
  JUNIOR = 'junior', // 1-2 años
  MID = 'mid', // 3-5 años
  SENIOR = 'senior', // 5+ años
  LEAD = 'lead', // 7+ años (Lead/Expert)
}

/**
 * Frecuencia de alertas
 */
export enum AlertFrequency {
  DAILY = 'daily',
  EVERY_3_DAYS = 'every_3_days',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * Intenciones que el sistema puede detectar
 */
export enum UserIntent {
  ACCEPT = 'accept',
  REJECT = 'reject',
  SEARCH_NOW = 'search_now',
  UPLOAD_CV = 'upload_cv',
  HELP = 'help',
  CHANGE_PREFERENCES = 'change_preferences',
  UNKNOWN = 'unknown',
}
