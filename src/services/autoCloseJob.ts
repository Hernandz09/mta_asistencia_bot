import { schedule } from 'node-cron';
import { AttendanceService } from './attendanceService';
import { logger } from '../utils/logger';

/**
 * Corre `attendanceService.closeUnfinishedEntries()` una vez al día según
 * `cronExpression` (hora local de `timezone`), para cerrar entradas que
 * quedaron abiertas (practicante marcó entrada pero nunca salida).
 */
export function scheduleAutoClose(
  attendanceService: AttendanceService,
  timezone: string,
  cronExpression: string,
): void {
  schedule(
    cronExpression,
    () => {
      attendanceService.closeUnfinishedEntries().catch((error) => {
        logger.error('Error en el cierre automático de asistencias:', error);
      });
    },
    { timezone },
  );

  logger.info(
    `Cierre automático de asistencias programado (${cronExpression}, ${timezone})`,
  );
}
