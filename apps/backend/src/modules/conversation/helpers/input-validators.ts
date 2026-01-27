import { JobType, UserIntent, ExperienceLevel, AlertFrequency } from '../types/conversation-states';

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

//Detecta si el usuario está en PC/desktop
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

//Detecta si el usuario está aceptando (sí, acepto, ok, dale, etc.)
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
    'alerts_yes', // ID de botón para aceptar alertas
    'accept_alerts', // ID alternativo de botón para aceptar alertas
  ];

  return acceptancePatterns.some(
    (pattern) => normalizedText === pattern || normalizedText.startsWith(pattern),
  );
}

//Detecta si el usuario está rechazando (no, rechazo, etc.)
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
    'alerts_no', // ID de botón para rechazar alertas
    'reject_alerts', // ID alternativo de botón para rechazar alertas
  ];

  return rejectionPatterns.some(
    (pattern) => normalizedText === pattern || normalizedText.startsWith(pattern),
  );
}

//Detecta intención de buscar ahora
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

//Detecta intención de subir CV
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

//Detecta intención de ayuda
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

//Detecta intención de reiniciar perfil
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

//Detecta intención de cancelar servicio
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

//Detecta intención de editar perfil
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
  ];
  if (alertTimePatterns.some((pattern) => normalizedText.includes(pattern))) {
    return 'horario';
  }

  return null;
}

//Detecta la intención general del usuario
export function detectIntent(text: string): UserIntent {
  if (isAcceptance(text)) return UserIntent.ACCEPT;
  if (isRejection(text)) return UserIntent.REJECT;
  if (isSearchIntent(text)) return UserIntent.SEARCH_NOW;
  if (isUploadCVIntent(text)) return UserIntent.UPLOAD_CV;
  if (isHelpIntent(text)) return UserIntent.HELP;
  return UserIntent.UNKNOWN;
}

//Normaliza texto de tipo de trabajo
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

//Valida y normaliza una hora desde múltiples formatos
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

  // Detectar patrones de "X de la mañana/tarde/noche"
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

//Valida y normaliza un salario desde múltiples formatos
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

//Valida que un texto sea una ubicación válida (ciudad o país, cualquier texto > 2 caracteres)
export function normalizeLocation(text: string): string | null {
  const normalizedText = text.trim();

  if (normalizedText.length >= 2) {
    // Capitalizar primera letra
    return normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1).toLowerCase();
  }

  return null;
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
//   // Detectar "híbrido"
//   const hybridPatterns = [
//     'hibrido',
//     'híbrido',
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

//Valida que un texto sea un rol o área válida (acepta roles específicos o áreas generales, mínimo 2 caracteres)
export function normalizeRole(text: string): string | null {
  const normalizedText = text.trim();

  if (normalizedText.length >= 2) {
    return normalizedText;
  }

  return null;
}

//Normaliza el nivel de experiencia del usuario
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

//Obtiene las palabras clave de búsqueda para cada nivel de experiencia
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

  // Cada 3 días
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

//Convierte AlertFrequency enum a texto legible en español
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

  // Horas más comunes: 6:00 AM a 4:00 PM (10 opciones)
  for (let hour = 6; hour <= 16; hour++) {
    const time = `${hour.toString().padStart(2, '0')}:00`;
    let label = time;

    // Agregar etiquetas especiales
    if (hour === 6) label = '🌅 06:00 (Mañana)';
    else if (hour === 12) label = '☀️ 12:00 (Mediodía)';
    else if (hour === 16) label = '🌆 16:00 (Tarde)';

    options.push({
      id: `time_${time}`,
      title: label,
    });
  }

  return options;
}
