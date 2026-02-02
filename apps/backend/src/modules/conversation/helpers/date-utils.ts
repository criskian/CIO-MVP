/**
 * Utilidades de fecha para el sistema de suscripciones
 */

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
export function getBusinessDaysRemaining(startDate: Date, limitDays: number): number {
    const businessDaysElapsed = countBusinessDays(startDate, new Date());
    return Math.max(0, limitDays - businessDaysElapsed);
}

/**
 * Verifica si el período freemium ha expirado por días hábiles
 * @param startDate - Fecha de inicio del freemium
 * @param limitDays - Límite en días hábiles (default: 5)
 */
export function isFreemiumExpiredByBusinessDays(startDate: Date, limitDays: number = 5): boolean {
    return countBusinessDays(startDate, new Date()) >= limitDays;
}
