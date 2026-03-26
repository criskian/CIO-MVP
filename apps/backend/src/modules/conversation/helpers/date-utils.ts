/**
 * Utilidades de fecha para el sistema de suscripciones
 */
export const FREEMIUM_BUSINESS_DAYS_LIMIT = 5;
export const FREEMIUM_V2_CALENDAR_DAYS_LIMIT = 7;
export const FREEMIUM_POLICY_LEGACY = 'LEGACY_5_BUSINESS_DAYS';
export const FREEMIUM_POLICY_V2 = 'V2_7_CALENDAR_DAYS';

export type FreemiumPolicy = typeof FREEMIUM_POLICY_LEGACY | typeof FREEMIUM_POLICY_V2;

/**
 * Cuenta los días hábiles (lunes a viernes) entre dos fechas
 * No cuenta sábados ni domingos
 * @param startDate - Fecha de inicio
 * @param endDate - Fecha de fin
 * @returns Número de días hábiles transcurridos
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current < end) {
        const dayOfWeek = current.getDay();
        // 0 = Domingo, 6 = Sábado
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return count;
}

/**
 * Calcula cuántos días hábiles faltan para llegar a un límite
 * @param startDate - Fecha de inicio del período
 * @param limitDays - Número de días hábiles del límite
 * @returns Días hábiles restantes
 */
export function getBusinessDaysRemaining(
    startDate: Date,
    limitDays: number = FREEMIUM_BUSINESS_DAYS_LIMIT,
    now: Date = new Date(),
): number {
    const businessDaysElapsed = countBusinessDays(startDate, now);
    return Math.max(0, limitDays - businessDaysElapsed);
}

/**
 * Verifica si el período freemium ha expirado por días hábiles
 * @param startDate - Fecha de inicio del freemium
 * @param limitDays - Límite en días hábiles (default: 5)
 */
export function isFreemiumExpiredByBusinessDays(
    startDate: Date,
    limitDays: number = FREEMIUM_BUSINESS_DAYS_LIMIT,
    now: Date = new Date(),
): boolean {
    return countBusinessDays(startDate, now) >= limitDays;
}

/**
 * Verifica expiracion freemium por dias calendario (V2).
 * Si existe freemiumExpiresAt, se usa esa fecha como fuente de verdad.
 * Si no existe, usa fallback de 7 dias desde startDate.
 */
export function isFreemiumExpiredByCalendarDays(
    startDate: Date,
    freemiumExpiresAt?: Date | null,
    limitDays: number = FREEMIUM_V2_CALENDAR_DAYS_LIMIT,
    now: Date = new Date(),
): boolean {
    if (freemiumExpiresAt) {
        return now >= freemiumExpiresAt;
    }

    const fallbackExpiry = new Date(startDate);
    fallbackExpiry.setDate(fallbackExpiry.getDate() + limitDays);
    return now >= fallbackExpiry;
}

/**
 * Regla canónica de expiración freemium vigente:
 * - Expira si se agotaron los usos.
 * - Expira si se alcanzaron 5 días hábiles desde el inicio.
 */
export function shouldExpireFreemium(
    startDate: Date,
    usesLeft: number,
    now: Date = new Date(),
): boolean {
    return shouldExpireFreemiumByPolicy({
        startDate,
        usesLeft,
        now,
    });
}

/**
 * Regla canonica de expiracion freemium segun politica:
 * - Siempre expira si se agotan usos.
 * - LEGACY_5_BUSINESS_DAYS: expira por 5 dias habiles.
 * - V2_7_CALENDAR_DAYS: expira por freemiumExpiresAt (o fallback 7 dias calendario).
 */
export function shouldExpireFreemiumByPolicy(params: {
    startDate: Date;
    usesLeft: number;
    freemiumPolicy?: string | null;
    freemiumExpiresAt?: Date | null;
    now?: Date;
}): boolean {
    const {
        startDate,
        usesLeft,
        freemiumPolicy,
        freemiumExpiresAt,
        now = new Date(),
    } = params;

    if (usesLeft <= 0) {
        return true;
    }

    if (freemiumPolicy === FREEMIUM_POLICY_V2) {
        return isFreemiumExpiredByCalendarDays(
            startDate,
            freemiumExpiresAt,
            FREEMIUM_V2_CALENDAR_DAYS_LIMIT,
            now,
        );
    }

    return isFreemiumExpiredByBusinessDays(
        startDate,
        FREEMIUM_BUSINESS_DAYS_LIMIT,
        now,
    );
}
