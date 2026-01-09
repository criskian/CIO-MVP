/**
 * Estados de la máquina de conversación
 * Flujo actualizado: NEW → ASK_TERMS → ASK_ROLE → ASK_EXPERIENCE → ASK_LOCATION → READY
 * Después de primera búsqueda: OFFER_ALERTS → (Si acepta) → ASK_ALERT_FREQUENCY → ASK_ALERT_TIME → READY
 * NOTA: ASK_WORK_MODE, ASK_DEVICE, ASK_JOB_TYPE y ASK_MIN_SALARY fueron removidos del flujo
 */
export enum ConversationState {
  NEW = 'NEW',
  // ASK_NAME = 'ASK_NAME', // [ELIMINADO] Nombre se obtiene del registro en landing
  // ASK_DEVICE = 'ASK_DEVICE', // [ELIMINADO] Siempre asumimos celular/móvil para usar botones interactivos
  ASK_TERMS = 'ASK_TERMS',
  ASK_ROLE = 'ASK_ROLE',
  ASK_EXPERIENCE = 'ASK_EXPERIENCE', // Pregunta por años de experiencia
  ASK_LOCATION = 'ASK_LOCATION', // Pregunta por la ciudad/país
  // ASK_WORK_MODE = 'ASK_WORK_MODE', // [DESACTIVADO] Pregunta si quiere remoto o presencial
  // ASK_JOB_TYPE = 'ASK_JOB_TYPE', // [DESACTIVADO] No aporta valor significativo
  // ASK_MIN_SALARY = 'ASK_MIN_SALARY', // [DESACTIVADO] No aporta valor significativo
  READY = 'READY',
  
  // Estados de configuración de alertas (después de primera búsqueda)
  OFFER_ALERTS = 'OFFER_ALERTS', // Pregunta si desea recibir alertas después de la primera búsqueda
  ASK_ALERT_FREQUENCY = 'ASK_ALERT_FREQUENCY', // Pregunta con qué frecuencia desea alertas
  ASK_ALERT_TIME = 'ASK_ALERT_TIME', // Pregunta a qué hora desea alertas
  
  // Estados adicionales para flujos especiales
  WAITING_CV = 'WAITING_CV', // Usuario quiere enviar CV
  PROCESSING_CV = 'PROCESSING_CV', // CV siendo procesado
  CONFIRM_RESTART = 'CONFIRM_RESTART', // Confirmando reinicio de perfil
  CONFIRM_CANCEL_SERVICE = 'CONFIRM_CANCEL_SERVICE', // Confirmando cancelación del servicio
  EDITING_PROFILE = 'EDITING_PROFILE', // Usuario está editando su perfil
  EDIT_ROLE = 'EDIT_ROLE', // Editando rol específicamente
  EDIT_EXPERIENCE = 'EDIT_EXPERIENCE', // Editando experiencia
  EDIT_LOCATION = 'EDIT_LOCATION', // Editando ubicación (ciudad)
  // EDIT_WORK_MODE = 'EDIT_WORK_MODE', // [DESACTIVADO] Editando modalidad (remoto/presencial)
  // EDIT_JOB_TYPE = 'EDIT_JOB_TYPE', // [DESACTIVADO] No aporta valor significativo
  // EDIT_MIN_SALARY = 'EDIT_MIN_SALARY', // [DESACTIVADO] No aporta valor significativo
  EDIT_ALERT_FREQUENCY = 'EDIT_ALERT_FREQUENCY', // Editando frecuencia de alertas
  EDIT_ALERT_TIME = 'EDIT_ALERT_TIME', // Editando horario de alertas
  
  // Estados para sistema de planes (NUEVOS)
  FREEMIUM_EXPIRED = 'FREEMIUM_EXPIRED', // Freemium agotado, mostrar opciones de pago
  ASK_EMAIL = 'ASK_EMAIL', // Pedir email para vincular pago
  WAITING_PAYMENT = 'WAITING_PAYMENT', // Esperando confirmación de pago
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
