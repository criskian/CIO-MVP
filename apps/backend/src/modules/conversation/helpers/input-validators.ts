import { JobType, UserIntent, ExperienceLevel, AlertFrequency } from '../types/conversation-states';

/**
 * Extrae solo el primer nombre de un nombre completo
 * Ejemplo: "Cristian Suarez" -> "Cristian"
 */
export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'usuario';
  const firstName = fullName.trim().split(/\s+/)[0];
  // Capitalizar primera letra
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

/**
 * Verifica si un plan es de pago (PREMIUM o PRO)
 */
export function isPaidPlan(plan: string | undefined | null): boolean {
  return plan === 'PREMIUM' || plan === 'PRO';
}

// Detecta si el usuario está en móvil/celular
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

// Detecta si el usuario está en PC/desktop
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

// Detecta si el usuario está aceptando (sí, acepto, ok, dale, etc.)
export function isAcceptance(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Patrones que requieren match EXACTO (palabras cortas/ambiguas)
  const exactPatterns = [
    'si', 'sí', 'ok', 'okay', 'dale', 'claro', 's', 'y', 'yes',
    'alerts_yes', 'accept_alerts',
    'lead_interest_yes', 'lead_terms_accept',
    'confirm_restart', 'confirm_cancel',
  ];

  // Patrones que permiten startsWith (frases largas e inequívocas)
  const startsWithPatterns = [
    'acepto', 'de acuerdo', 'estoy de acuerdo', 'confirmo', 'adelante',
    'si,', 'sí,', 'si ', 'sí ',
  ];

  if (exactPatterns.includes(normalizedText)) return true;
  return startsWithPatterns.some((pattern) => normalizedText.startsWith(pattern));
}

// Detecta si el usuario está rechazando (no, rechazo, etc.)
export function isRejection(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Patrones que requieren match EXACTO (palabras cortas/ambiguas)
  const exactPatterns = [
    'no', 'nop', 'nope', 'n',
    'alerts_no', 'reject_alerts',
    'lead_interest_no', 'lead_terms_reject',
    'cancel_restart', 'abort_cancel',
  ];

  // Patrones que permiten startsWith (frases largas e inequívocas)
  const startsWithPatterns = [
    'no acepto', 'no quiero', 'rechazo', 'cancelar', 'salir',
    'no,', 'no ',
  ];

  if (exactPatterns.includes(normalizedText)) return true;
  return startsWithPatterns.some((pattern) => normalizedText.startsWith(pattern));
}

// Detecta intención de buscar ahora
export function isSearchIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos
  const searchPatterns = [
    /\bbuscar\b/,
    /\bbúscar\b/,
    /buscar ahora/,
    /quiero buscar/,
    /\bempezar\b/,
    /\bbusca\b/,
    /dame ofertas/,
    /mostrar ofertas/,
    /ver ofertas/,
  ];

  return searchPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta intención de subir CV
export function isUploadCVIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos
  const cvPatterns = [
    /\bcv\b/,
    /\bcurriculum\b/,
    /\bcurrículum\b/,
    /hoja de vida/,
    /subir cv/,
    /enviar cv/,
    /\badjuntar\b/,
    /tengo cv/,
    /mi curriculum/,
  ];

  return cvPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta intención de ayuda
export function isHelpIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos (ej: "ayudante" no debe detectarse como "ayuda")
  const helpPatterns = [
    /\bayuda\b/,
    /\bhelp\b/,
    /qué puedo hacer/,
    /que puedo hacer/,
    /cómo funciona/,
    /como funciona/,
    /no entiendo/,
  ];

  return helpPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta intención de reiniciar perfil
export function isRestartIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos
  const restartPatterns = [
    /\breiniciar\b/,
    /\brestart\b/,
    /\breset\b/,
    /volver a empezar/,
    /comenzar de nuevo/,
    /empezar de nuevo/,
  ];

  return restartPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta intención de cancelar servicio
export function isCancelServiceIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos
  const cancelPatterns = [
    /\bcancelar\b/,
    /\bcancel\b/,
    /dejar de usar/,
    /no quiero/,
    /eliminar cuenta/,
    /borrar datos/,
    /darme de baja/,
  ];

  return cancelPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta intención de editar perfil
export function isEditIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Usar regex con word boundaries para evitar falsos positivos
  const editPatterns = [
    /\beditar\b/,
    /\bedit\b/,
    /\bcambiar\b/,
    /\bmodificar\b/,
    /\bactualizar\b/,
    /\bajustar\b/,
    /\bcorregir\b/,
  ];

  return editPatterns.some((pattern) => pattern.test(normalizedText));
}

