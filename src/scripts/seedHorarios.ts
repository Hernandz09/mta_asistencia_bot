import 'dotenv/config';
import { loadGoogleConfig } from '../config/google';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { logger } from '../utils/logger';

type Dia = 1 | 2 | 3 | 4 | 5 | 6;

interface Bloque {
  inicio: string;
  fin: string;
}

interface HorarioPracticante {
  nombre: string;
  dias: Partial<Record<Dia, Bloque>>;
}

/**
 * Horario semanal por practicante (ciclo actual). `discord_id` se deja vacío
 * a propósito: se completa manualmente en la hoja Horarios una vez que se
 * conoce el ID de Discord de cada practicante.
 */
export const PRACTICANTES_SCHEDULE: HorarioPracticante[] = [
  {
    nombre: 'Yasumy Pastor',
    dias: {
      1: { inicio: '12:00', fin: '18:00' },
      3: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '15:00' },
      6: { inicio: '09:00', fin: '15:00' },
    },
  },
  {
    nombre: 'Sebastian Guardia',
    dias: {
      1: { inicio: '09:00', fin: '15:00' },
      3: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '13:45', fin: '19:45' },
      5: { inicio: '09:00', fin: '15:00' },
      6: { inicio: '09:00', fin: '15:00' },
    },
  },
  {
    nombre: 'Janeth Saca',
    dias: {
      1: { inicio: '15:00', fin: '21:00' },
      2: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '15:00' },
      6: { inicio: '09:00', fin: '15:00' },
    },
  },
  {
    nombre: 'Taylor Aguirre',
    dias: {
      1: { inicio: '09:00', fin: '15:00' },
      2: { inicio: '09:00', fin: '15:00' },
      3: { inicio: '09:00', fin: '16:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '14:00' },
    },
  },
  {
    nombre: 'Maurice Chavez',
    dias: {
      1: { inicio: '09:00', fin: '15:00' },
      2: { inicio: '09:00', fin: '15:00' },
      3: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '15:00' },
    },
  },
  {
    nombre: 'Carlos Yamacacho',
    dias: {
      1: { inicio: '09:00', fin: '15:00' },
      2: { inicio: '09:00', fin: '15:00' },
      3: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '15:00' },
    },
  },
  {
    nombre: 'Deivyd Saul',
    dias: {
      1: { inicio: '09:00', fin: '13:00' },
      2: { inicio: '09:00', fin: '15:00' },
      3: { inicio: '09:00', fin: '12:00' },
      4: { inicio: '13:45', fin: '19:45' },
      5: { inicio: '09:00', fin: '15:00' },
      6: { inicio: '09:00', fin: '14:00' },
    },
  },
  {
    nombre: 'Diego Galarza',
    dias: {
      1: { inicio: '09:00', fin: '15:00' },
      2: { inicio: '09:00', fin: '15:00' },
      4: { inicio: '09:00', fin: '15:00' },
      5: { inicio: '09:00', fin: '15:00' },
      6: { inicio: '12:15', fin: '18:15' },
    },
  },
];

/** Filas listas para `HorariosSheetsService.overwriteAll` (discord_id vacío). */
export function toHorarioRows(
  schedule: HorarioPracticante[] = PRACTICANTES_SCHEDULE,
): string[][] {
  const rows: string[][] = [];

  for (const practicante of schedule) {
    const dias = Object.entries(practicante.dias) as [string, Bloque][];
    for (const [dia, bloque] of dias) {
      rows.push(['', practicante.nombre, dia, bloque.inicio, bloque.fin]);
    }
  }

  return rows;
}

async function seedHorarios(): Promise<void> {
  const config = loadGoogleConfig();
  const repository = new HorariosSheetsService(config);

  await repository.ensureSheetExists();

  const rows = toHorarioRows();
  await repository.overwriteAll(rows);

  logger.info(
    `Horarios sembrados: ${rows.length} filas para ${PRACTICANTES_SCHEDULE.length} practicantes.`,
  );
  logger.info(
    'Completa la columna discord_id en la hoja Horarios para cada practicante.',
  );
}

if (require.main === module) {
  seedHorarios().catch((error) => {
    logger.error('Error al sembrar la hoja Horarios:', error);
    process.exit(1);
  });
}
