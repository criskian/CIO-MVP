/**
 * Estados de la máquina de conversación
 * Flujo: NEW → ASK_TERMS → ASK_ROLE → ASK_LOCATION → ASK_JOB_TYPE → ASK_MIN_SALARY → ASK_ALERT_TIME → READY
 */
export enum ConversationState {
  NEW = 'NEW',
  ASK_TERMS = 'ASK_TERMS',
  ASK_ROLE = 'ASK_ROLE',
  ASK_LOCATION = 'ASK_LOCATION',
  ASK_JOB_TYPE = 'ASK_JOB_TYPE',
  ASK_MIN_SALARY = 'ASK_MIN_SALARY',
  ASK_ALERT_TIME = 'ASK_ALERT_TIME',
  READY = 'READY',
  // Estados adicionales para flujos especiales
  WAITING_CV = 'WAITING_CV', // Usuario quiere enviar CV
  PROCESSING_CV = 'PROCESSING_CV', // CV siendo procesado
  CONFIRM_RESTART = 'CONFIRM_RESTART', // Confirmando reinicio de perfil
  CONFIRM_CANCEL_SERVICE = 'CONFIRM_CANCEL_SERVICE', // Confirmando cancelación del servicio
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