// Detecta si el usuario quiere ajustar preferencias del perfil (incluye remoto)
export function isPreferenceUpdateIntent(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  const remotePatterns = [
    /\bremoto\b/,
    /\bremote\b/,
    /desde casa/,
    /home office/,
    /teletrabajo/,
  ];

  if (remotePatterns.some((pattern) => pattern.test(normalizedText))) {
    return true;
  }

  const preferenceKeywords = [
    'preferencia',
    'preferencias',
    'perfil',
    'rol',
    'cargo',
    'profesion',
    'experiencia',
    'ubicacion',
    'ubicación',
    'ciudad',
    'pais',
    'país',
    'lugar',
    'salario',
    'sueldo',
    'horario',
    'alertas',
  ];

  const changeVerbs = [
    'quiero',
    'prefiero',
    'me gustaria',
    'me gustaría',
    'necesito',
    'deseo',
    'cambiar',
    'modificar',
    'actualizar',
    'ajustar',
    'editar',
  ];

  const hasPreferenceKeyword = preferenceKeywords.some((keyword) =>
    normalizedText.includes(keyword),
  );
  const hasChangeVerb = changeVerbs.some((verb) => normalizedText.includes(verb));

  if (hasPreferenceKeyword && hasChangeVerb) {
    return true;
  }

  // Ej: "quiero trabajar en miami", "prefiero en california"
  return /(quiero|prefiero|me gustaria|me gustaría|necesito|deseo).*(trabajar|empleo|ofertas?).*\b(en|desde)\b/.test(
    normalizedText,
  );
}

// Detecta qué campo del perfil el usuario quiere editar
export function detectEditField(
  text: string,
):
  | 'rol'
  | 'experiencia'
  | 'ubicacion'
  // | 'modalidad' // [DESACTIVADO] Puede reactivarse en el futuro
  | 'tipo'
  | 'salario'
  // | 'frecuencia' // [DESACTIVADO] Frecuencia siempre es diaria
  | 'horario'
  | null {
  const normalizedText = text.toLowerCase().trim();

  // Detectar campo "rol"
  const rolePatterns = ['rol', 'cargo', 'puesto', 'profesión', 'profesion', 'edit_rol', 'field_role'];
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
    'edit_experiencia',
    'field_experience',
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
    'location',
    'edit_ubicacion',
    'field_location',
    'remoto',
    'remote',
    'home office',
    'teletrabajo',
    'localización',
    'localizacion',
    'donde',
  ];
  if (locationPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'ubicacion';
  }

  // [DESACTIVADO] Detectar campo "modalidad" (remoto/presencial)
  // Puede reactivarse en el futuro si se requiere
  // const workModePatterns = [
  //   'modalidad',
  //   'remoto',
  //   'presencial',
  //   'trabajo remoto',
  //   'trabajo presencial',
  //   'oficina',
  //   'casa',
  // ];
  // if (workModePatterns.some((pattern) => normalizedText.includes(pattern))) {
  //   return 'modalidad';
  // }


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

  // [DESACTIVADO] Detectar campo "frecuencia de alertas" - Frecuencia siempre es diaria
  // const frequencyPatterns = ['frecuencia', 'cada cuanto', 'cada cuánto', 'periodicidad'];
  // if (frequencyPatterns.some((pattern) => normalizedText.includes(pattern))) {
  //   return 'frecuencia';
  // }

  // Detectar campo "horario de alertas"
  const alertTimePatterns = [
    'horario',
    'hora',
    'alerta',
    'notificación',
    'notificacion',
    'notificaciones',
    'edit_horario',
    'field_alert_time',
  ];
  if (alertTimePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'horario';
  }

  return null;
}

// Detecta la intención general del usuario
export function detectIntent(text: string): UserIntent {
  if (isAcceptance(text)) return UserIntent.ACCEPT;
  if (isRejection(text)) return UserIntent.REJECT;
  if (isSearchIntent(text)) return UserIntent.SEARCH_NOW;
  if (isUploadCVIntent(text)) return UserIntent.UPLOAD_CV;
  if (isHelpIntent(text)) return UserIntent.HELP;
  return UserIntent.UNKNOWN;
}

function normalizeSemanticText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPricingOrPlanQuestion(text: string): boolean {
  const normalized = normalizeSemanticText(text);
  if (!normalized) return false;

  const pricingKeywords = [
    'precio',
    'valor',
    'cuanto',
    'costo',
    'costar',
    'cuesta',
    'plan',
    'planes',
    'premium',
    'pro',
    'prueba',
    'mensual',
    'mes',
    'meses',
    'dias',
    'beneficios',
    'pago',
    'pagar',
    'como funciona',
  ];

  return pricingKeywords.some((keyword) => normalized.includes(keyword));
}

