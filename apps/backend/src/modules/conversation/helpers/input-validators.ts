import { JobType, UserIntent, ExperienceLevel } from '../types/conversation-states';

/**
 * Helpers para validar y normalizar respuestas del usuario
 */

/**
 * Detecta si el usuario está en móvil/celular
 */
export function isMobileDevice(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const mobilePatterns = [
    'celular',
    'movil',
    'móvil',
    'telefono',
    'teléfono',
    'cell',
    'phone',
    'smartphone',
    'android',
    'iphone',
    'móbil',
  ];

  return mobilePatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta si el usuario está en PC/desktop
 */
export function isDesktopDevice(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const desktopPatterns = [
    'pc',
    'computador',
    'computadora',
    'portatil',
    'portátil',
    'laptop',
    'desktop',
    'ordenador',
    'escritorio',
  ];

  return desktopPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta si el usuario está aceptando (sí, acepto, ok, dale, etc.)
 */
export function isAcceptance(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const acceptancePatterns = [
    'si',
    'sí',
    'acepto',
    'ok',
    'okay',
    'dale',
    'claro',
    'de acuerdo',
    'estoy de acuerdo',
    'confirmo',
    'adelante',
    's',
    'y',
    'yes',
  ];

  return acceptancePatterns.some(
    (pattern) => normalizedText === pattern || normalizedText.startsWith(pattern),
  );
}

/**
 * Detecta si el usuario está rechazando (no, rechazo, etc.)
 */
export function isRejection(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const rejectionPatterns = [
    'no',
    'nop',
    'nope',
    'rechazo',
    'no acepto',
    'no quiero',
    'cancelar',
    'salir',
    'n',
  ];

  return rejectionPatterns.some(
    (pattern) => normalizedText === pattern || normalizedText.startsWith(pattern),
  );
}

/**
 * Detecta intención de buscar ahora
 */
export function isSearchIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const searchPatterns = [
    'buscar',
    'búscar',
    'buscar ahora',
    'quiero buscar',
    'empezar',
    'busca',
    'dame ofertas',
    'mostrar ofertas',
    'ver ofertas',
  ];

  return searchPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta intención de subir CV
 */
export function isUploadCVIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const cvPatterns = [
    'cv',
    'curriculum',
    'currículum',
    'hoja de vida',
    'subir cv',
    'enviar cv',
    'adjuntar',
    'tengo cv',
    'mi curriculum',
  ];

  return cvPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta intención de ayuda
 */
export function isHelpIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const helpPatterns = [
    'ayuda',
    'help',
    'qué puedo hacer',
    'que puedo hacer',
    'cómo funciona',
    'como funciona',
    'no entiendo',
  ];

  return helpPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta intención de reiniciar perfil
 */
export function isRestartIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const restartPatterns = [
    'reiniciar',
    'restart',
    'reset',
    'volver a empezar',
    'comenzar de nuevo',
    'empezar de nuevo',
  ];

  return restartPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta intención de cancelar servicio
 */
export function isCancelServiceIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const cancelPatterns = [
    'cancelar',
    'cancel',
    'dejar de usar',
    'no quiero',
    'eliminar cuenta',
    'borrar datos',
    'darme de baja',
  ];

  return cancelPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta intención de editar perfil
 */
export function isEditIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const editPatterns = [
    'editar',
    'edit',
    'cambiar',
    'modificar',
    'actualizar',
    'ajustar',
    'corregir',
  ];

  return editPatterns.some((pattern) => normalizedText.includes(pattern));
}

/**
 * Detecta qué campo del perfil el usuario quiere editar
 * Retorna el nombre del campo o null si no se detecta
 */
export function detectEditField(
  text: string,
): 'rol' | 'experiencia' | 'ubicacion' | 'modalidad' | 'tipo' | 'salario' | 'horario' | null {
  const normalizedText = text.toLowerCase().trim();

  // Detectar campo "rol"
  const rolePatterns = ['rol', 'cargo', 'puesto', 'profesión', 'profesion'];
  if (rolePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'rol';
  }

  // Detectar campo "experiencia"
  const experiencePatterns = [
    'experiencia',
    'años',
    'año',
    'seniority',
    'nivel',
    'junior',
    'senior',
  ];
  if (experiencePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'experiencia';
  }

  // Detectar campo "ubicación"
  const locationPatterns = [
    'ubicación',
    'ubicacion',
    'ciudad',
    'lugar',
    'localización',
    'localizacion',
    'donde',
  ];
  if (locationPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'ubicacion';
  }

  // Detectar campo "modalidad" (remoto/presencial)
  const workModePatterns = [
    'modalidad',
    'remoto',
    'presencial',
    'trabajo remoto',
    'trabajo presencial',
    'oficina',
    'casa',
  ];
  if (workModePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'modalidad';
  }

  // Detectar campo "tipo de empleo/jornada"
  const jobTypePatterns = [
    'tipo',
    'jornada',
    'tiempo completo',
    'medio tiempo',
    'freelance',
    'pasantía',
    'pasantia',
  ];
  if (jobTypePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'tipo';
  }

  // Detectar campo "salario"
  const salaryPatterns = ['salario', 'sueldo', 'pago', 'remuneración', 'remuneracion'];
  if (salaryPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'salario';
  }

  // Detectar campo "horario de alertas"
  const alertTimePatterns = [
    'horario',
    'hora',
    'alerta',
    'notificación',
    'notificacion',
    'notificaciones',
  ];
  if (alertTimePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'horario';
  }

  return null;
}

/**
 * Detecta la intención general del usuario
 */
export function detectIntent(text: string): UserIntent {
  if (isAcceptance(text)) return UserIntent.ACCEPT;
  if (isRejection(text)) return UserIntent.REJECT;
  if (isSearchIntent(text)) return UserIntent.SEARCH_NOW;
  if (isUploadCVIntent(text)) return UserIntent.UPLOAD_CV;
  if (isHelpIntent(text)) return UserIntent.HELP;
  return UserIntent.UNKNOWN;
}

/**
 * Normaliza texto de tipo de trabajo
 */
export function normalizeJobType(text: string): JobType | null {
  const normalizedText = text.toLowerCase().trim();

  if (
    normalizedText.includes('completo') ||
    normalizedText.includes('tiempo completo') ||
    normalizedText === '1'
  ) {
    return JobType.FULL_TIME;
  }
  if (
    normalizedText.includes('medio tiempo') ||
    normalizedText.includes('part time') ||
    normalizedText === '2'
  ) {
    return JobType.PART_TIME;
  }
  if (
    normalizedText.includes('pasantía') ||
    normalizedText.includes('pasantia') ||
    normalizedText.includes('práctica') ||
    normalizedText.includes('practica') ||
    normalizedText === '3'
  ) {
    return JobType.INTERNSHIP;
  }
  if (
    normalizedText.includes('freelance') ||
    normalizedText.includes('independiente') ||
    normalizedText === '4'
  ) {
    return JobType.FREELANCE;
  }

  return null;
}

/**
 * Valida que un texto sea una hora válida (HH:mm o HH:MM AM/PM)
 */
export function normalizeTime(text: string): string | null {
  const normalizedText = text.trim();

  // Formato 24h: HH:mm
  const regex24h = /^(\d{1,2}):(\d{2})$/;
  const match24h = normalizedText.match(regex24h);

  if (match24h) {
    const hours = parseInt(match24h[1]);
    const minutes = parseInt(match24h[2]);

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  // Formato 12h: HH:MM AM/PM
  const regex12h = /^(\d{1,2}):(\d{2})\s*(am|pm|AM|PM|a\.m\.|p\.m\.)$/;
  const match12h = normalizedText.match(regex12h);

  if (match12h) {
    let hours = parseInt(match12h[1]);
    const minutes = parseInt(match12h[2]);
    const period = match12h[3].toLowerCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes >= 60) {
      return null;
    }

    // Convertir a 24h
    if (period.startsWith('pm') || period.startsWith('p')) {
      if (hours !== 12) hours += 12;
    } else if (period.startsWith('am') || period.startsWith('a')) {
      if (hours === 12) hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  return null;
}

/**
 * Valida y normaliza un salario (extrae números)
 */
export function normalizeSalary(text: string): number | null {
  // Eliminar puntos y comas de miles
  const cleanText = text.replace(/[.,]/g, '');

  // Buscar números
  const match = cleanText.match(/\d+/);

  if (match) {
    const salary = parseInt(match[0]);
    // Validar que sea un salario razonable (entre 500k y 50M COP)
    if (salary >= 500000 && salary <= 50000000) {
      return salary;
    }
  }

  return null;
}

/**
 * Valida que un texto sea una ciudad válida (por ahora, cualquier texto > 2 caracteres)
 */
export function normalizeLocation(text: string): string | null {
  const normalizedText = text.trim();

  if (normalizedText.length >= 2) {
    // Capitalizar primera letra
    return normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1).toLowerCase();
  }

  return null;
}

/**
 * Normaliza la modalidad de trabajo (remoto/presencial)
 * Retorna: 'remoto' | 'presencial' | null
 */
export function normalizeWorkMode(text: string): 'remoto' | 'presencial' | null {
  const normalizedText = text.toLowerCase().trim();

  // Detectar "remoto"
  const remotePatterns = [
    'remoto',
    'remote',
    'remota',
    'desde casa',
    'casa',
    'home',
    'home office',
    'teletrabajo',
    '1', // Por si usamos lista numerada
  ];

  if (remotePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'remoto';
  }

  // Detectar "presencial"
  const presencialPatterns = [
    'presencial',
    'oficina',
    'office',
    'in-office',
    'in office',
    'sitio',
    'lugar',
    '2', // Por si usamos lista numerada
  ];

  if (presencialPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'presencial';
  }

  return null;
}

/**
 * Valida que un texto sea un rol válido (por ahora, cualquier texto > 2 caracteres)
 */
export function normalizeRole(text: string): string | null {
  const normalizedText = text.trim();

  if (normalizedText.length >= 2) {
    return normalizedText;
  }

  return null;
}

/**
 * Normaliza el nivel de experiencia del usuario
 * Retorna: ExperienceLevel enum o null
 */
export function normalizeExperienceLevel(text: string): ExperienceLevel | null {
  const normalizedText = text.toLowerCase().trim();

  // Sin experiencia
  const nonePatterns = [
    'sin experiencia',
    'sin exp',
    'ninguna',
    'ninguno',
    'no tengo',
    'cero',
    '0',
    '1',
  ];
  if (nonePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return ExperienceLevel.NONE;
  }

  // Junior (1-2 años)
  const juniorPatterns = ['junior', 'jr', '1 año', '2 años', '1-2', '2'];
  if (juniorPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return ExperienceLevel.JUNIOR;
  }

  // Mid/Intermedio (3-5 años)
  const midPatterns = [
    'mid',
    'intermedio',
    'semi senior',
    'semi-senior',
    'middle',
    '3 años',
    '4 años',
    '5 años',
    '3-5',
    '3',
  ];
  if (midPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return ExperienceLevel.MID;
  }

  // Senior (5+ años)
  const seniorPatterns = [
    'senior',
    'sr',
    'experto',
    'especialista',
    '5 años',
    '6 años',
    '7 años',
    '8 años',
    '5+',
    '4',
  ];
  if (seniorPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return ExperienceLevel.SENIOR;
  }

  // Lead/Expert (7+ años)
  const leadPatterns = [
    'lead',
    'líder',
    'lider',
    'principal',
    'expert',
    'experto senior',
    '7+',
    '10',
    '10+',
    '5',
  ];
  if (leadPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return ExperienceLevel.LEAD;
  }

  return null;
}

/**
 * Obtiene las palabras clave de búsqueda para cada nivel de experiencia
 * Estas palabras se usan para filtrar/priorizar resultados en la búsqueda
 */
export function getExperienceKeywords(level: ExperienceLevel): string[] {
  switch (level) {
    case ExperienceLevel.NONE:
      return ['junior', 'practicante', 'trainee', 'aprendiz', 'sin experiencia', 'entry level'];
    case ExperienceLevel.JUNIOR:
      return ['junior', 'jr'];
    case ExperienceLevel.MID:
      return ['semi senior', 'mid', 'intermedio'];
    case ExperienceLevel.SENIOR:
      return ['senior', 'sr', 'experto', 'especialista'];
    case ExperienceLevel.LEAD:
      return ['lead', 'líder', 'principal', 'expert', 'arquitecto', 'director'];
    default:
      return [];
  }
}
