import 'dotenv/config';
import { loadGoogleConfig } from '../config/google';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { SheetsService } from '../services/sheetsService';
import { logger } from '../utils/logger';

/**
 * Aplica formato de lectura a las hojas Horarios y Asistencias (encabezado
 * fijo, columnas autoajustadas, dropdown de día en Horarios, color por
 * estado en Asistencias). Solo formato, no toca datos; se puede re-ejecutar
 * cuando se agregan practicantes nuevos.
 */
async function formatSheets(): Promise<void> {
  const config = loadGoogleConfig();

  const horariosRepository = new HorariosSheetsService(config);
  await horariosRepository.ensureSheetExists();
  const horarioRows = await horariosRepository.readAll();
  await horariosRepository.applyReadabilityFormatting(horarioRows);
  logger.info(`Formato aplicado a Horarios (${horarioRows.length} filas).`);

  const sheetsService = new SheetsService(config);
  await sheetsService.ensureSheetExists();
  await sheetsService.applyReadabilityFormatting();
  logger.info('Formato aplicado a Asistencias.');
}

if (require.main === module) {
  formatSheets().catch((error) => {
    logger.error('Error al aplicar formato a las hojas:', error);
    process.exit(1);
  });
}