export function isLikelyHumanNameInput(text: string): boolean {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (raw.length < 2 || raw.length > 50) return false;

  if (/[?¿]/.test(raw)) return false;
  if (/@|https?:\/\/|www\.|\.com|\.co|[0-9]/i.test(raw)) return false;
  if (isPricingOrPlanQuestion(raw)) return false;
  if (
    isSearchIntent(raw)
    || isEditIntent(raw)
    || isRestartIntent(raw)
    || isCancelServiceIntent(raw)
    || isUploadCVIntent(raw)
    || isHelpIntent(raw)
  ) {
    return false;
  }

  const normalized = normalizeSemanticText(raw).replace(/[.,;:!]/g, ' ');
  if (
    /^(para|porque|por que|que|como|cual|donde|cuando)\b/.test(normalized)
    || /\b(para que|por que|que es|como funciona|de que se trata)\b/.test(normalized)
  ) {
    return false;
  }

  const tokens = normalized.split(' ').map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;

  const connectors = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'do', 'dos', 'y', 'para']);
  const blockedWords = new Set([
    'precio', 'valor', 'plan', 'premium', 'pro', 'prueba', 'correo', 'email',
    'buscar', 'editar', 'reiniciar', 'cancelar', 'ofertas', 'trabajo', 'empleo',
    'hola', 'buenas', 'gracias', 'ayuda', 'quiero', 'necesito', 'como', 'cuanto',
    'para', 'que', 'eso', 'esto', 'cual', 'donde', 'cuando', 'porque', 'motivo',
  ]);

  let meaningfulTokenCount = 0;
  for (const token of tokens) {
    if (!/^[a-z][a-z'’-]*$/i.test(token)) return false;
    if (connectors.has(token)) continue;
    if (token.length < 2) return false;
    if (blockedWords.has(token)) return false;
    meaningfulTokenCount += 1;
  }

  return meaningfulTokenCount >= 1;
}

export function extractLikelyHumanName(text: string): string | null {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return null;

  const byIntroPatterns = [
    /(?:soy|me llamo|mi nombre es)\s+([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,4})/i,
  ];

  for (const pattern of byIntroPatterns) {
    const match = raw.match(pattern);
    const candidate = match?.[1]?.trim().replace(/[.,;:!?]+$/g, '');
    if (candidate && isLikelyHumanNameInput(candidate)) {
      return candidate;
    }
  }

  const firstSegment = raw.split(',')[0]?.trim().replace(/[.;:!?]+$/g, '');
  if (firstSegment && isLikelyHumanNameInput(firstSegment)) {
    return firstSegment;
  }

  return isLikelyHumanNameInput(raw) ? raw : null;
}

// Normaliza texto de tipo de trabajo
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

// Valida y normaliza una hora desde múltiples formatos
export function normalizeTime(text: string): string | null {
  const normalizedText = text.toLowerCase().trim();

  // Casos especiales textuales
  if (normalizedText === 'mediodía' || normalizedText === 'mediodia' || normalizedText === '12') {
    return '12:00';
  }
  if (normalizedText === 'mañana' || normalizedText === 'manana') {
    return '09:00';
  }
  if (normalizedText === 'tarde') {
    return '14:00';
  }
  if (normalizedText === 'noche') {
    return '20:00';
  }

  // Detectar patrones de "X de la maÃ±ana/tarde/noche"
  const deLaMatch = normalizedText.match(/^(\d{1,2})\s*(?:de la\s*)?(mañana|manana|tarde|noche)$/);
  if (deLaMatch) {
    let hours = parseInt(deLaMatch[1]);
    const period = deLaMatch[2];

    if (period === 'mañana' || period === 'manana') {
      if (hours >= 1 && hours <= 12) {
        if (hours === 12) hours = 12;
        return `${hours.toString().padStart(2, '0')}:00`;
      }
    } else if (period === 'tarde') {
      if (hours >= 1 && hours <= 7) {
        return `${(hours + 12).toString().padStart(2, '0')}:00`;
      }
      if (hours === 12) return '12:00';
    } else if (period === 'noche') {
      if (hours >= 7 && hours <= 11) {
        return `${(hours + 12).toString().padStart(2, '0')}:00`;
      }
      if (hours === 12) return '00:00';
    }
  }

  const soloHora = normalizedText.match(/^(\d{1,2})$/);
  if (soloHora) {
    const hours = parseInt(soloHora[1]);
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}:00`;
    }
  }

  // Formato 24h: HH:mm o HH.mm o HHhmm
  const regex24h = /^(\d{1,2})[:.\s]?(\d{2})$/;
  const match24h = normalizedText.match(regex24h);

  if (match24h) {
    const hours = parseInt(match24h[1]);
    const minutes = parseInt(match24h[2]);

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  // Formato 12h: HH AM/PM o HH:MM AM/PM
  const regex12h = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)$/i;
  const match12h = normalizedText.match(regex12h);

  if (match12h) {
    let hours = parseInt(match12h[1]);
    const minutes = match12h[2] ? parseInt(match12h[2]) : 0;
    const period = match12h[3].toLowerCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes >= 60) {
      return null;
    }

    // Convertir a 24h
    if (period.startsWith('p')) {
      if (hours !== 12) hours += 12;
    } else if (period.startsWith('a')) {
      if (hours === 12) hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  return null;
}

// Valida y normaliza un salario desde múltiples formatos
export function normalizeSalary(text: string): number | null {
  const normalizedText = text.toLowerCase().trim();

  // Si el usuario escribe "0" o "sin filtro", aceptar sin filtro de salario
  if (normalizedText === '0' || normalizedText === 'sin filtro' || normalizedText === 'cualquiera') {
    return 0;
  }

  let salary: number | null = null;

  // Mapa de números en palabras a valores
  const wordToNumber: Record<string, number> = {
    'medio': 0.5,
    'un': 1,
    'uno': 1,
    'una': 1,
    'dos': 2,
    'tres': 3,
    'cuatro': 4,
    'cinco': 5,
    'seis': 6,
    'siete': 7,
    'ocho': 8,
    'nueve': 9,
    'diez': 10,
    'quince': 15,
    'veinte': 20,
    'veinticinco': 25,
    'treinta': 30,
  };

  // patrón con "millón/millones"
  const millionPatterns = [
    /(\w+(?:\.\d+)?)\s*(?:millon(?:es)?|mill(?:on)?)/i,
    /medio\s*(?:millon|millón)/i,
  ];

  for (const pattern of millionPatterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      if (normalizedText.includes('medio')) {
        salary = 500000;
        break;
      }

      const numPart = match[1];
      // Intentar convertir la parte numérica
      let multiplier = parseFloat(numPart.replace(',', '.'));

      // Si no es un número, buscar en el mapa de palabras
      if (isNaN(multiplier)) {
        multiplier = wordToNumber[numPart.toLowerCase()] || 0;
      }

      if (multiplier > 0) {
        salary = multiplier * 1000000;
        break;
      }
    }
  }

  // Detectar abreviaciones M (millones) y K (miles)
  if (!salary) {
    // "2M", "1.5M", "2,5M"
    const mMatch = normalizedText.match(/([\d.,]+)\s*m(?:illones?)?$/i);
    if (mMatch) {
      const num = parseFloat(mMatch[1].replace(',', '.'));
      if (!isNaN(num)) {
        salary = num * 1000000;
      }
    }

    // "500K", "800k"
    const kMatch = normalizedText.match(/([\d.,]+)\s*k$/i);
    if (kMatch) {
      const num = parseFloat(kMatch[1].replace(',', '.'));
      if (!isNaN(num)) {
        salary = num * 1000;
      }
    }
  }

  // Detectar formatos numéricos con separadores
  if (!salary) {
    let cleanText = normalizedText;

    // Detectar formato con separadores de miles
    if (/[\d][.,'][\d]{3}/.test(cleanText)) {
      // Tiene separadores de miles, quitarlos todos
      cleanText = cleanText.replace(/[.,']/g, '');
    } else {
      // Puede ser un decimal simple como "2.5" o "2,5" - convertir coma a punto
      cleanText = cleanText.replace(',', '.');
    }

    // Extraer número
    const numMatch = cleanText.match(/([\d.]+)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      if (!isNaN(num)) {
        // Si el número es muy pequeño, probablemente es millones
        if (num < 100) {
          salary = num * 1000000; // Asume millones
        } else if (num < 10000) {
          salary = num * 1000; // Asume miles
        } else {
          salary = num; // Ya es un valor completo
        }
      }
    }
  }

  // Validar rango razonable para salarios en COP (500K a 50M)
  if (salary !== null && salary > 0) {
    // Redondear a entero
    salary = Math.round(salary);

    if (salary >= 500000 && salary <= 50000000) {
      return salary;
    }

    // Si está entre 50 y 500, multiplicar por 1000 (usuario puso "800" queriendo decir 800k)
    if (salary >= 50 && salary < 500) {
      salary = salary * 1000;
      if (salary >= 500000 && salary <= 50000000) {
        return salary;
      }
    }
  }

  return null;
}

// ===== VALIDACIÃ“N DE UBICACIÃ“N =====

/**
 * Diccionario de ubicaciones vÃ¡lidas en LATAM
 * Mapea variantes (incluyendo typos comunes) a la forma correcta
 */
const KNOWN_LOCATIONS: Record<string, string> = {
  // Colombia - Ciudades principales
  'bogota': 'Bogotá',
  'bogotá': 'Bogotá',
  'medellin': 'Medellín',
  'medellín': 'Medellín',
  'cali': 'Cali',
  'barranquilla': 'Barranquilla',
  'cartagena': 'Cartagena',
  'bucaramanga': 'Bucaramanga',
  'pereira': 'Pereira',
  'manizales': 'Manizales',
  'cucuta': 'Cúcuta',
  'cúcuta': 'Cúcuta',
  'ibague': 'Ibagué',
  'ibagué': 'Ibagué',
  'santa marta': 'Santa Marta',
  'villavicencio': 'Villavicencio',
  'pasto': 'Pasto',
  'monteria': 'Montería',
  'montería': 'Montería',
  'neiva': 'Neiva',
  'armenia': 'Armenia',
  'popayan': 'Popayán',
  'popayán': 'Popayán',
  'palmira': 'Palmira',
  'valledupar': 'Valledupar',
  'tunja': 'Tunja',
  'floridablanca': 'Floridablanca',
  'soledad': 'Soledad',
  'soacha': 'Soacha',
  'envigado': 'Envigado',
  'bello': 'Bello',
  'itagui': 'Itagüí',
  'itagüí': 'Itagüí',

  // Colombia - Typos comunes
  'coilombia': 'Colombia',
  'colomgia': 'Colombia',
  'colmbia': 'Colombia',
  'colomba': 'Colombia',
  'bogta': 'Bogotá',
  'bogot': 'Bogotá',
  'medelín': 'Medellín',
  'medelin': 'Medellín',
  'barranqilla': 'Barranquilla',
  'baranquilla': 'Barranquilla',

  // PaÃ­ses LATAM
  'colombia': 'Colombia',
  'mexico': 'México',
  'méxico': 'México',
  'argentina': 'Argentina',
  'peru': 'Perú',
  'perú': 'Perú',
  'chile': 'Chile',
  'ecuador': 'Ecuador',
  'venezuela': 'Venezuela',
  'bolivia': 'Bolivia',
  'uruguay': 'Uruguay',
  'paraguay': 'Paraguay',
  'panama': 'Panamá',
  'panamá': 'Panamá',
  'costa rica': 'Costa Rica',
  'guatemala': 'Guatemala',
  'honduras': 'Honduras',
  'el salvador': 'El Salvador',
  'nicaragua': 'Nicaragua',
  'republica dominicana': 'República Dominicana',
  'república dominicana': 'República Dominicana',
  'puerto rico': 'Puerto Rico',
  'estados unidos': 'Estados Unidos',
  'eeuu': 'Estados Unidos',
  'e.e.u.u': 'Estados Unidos',
  'usa': 'Estados Unidos',
  'us': 'Estados Unidos',
  'u.s.a': 'Estados Unidos',
  'united states': 'Estados Unidos',
  'united states of america': 'Estados Unidos',
  'portugal': 'Portugal',
  'espana': 'España',
  'españa': 'España',
  'francia': 'Francia',
  'alemania': 'Alemania',
  'italia': 'Italia',
  'reino unido': 'Reino Unido',
  'paises bajos': 'Países Bajos',
  'países bajos': 'Países Bajos',
  'irlanda': 'Irlanda',
  'holanda': 'Países Bajos',
  'oporto': 'Oporto',
  'porto': 'Oporto',
  'lisboa': 'Lisboa',
  'madrid': 'Madrid',
  'barcelona': 'Barcelona',
  'paris': 'París',
  'parís': 'París',
  'berlin': 'Berlín',
  'berlín': 'Berlín',
  'roma': 'Roma',
  'milan': 'Milán',
  'milán': 'Milán',
  'londres': 'Londres',
  'dublin': 'Dublín',
  'dublín': 'Dublín',
  'amsterdam': 'Ãmsterdam',
  'Ã¡msterdam': 'Ãmsterdam',

  // MÃ©xico - Ciudades principales
  'cdmx': 'Ciudad de México',
  'ciudad de mexico': 'Ciudad de México',
  'ciudad de méxico': 'Ciudad de México',
  'guadalajara': 'Guadalajara',
  'monterrey': 'Monterrey',
  'puebla': 'Puebla',
  'tijuana': 'Tijuana',
  'leon': 'León',
  'león': 'León',
  'juarez': 'Juárez',
  'juárez': 'Juárez',
  'merida': 'Mérida',
  'mérida': 'Mérida',
  'cancun': 'Cancún',
  'cancún': 'Cancún',
  'queretaro': 'Querétaro',
  'querétaro': 'Querétaro',

  // Argentina - Ciudades principales
  'buenos aires': 'Buenos Aires',
  'cordoba': 'Córdoba',
  'córdoba': 'Córdoba',
  'rosario': 'Rosario',
  'mendoza': 'Mendoza',
  'tucuman': 'Tucumán',
  'tucumán': 'Tucumán',
  'la plata': 'La Plata',
  'mar del plata': 'Mar del Plata',

  // PerÃº - Ciudades principales
  'lima': 'Lima',
  'arequipa': 'Arequipa',
  'trujillo': 'Trujillo',
  'chiclayo': 'Chiclayo',
  'cusco': 'Cusco',
  'cuzco': 'Cusco',

  // Chile - Ciudades principales
  'santiago': 'Santiago',
  'valparaiso': 'Valparaíso',
  'valparaíso': 'Valparaíso',
  'concepcion': 'Concepción',
  'concepción': 'Concepción',
  'viña del mar': 'Viña del Mar',

  // Otros paÃ­ses - Capitales
  'quito': 'Quito',
  'guayaquil': 'Guayaquil',
  'caracas': 'Caracas',
  'la paz': 'La Paz',
  'montevideo': 'Montevideo',
  'asuncion': 'Asunción',
  'asunción': 'Asunción',
  'ciudad de panama': 'Ciudad de Panamá',
  'san jose': 'San José',
  'miami': 'Miami',
  'orlando': 'Orlando',
  'tampa': 'Tampa',
  'new york': 'New York',
  'nueva york': 'New York',
  'los angeles': 'Los Angeles',
  'houston': 'Houston',
  'chicago': 'Chicago',
  'dallas': 'Dallas',
  'san francisco': 'San Francisco',
  'california': 'California',
  'texas': 'Texas',
  'florida': 'Florida',

};

/**
 * Ubicaciones inválidas (demasiado vagas para buscar)
 */
const INVALID_LOCATIONS = [
  'latinoamerica', 'latinoamérica', 'latam', 'latin america',
  'sudamerica', 'sudamérica', 'suramerica', 'suramérica', 'south america',
  'centroamerica', 'centroamérica', 'central america',
  'norteamerica', 'norteamérica', 'north america',
  'europa', 'europe', 'union europea', 'unión europea', 'european union',
  'asia', 'africa', 'áfrica', 'oceania', 'oceanía', 'middle east', 'medio oriente',
  'america', 'américa', 'americas', 'américas',
  'mundial', 'global', 'internacional', 'world',
  'cualquier', 'cualquiera', 'donde sea', 'anywhere',
  'no importa', 'da igual', 'todo', 'todos', 'todas',
  'remoto', 'remote', 'trabajo remoto', 'home office', 'teletrabajo',
  'quiero remoto', 'busco remoto',
];

/**
 * Calcula la distancia de Levenshtein entre dos strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Detecta si la ubicación es demasiado vaga para buscar
 */
export function isInvalidLocation(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return INVALID_LOCATIONS.some(loc => normalized.includes(loc));
}

/**
 * Extrae la primera ubicación de un texto con múltiples ubicaciones
 * Ej: "Cali o Palmira" -> "Cali"
 * Ej: "Bogotá, Medellín, Cali" -> "Bogotá"
 */
export function extractFirstLocation(text: string): string {
  // Separadores comunes
  const separators = /[,\-\/;]|\s+o\s+|\s+y\s+|\s+u\s+/i;
  const parts = text.split(separators);

  // Retornar la primera parte válida (>= 3 caracteres, sin ser solo números)
  for (const part of parts) {
    const cleaned = part.trim();
    if (cleaned.length >= 3 && !/^\d+$/.test(cleaned)) {
      return cleaned;
    }
  }

  return text.trim();
}

/**
 * Intenta corregir typos usando el diccionario y fuzzy matching
 */
export function correctLocationTypo(text: string): string {
  const normalized = text.toLowerCase().trim();

  // Búsqueda exacta en diccionario
  if (KNOWN_LOCATIONS[normalized]) {
    return repairMojibakeText(KNOWN_LOCATIONS[normalized]);
  }

  // Fuzzy matching - buscar la ubicación más parecida
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const maxDistance = normalized.length <= 5
    ? 1
    : Math.max(1, Math.floor(normalized.length * 0.2)); // Max 20% de diferencia en textos largos

  for (const [key, value] of Object.entries(KNOWN_LOCATIONS)) {
    const distance = levenshteinDistance(normalized, key);
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = repairMojibakeText(value);
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // Si no hay match, normalizar a Title Case.
  return toTitleCaseLocation(text);
}

/**
 * Resultado de la validación de ubicación
 */
export interface LocationValidationResult {
  isValid: boolean;
  location: string | null;
  errorType?: 'too_short' | 'too_vague' | 'multiple' | 'multiple_extracted';
  originalInput?: string;
  wasMultiple?: boolean;
  wasCorrected?: boolean;
  options?: string[];
}

function normalizeForMatching(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function repairMojibakeText(text: string): string {
  if (!text) return text;
  if (!/[ÃÂâ]/.test(text)) return text;

  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    if (!repaired || repaired.includes('\uFFFD')) {
      return text;
    }
    return repaired;
  } catch {
    return text;
  }
}

function toTitleCaseLocation(text: string): string {
  return repairMojibakeText(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLocationToken(text: string): string {
  const key = normalizeForMatching(text.trim());
  for (const [rawKey, normalizedValue] of Object.entries(KNOWN_LOCATIONS)) {
    if (normalizeForMatching(rawKey) === key) {
      return repairMojibakeText(normalizedValue);
    }
  }
  return toTitleCaseLocation(text);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectKnownLocationsFromText(text: string): string[] {
  const normalizedText = normalizeForMatching(text);
  const matches: Array<{ start: number; end: number; length: number; value: string }> = [];

  for (const [rawKey, normalizedValue] of Object.entries(KNOWN_LOCATIONS)) {
    const key = normalizeForMatching(rawKey);
    const pattern = new RegExp(`(^|[^a-z0-9])(${escapeRegex(key)})(?=$|[^a-z0-9])`, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(normalizedText)) !== null) {
      const boundaryLength = match[1]?.length ?? 0;
      const keyLength = match[2]?.length ?? key.length;
      const start = match.index + boundaryLength;
      const end = start + keyLength;
      matches.push({ start, end, length: keyLength, value: repairMojibakeText(normalizedValue) });

      // Evita loop infinito con patrones que puedan consumir 0 caracteres.
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex += 1;
      }
    }
  }

  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.length - a.length;
  });

  const selected: Array<{ start: number; end: number; value: string }> = [];
  const seenValues = new Set<string>();

  for (const candidate of matches) {
    const overlaps = selected.some((picked) => candidate.start < picked.end && picked.start < candidate.end);
    if (overlaps) continue;

    const dedupeKey = candidate.value.toLowerCase();
    if (seenValues.has(dedupeKey)) continue;

    seenValues.add(dedupeKey);
    selected.push({ start: candidate.start, end: candidate.end, value: candidate.value });
  }

  return selected.map((entry) => entry.value);
}

/**
 * Extrae ubicaciones detectadas en texto libre y las normaliza (tildes/capitalizacion).
 * Detecta listas como:
 * - "medellin o buga"
 * - "ciudad de mexico cali y bogota"
 * - "miami / toronto"
 */
export function extractNormalizedLocations(text: string): string[] {
  const original = text.trim();
  if (!original) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  const addUnique = (value: string) => {
    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    found.push(value);
  };

  // 1) Detectar por diccionario en el texto completo.
  for (const location of collectKnownLocationsFromText(original)) {
    addUnique(location);
  }

  // 2) Fallback por separadores para lugares no contemplados en diccionario.
  const hasSeparators = /[,/;]|\s+\b(?:o|y|u|or|and)\b\s+/i.test(original);
  if (hasSeparators) {
    const parts = original
      .split(/[,\-\/;]|\s+\b(?:o|y|u|or|and)\b\s+/i)
      .map((part) => part.trim())
      .map((part) =>
        part
          .replace(/^(?:(quiero|busco|prefiero|trabajo|empleo|ofertas|en|de|para|ciudad|pais|país)\s+)+/i, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((part) => part.length >= 2)
      .filter((part) => !isInvalidLocation(part));

    for (const part of parts) {
      const knownInPart = collectKnownLocationsFromText(part);
      if (knownInPart.length > 0) {
        knownInPart.forEach(addUnique);
        continue;
      }

      // Si sigue siendo una frase larga, probablemente no es una ubicación limpia.
      if (part.split(/\s+/).length > 3) {
        continue;
      }

      const normalized = normalizeLocationToken(part);
      if (isInvalidLocation(normalized)) {
        continue;
      }
      addUnique(normalized);
    }
  }

  const countryInsideCity = new Set(
    found
      .map((location) => {
        const match = /^Ciudad de\s+(.+)$/i.exec(location.trim());
        return match?.[1]?.trim().toLowerCase() || null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  if (countryInsideCity.size > 0) {
    return found.filter((location) => !countryInsideCity.has(location.trim().toLowerCase()));
  }

  return found;
}

/**
 * Valida y normaliza una ubicación con corrección de typos y extracción
 */
export function validateAndNormalizeLocation(text: string): LocationValidationResult {
  const originalInput = text.trim();

  // Mínimo 2 caracteres
  if (originalInput.length < 2) {
    return { isValid: false, location: null, errorType: 'too_short' };
  }

  const extractedLocations = extractNormalizedLocations(originalInput);

  if (extractedLocations.length > 1) {
    return {
      isValid: false,
      location: null,
      errorType: 'multiple',
      originalInput,
      options: extractedLocations.slice(0, 5),
    };
  }

  // Detectar ubicaciones vagas
  if (isInvalidLocation(originalInput)) {
    return { isValid: false, location: null, errorType: 'too_vague', originalInput };
  }

  const extracted = extractedLocations.length === 1 ? extractedLocations[0] : extractFirstLocation(originalInput);

  // Corregir typos
  const corrected = correctLocationTypo(extracted);
  const wasCorrected = corrected.toLowerCase() !== extracted.toLowerCase();

  return {
    isValid: true,
    location: corrected,
    originalInput,
    wasMultiple: false,
    wasCorrected,
  };
}

/**
 * Función simple de normalización (retrocompatibilidad)
 * Ahora usa el sistema de validación completo
 */
export function normalizeLocation(text: string): string | null {
  const result = validateAndNormalizeLocation(text);
  return result.location;
}

// [DESACTIVADO] Normaliza la modalidad de trabajo
// Puede reactivarse en el futuro si se requiere
// export function normalizeWorkMode(
//   text: string,
// ): 'remoto' | 'presencial' | 'hibrido' | 'sin_preferencia' | null {
//   const normalizedText = text.toLowerCase().trim();
//
//   // Detectar "sin preferencia"
//   const noPreferencePatterns = [
//     'sin preferencia',
//     'cualquiera',
//     'todas',
//     'todos',
//     'no importa',
//     'da igual',
//     'me da igual',
//     'cualquier modalidad',
//     '4', // Por si usamos lista numerada
//   ];
//
//   if (noPreferencePatterns.some((pattern) => normalizedText.includes(pattern))) {
//     return 'sin_preferencia';
//   }
//
//   // Detectar "hÃ­brido"
//   const hybridPatterns = [
//     'hibrido',
//     'hÃ­brido',
//     'hybrid',
//     'mixto',
//     'mix',
//     'combinado',
//     'remoto y presencial',
//     '3', // Por si usamos lista numerada
//   ];
//
//   if (hybridPatterns.some((pattern) => normalizedText.includes(pattern))) {
//     return 'hibrido';
//   }
//
//   // Detectar "remoto"
//   const remotePatterns = [
//     'remoto',
//     'remote',
//     'remota',
//     'desde casa',
//     'casa',
//     'home',
//     'home office',
//     'teletrabajo',
//     '1', // Por si usamos lista numerada
//   ];
//
//   if (remotePatterns.some((pattern) => normalizedText.includes(pattern))) {
//     return 'remoto';
//   }
//
//   // Detectar "presencial"
//   const presencialPatterns = [
//     'presencial',
//     'oficina',
//     'office',
//     'in-office',
//     'in office',
//     'sitio',
//     'lugar',
//     '2', // Por si usamos lista numerada
//   ];
//
//   if (presencialPatterns.some((pattern) => normalizedText.includes(pattern))) {
//     return 'presencial';
//   }
//
//   return null;
// }

// Valida que un texto sea un rol o área válida (acepta roles específicos o áreas generales, mínimo 2 caracteres)
/**
 * Detecta si un texto es claramente NO un rol profesional.
 * Atrapa saludos, preguntas, frases conversacionales, etc.
 * Funciona sin LLM como primera línea de defensa.
 */
export function isNonRoleInput(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Patrones de saludos
  const greetings = [
    'hola', 'buenas', 'buenos', 'hey', 'hi', 'hello',
    'qué tal', 'que tal', 'como estas', 'cómo estás', 'como estás',
    'cómo estas', 'buenas tardes', 'buenas noches', 'buenos días',
    'buenos dias', 'buen día', 'buen dia', 'qué onda', 'que onda',
    'saludos', 'hola buenas', 'buenas buenas',
  ];
  if (greetings.some(g => normalizedText === g || normalizedText.startsWith(g + ' ') || normalizedText.startsWith(g + ','))) {
    return true;
  }

  // Tiene signo de interrogaciÃ³n â†’ es una pregunta, no un rol
  if (normalizedText.includes('?') || normalizedText.includes('¿')) {
    return true;
  }

  // Frases conversacionales comunes (NO roles)
  const conversational = [
    'gracias', 'muchas gracias', 'ok', 'vale', 'entendido',
    'no entiendo',     'no entendí', 'no sé', 'no se', 'no lo sé', 'no lo se', 'ni idea', 'quien sabe', 'quién sabe', 'nose', 'espera',
    'un momento', 'ya voy', 'ahí voy', 'dame un segundo',
    'qué es esto', 'que es esto', 'para qué sirve', 'para que sirve',
    'quién eres', 'quien eres', 'qué haces', 'que haces',
    'ayuda', 'help', 'necesito ayuda',
    'jaja', 'jajaja', 'lol', 'xd',
    'si', 'no', 'sí', 'nop', 'nope',
    'chao', 'adiós', 'adios', 'bye', 'hasta luego',
  ];
  if (conversational.some(c => normalizedText === c)) {
    return true;
  }

  // Frases que empiezan con verbos conversacionales (no profesionales)
  const conversationalStarts = [
    'quiero saber', 'me puedes', 'puedes', 'podrías', 'podrias',
    'dime', 'explícame', 'explicame', 'cuéntame', 'cuentame',
    'necesito que', 'oye', 'disculpa', 'perdón', 'perdon',
    'una pregunta', 'tengo una duda', 'no sé qué', 'no se que',
  ];
  if (conversationalStarts.some(s => normalizedText.startsWith(s))) {
    return true;
  }

  return false;
}

export function normalizeRole(text: string): string | null {
  const normalizedText = text.trim();

  // Rechazar si es claramente un mensaje conversacional, no un rol
  if (isNonRoleInput(normalizedText)) {
    return null;
  }

  if (normalizedText.length >= 2) {
    return normalizedText;
  }

  return null;
}

// Normaliza el nivel de experiencia del usuario
export function normalizeExperienceLevel(text: string): ExperienceLevel | null {
  const normalizedText = text.toLowerCase().trim();

  // Tokens que envía CloudApiProvider al elegir fila de lista (exp_* → sin prefijo)
  const listRowTokens: Record<string, ExperienceLevel> = {
    none: ExperienceLevel.NONE,
    junior: ExperienceLevel.JUNIOR,
    mid: ExperienceLevel.MID,
    senior: ExperienceLevel.SENIOR,
    lead: ExperienceLevel.LEAD,
  };
  if (listRowTokens[normalizedText]) {
    return listRowTokens[normalizedText];
  }
  if (normalizedText.startsWith('exp_')) {
    const suffix = normalizedText.slice(4);
    if (listRowTokens[suffix]) {
      return listRowTokens[suffix];
    }
  }

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

//Obtiene las palabras clave de bÃºsqueda para cada nivel de experiencia
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

//Normaliza la frecuencia de alertas del usuario
export function normalizeAlertFrequency(text: string): AlertFrequency | null {
  const normalizedText = text.toLowerCase().trim();

  // Diariamente
  const dailyPatterns = ['diaria', 'diario', 'diariamente', 'todos los dias', 'cada dia', '1'];
  if (dailyPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return AlertFrequency.DAILY;
  }

  // Cada 3 dÃ­as
  const every3DaysPatterns = ['cada 3', '3 dias', 'tres dias', '2'];
  if (every3DaysPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return AlertFrequency.EVERY_3_DAYS;
  }

  // Semanalmente
  const weeklyPatterns = ['semanal', 'semanalmente', 'cada semana', 'semana', '3'];
  if (weeklyPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return AlertFrequency.WEEKLY;
  }

  // Mensualmente
  const monthlyPatterns = ['mensual', 'mensualmente', 'cada mes', 'mes', '4'];
  if (monthlyPatterns.some((pattern) => normalizedText.includes(pattern))) {
    return AlertFrequency.MONTHLY;
  }

  return null;
}

//Convierte AlertFrequency enum a texto legible en espaÃ±ol
export function alertFrequencyToText(frequency: AlertFrequency): string {
  switch (frequency) {
    case AlertFrequency.DAILY:
      return 'Diariamente ☀️';
    case AlertFrequency.EVERY_3_DAYS:
      return 'Cada 3 días 📅';
    case AlertFrequency.WEEKLY:
      return 'Semanalmente 📆';
    case AlertFrequency.MONTHLY:
      return 'Mensualmente 🗓️';
    default:
      return 'Diariamente ☀️';
  }
}

//Genera lista de horas comunes para selector (6:00 AM a 4:00 PM)
export function generateTimeOptions(): Array<{ id: string; title: string }> {
  const options: Array<{ id: string; title: string }> = [];

  // Horas mÃ¡s comunes: 6:00 AM a 4:00 PM (10 opciones)
  for (let hour = 6; hour <= 16; hour++) {
    const time = `${hour.toString().padStart(2, '0')}:00`;
    let label = time;

    // Agregar etiquetas especiales
    if (hour === 6) label = 'ðŸŒ… 06:00 (MaÃ±ana)';
    else if (hour === 12) label = 'â˜€ï¸ 12:00 (MediodÃ­a)';
    else if (hour === 16) label = 'ðŸŒ† 16:00 (Tarde)';

    options.push({
      id: `time_${time}`,
      title: label,
    });
  }

  return options;
}

