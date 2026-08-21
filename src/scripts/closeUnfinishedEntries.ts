import 'dotenv/config';
import { loadConfig } from '../config/env';
import { AttendanceService } from '../services/attendanceService';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { ScheduleService } from '../services/scheduleService';
import { logger } from '../utils/logger';

/**
 * Cierra manualmente las entradas sin salida de una fecha dada.
 * Uso: tsx src/scripts/closeUnfinishedEntries.ts [YYYY-MM-DD]
 * Sin fecha, usa el día de hoy (según la zona horaria configurada).
 */
async function main(): Promise<void> {
  const date = process.argv[2];

  const config = loadConfig();
  const horariosSheetsService = new HorariosSheetsService(config.google);
  const scheduleService = new ScheduleService(horariosSheetsService);
  const attendanceService = new AttendanceService(config, scheduleService);

  await attendanceService.initialize();
  await scheduleService.initialize();

  const closed = await attendanceService.closeUnfinishedEntries(date);
  logger.info(`Listo: ${closed} entrada(s) cerrada(s) manualmente.`);
}

main().catch((error) => {
  logger.error('Error al cerrar entradas manualmente:', error);
  process.exit(1);
});
