import 'dotenv/config';
import { BUSINESS_RULES } from '../config/business';
import { loadConfig } from '../config/env';
import { loadGoogleConfig } from '../config/google';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { parseScheduleRows, resolveAttendanceStatus } from '../services/scheduleService';
import { SheetsService } from '../services/sheetsService';
import {
  computeHoursDifference,
  formatDurationHoursWords,
  getTodayDate,
  getWeekdayNumber,
} from '../utils/date';
import { logger } from '../utils/logger';

/**
 * Registra entrada+salida de todos los practicantes con horario asignado en
 * una fecha dada, usando su bloque de horario (hora_inicio/hora_fin) como si
 * hubieran marcado a tiempo. Pensado para días en que el bot estuvo caído y
 * no se pudo registrar nada por Discord.
 * Uso: tsx src/scripts/backfillTodaySchedule.ts [YYYY-MM-DD]
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const googleConfig = loadGoogleConfig();
  const date = process.argv[2] ?? getTodayDate(config.timezone);
  const weekday = getWeekdayNumber(date);

  const horariosRepository = new HorariosSheetsService(googleConfig);
  await horariosRepository.ensureSheetExists();
  const rawRows = await horariosRepository.readAll();
  const { entries, errors } = parseScheduleRows(rawRows);

  if (errors.length > 0) {
    logger.warn(`Horarios: ${errors.length} fila(s) inválida(s), se ignoran:`, errors);
  }

  const todayEntries = entries.filter((entry) => entry.dia === weekday);

  if (todayEntries.length === 0) {
    logger.info(`Nadie tiene horario asignado para ${date} (día ${weekday}).`);
    return;
  }

  const sheetsService = new SheetsService(googleConfig);
  await sheetsService.ensureSheetExists();

  let created = 0;
  let skipped = 0;

  for (const entry of todayEntries) {
    const existing = await sheetsService.findTodayRecord(entry.discordId, date);
    if (existing) {
      logger.info(`Ya existe registro para ${entry.nombre} (${entry.discordId}), se omite.`);
      skipped += 1;
      continue;
    }

    const historial = await sheetsService.findRecordsInRange(
      entry.discordId,
      '2000-01-01',
      date,
    );
    const username = historial.at(-1)?.username || entry.nombre;

    const entryTime = `${entry.start}:00`;
    const exitTime = `${entry.end}:00`;
    const status = resolveAttendanceStatus(
      entryTime,
      { start: entry.start, end: entry.end },
      BUSINESS_RULES.punctuality.toleranceMinutes,
    );

    await sheetsService.appendEntry(entry.discordId, username, date, entryTime, status);

    const record = await sheetsService.findTodayRecord(entry.discordId, date);
    if (!record) {
      logger.error(`No se pudo releer el registro recién creado de ${entry.discordId}.`);
      continue;
    }

    const horasTrabajadas = computeHoursDifference(entryTime, exitTime);
    const horasRestantes = formatDurationHoursWords(0);

    await sheetsService.updateExit(
      record.rowIndex,
      exitTime,
      status,
      horasTrabajadas,
      horasRestantes,
    );

    logger.info(
      `${entry.nombre} (${username}): ${entryTime} - ${exitTime}, ${status}, ${horasTrabajadas}h`,
    );
    created += 1;
  }

  logger.info(`Listo: ${created} registro(s) creado(s), ${skipped} omitido(s) (${date}).`);
}

main().catch((error) => {
  logger.error('Error al rellenar asistencia del día:', error);
  process.exit(1);
});
