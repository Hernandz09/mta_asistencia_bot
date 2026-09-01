import { loadConfig } from '../config/env';
import { AttendanceService } from '../services/attendanceService';
import { createMysqlPool } from '../services/mysqlClient';
import { MysqlHorariosRepository } from '../services/mysqlHorariosRepository';
import { ScheduleService } from '../services/scheduleService';
import { SheetsService } from '../services/sheetsService';
import { logger } from '../utils/logger';
import { loadLocalEnv } from './loadLocalEnv';

/**
 * Cierra manualmente las entradas sin salida de una fecha dada.
 * Uso: tsx src/scripts/closeUnfinishedEntries.ts [YYYY-MM-DD]
 */
async function main(): Promise<void> {
  loadLocalEnv();
  const date = process.argv[2];
  const config = loadConfig();
  const pool = createMysqlPool(config.mysql);
  const scheduleService = new ScheduleService(
    new MysqlHorariosRepository(pool),
  );
  const sheetsService = config.google
    ? new SheetsService(config.google)
    : null;
  const attendanceService = new AttendanceService(
    config,
    scheduleService,
    pool,
    sheetsService,
  );

  await attendanceService.initialize();
  await scheduleService.initialize();

  const closed = await attendanceService.closeUnfinishedEntries(date);
  logger.info(`Listo: ${closed} entrada(s) cerrada(s) manualmente.`);
  await pool.end();
}

main().catch((error) => {
  logger.error('Error al cerrar entradas manualmente:', error);
  process.exit(1);
});
