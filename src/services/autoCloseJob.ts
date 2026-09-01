import { schedule } from 'node-cron';
import { AttendanceService } from './attendanceService';
import { RankingService } from './rankingService';
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

export function scheduleRankingSnapshots(
  rankingService: RankingService,
  timezone: string,
): void {
  schedule(
    '59 23 * * *',
    () => {
      rankingService.snapshotDuePeriods().catch((error) => {
        logger.error('Error al generar snapshot de ranking:', error);
      });
    },
    { timezone },
  );
  logger.info(`Snapshots de ranking programados (23:59, ${timezone})`);
}
