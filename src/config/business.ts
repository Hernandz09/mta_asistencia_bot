import { DEFAULT_TIMEZONE } from './constants';

/**
 * Reglas de negocio del bot.
 * Ajusta estos valores para cambiar horarios sin modificar los servicios.
 */
export const BUSINESS_RULES = {
  timezone: DEFAULT_TIMEZONE,
  punctuality: {
    // Minutos de tolerancia tras la hora_inicio individual antes de pasar de Puntual a Tardanza.
    toleranceMinutes: 10,
  },
  schedule: {
    sheetName: 'Horarios',
    refreshIntervalMinutes: 30,
  },
  weeklyGoalHours: 30,
  autoClose: {
    // Hora (America/Lima) a la que corre el cierre de entradas abiertas del día.
    cronExpression: '55 23 * * *',
    // Hora de salida a usar cuando la entrada quedó abierta un día sin horario asignado.
    fallbackExitTime: '23:59:00',
  },
} as const;

export function resolveBusinessTimezone(envTimezone?: string): string {
  return envTimezone ?? BUSINESS_RULES.timezone;
}
