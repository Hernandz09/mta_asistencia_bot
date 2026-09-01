import 'dotenv/config';
import { loadGoogleConfig } from '../config/google';
import { ClasesSheetsService } from '../services/clasesSheetsService';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { PracticantesSheetsService } from '../services/practicantesSheetsService';
import { logger } from '../utils/logger';

interface CarreraCiclo {
  carrera: string;
  ciclo: string;
}

/** Carrera/ciclo conocidos para los practicantes del ciclo actual (por nombre). */
const CARRERA_CICLO_POR_NOMBRE: Record<string, CarreraCiclo> = {
  'Yasumy Pastor': { carrera: 'Desarrollo de software', ciclo: '6to' },
  'Sebastian Guardia': { carrera: 'Ing. Software con Inteligencia', ciclo: '6to' },
  'Janeth Saca': { carrera: 'Ing. Software con Inteligencia', ciclo: '5to' },
  'Taylor Aguirre': { carrera: 'Ing. Software con Inteligencia', ciclo: '4to' },
  'Maurice Chavez': { carrera: 'Desarrollo de software', ciclo: '5to' },
  'Carlos Yamacacho': { carrera: 'Ing. Software con Inteligencia', ciclo: '6to' },
  'Deivyd Saul': { carrera: 'Ing. Software con Inteligencia', ciclo: '4to' },
  'Diego Galarza': { carrera: 'Ing. Software con Inteligencia', ciclo: '6to' },
  'Kevin Ludeña': { carrera: 'Desarrollo de software', ciclo: '6to' },
  'Alfredo Gonzales': { carrera: 'Ing. Software con Inteligencia', ciclo: '6to' },
};

/** Deriva (discord_id, nombre) únicos desde las filas ya cargadas en Horarios. */
function derivePracticantes(
  horarioRows: string[][],
): { discordId: string; nombre: string }[] {
  const byName = new Map<string, string>();
  const order: string[] = [];

  for (const row of horarioRows) {
    const [discordId, nombre] = row;
    if (!nombre || !nombre.trim()) {
      continue;
    }

    if (!byName.has(nombre)) {
      order.push(nombre);
      byName.set(nombre, '');
    }

    const existing = byName.get(nombre);
    if (!existing && discordId && discordId.trim()) {
      byName.set(nombre, discordId.trim());
    }
  }

  return order.map((nombre) => ({
    nombre,
    discordId: byName.get(nombre) ?? '',
  }));
}

async function setupPracticantesYClases(): Promise<void> {
  const config = loadGoogleConfig();

  const horariosRepository = new HorariosSheetsService(config);
  await horariosRepository.ensureSheetExists();
  const horarioRows = await horariosRepository.readAll();

  const practicantes = derivePracticantes(horarioRows);
  if (practicantes.length === 0) {
    logger.error(
      'No se encontraron practicantes en Horarios (columna nombre vacía). Nada que migrar.',
    );
    return;
  }

  const practicantesRepository = new PracticantesSheetsService(config);
  await practicantesRepository.ensureSheetExists();
  await practicantesRepository.overwriteAll(
    practicantes.map(({ discordId, nombre }) => {
      const conocido = CARRERA_CICLO_POR_NOMBRE[nombre];
      return [discordId, nombre, conocido?.carrera ?? '', conocido?.ciclo ?? ''];
    }),
  );
  await practicantesRepository.applyReadabilityFormatting();
  logger.info(`Practicantes: ${practicantes.length} filas escritas.`);

  await horariosRepository.linkToPracticantes();
  logger.info(
    'Horarios: dropdown de nombre + fórmula de discord_id conectados a Practicantes.',
  );

  const clasesRepository = new ClasesSheetsService(config);
  await clasesRepository.build(practicantes.map((p) => p.nombre));
  logger.info('Clases: hoja generada con la grilla semanal.');

  logger.info(
    'Listo. Revisá la hoja Clases y completá la grilla de Motivo para los días libres de cada practicante.',
  );
}

if (require.main === module) {
  setupPracticantesYClases().catch((error) => {
    logger.error('Error al configurar Practicantes/Clases:', error);
    process.exit(1);
  });
}
