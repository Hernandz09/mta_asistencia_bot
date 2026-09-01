import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadGoogleConfig } from '../config/google';
import { loadMysqlConfig } from '../config/mysql';
import { createMysqlPool, withTransaction } from '../services/mysqlClient';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { PracticantesSheetsService } from '../services/practicantesSheetsService';
import { SheetsService } from '../services/sheetsService';
import { parseScheduleRows, ScheduleEntry } from '../services/scheduleService';
import { calcularJornada } from '../services/jornadaRules';
import { logger } from '../utils/logger';
import { PRACTICANTES_SCHEDULE } from './seedHorarios';
import { applyMysqlSchema } from './applyMysqlSchema';
import { loadLocalEnv } from './loadLocalEnv';

const TIMEZONE_OFFSET_HOURS = 5;
const SYSTEM_USER_ID = 1;
const DEFAULT_VIGENCIA = '2026-01-01';
const WEEK_30H_DATES = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
] as const;

interface PracticanteRow {
  id: number;
  discordId: string | null;
  nombre: string;
}

function splitNombre(fullName: string): { nombres: string; apellidos: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombres: 'Sin nombre', apellidos: '—' };
  if (parts.length === 1) return { nombres: parts[0], apellidos: '—' };
  return {
    nombres: parts.slice(0, -1).join(' '),
    apellidos: parts[parts.length - 1],
  };
}

function codigoFromIndex(index: number): string {
  return `PRAC-${String(index).padStart(3, '0')}`;
}

function limaToUtcDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const utc = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      (hours ?? 0) + TIMEZONE_OFFSET_HOURS,
      minutes ?? 0,
      seconds ?? 0,
    ),
  );
  return utc.toISOString().slice(0, 23).replace('T', ' ');
}

function weekdayFromDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function padTime(time: string): string {
  const parts = time.split(':');
  if (parts.length === 2) return `${time}:00`;
  return time;
}

function canonicalScheduleEntries(): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const practicante of PRACTICANTES_SCHEDULE) {
    for (const [dia, bloque] of Object.entries(practicante.dias)) {
      if (!bloque) continue;
      entries.push({
        discordId: '',
        nombre: practicante.nombre,
        dia: Number(dia),
        start: bloque.inicio,
        end: bloque.fin,
      });
    }
  }
  return entries;
}

function carreraCicloDe(nombre: string): { carrera: string; ciclo: string } {
  const found = PRACTICANTES_SCHEDULE.find(
    (item) => item.nombre.toLowerCase() === nombre.toLowerCase(),
  );
  return {
    carrera: found?.carrera ?? '',
    ciclo: found?.ciclo ?? '',
  };
}

function mergeSchedules(
  fromSheets: ScheduleEntry[],
  canonical: ScheduleEntry[],
): ScheduleEntry[] {
  const discordByName = new Map<string, string>();
  for (const entry of fromSheets) {
    if (entry.discordId && entry.nombre) {
      discordByName.set(entry.nombre.trim().toLowerCase(), entry.discordId);
    }
  }

  const merged = new Map<string, ScheduleEntry>();
  const keyOf = (entry: ScheduleEntry) =>
    `${entry.nombre.trim().toLowerCase()}|${entry.dia}`;

  for (const entry of canonical) {
    const discordId = discordByName.get(entry.nombre.trim().toLowerCase()) ?? '';
    merged.set(keyOf(entry), { ...entry, discordId });
  }
  for (const entry of fromSheets) {
    const key = keyOf(entry);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }
    if (entry.discordId && !existing.discordId) {
      merged.set(key, { ...existing, discordId: entry.discordId });
    }
  }
  return [...merged.values()];
}

function findBlock(
  entries: ScheduleEntry[],
  nombre: string,
  discordId: string | null,
  dia: number,
): ScheduleEntry | undefined {
  return entries.find(
    (entry) =>
      entry.dia === dia &&
      ((discordId && entry.discordId === discordId) ||
        entry.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()),
  );
}

async function insertPracticante(
  conn: PoolConnection,
  params: {
    codigo: string;
    nombre: string;
    discordId: string | null;
    carrera: string;
    ciclo: string;
  },
): Promise<number> {
  const { nombres, apellidos } = splitNombre(params.nombre);
  const [result] = await conn.query<ResultSetHeader>(
    `INSERT INTO practicantes
      (codigo, nombres, apellidos, area, estado, id_externo_bot, carrera, ciclo, encargado_id)
     VALUES (?, ?, ?, 'software', 'activo', ?, ?, ?, ?)`,
    [
      params.codigo,
      nombres,
      apellidos,
      params.discordId,
      params.carrera || null,
      params.ciclo || null,
      SYSTEM_USER_ID,
    ],
  );
  return result.insertId;
}

async function upsertJornada(
  conn: PoolConnection,
  params: {
    practicanteId: number;
    date: string;
    entryTime: string | null;
    exitTime: string | null;
    blockStart: string | null;
    blockEnd: string | null;
  },
): Promise<void> {
  const calc = calcularJornada(
    params.entryTime,
    params.exitTime,
    params.blockStart,
    params.blockEnd,
  );
  const entradaUtc = params.entryTime
    ? limaToUtcDateTime(params.date, padTime(params.entryTime))
    : null;
  const salidaUtc = params.exitTime
    ? limaToUtcDateTime(params.date, padTime(params.exitTime))
    : null;

  await conn.query(
    `INSERT INTO jornadas
      (practicante_id, fecha, contexto, recuperacion_id,
       hora_entrada_programada, hora_salida_programada,
       entrada_real, salida_real, estado_entrada, estado_salida, estado_jornada,
       horas_computadas, horas_por_justificar, horas_justificadas, minutos_tardanza, recalculado_en)
     VALUES (?, ?, 'REGULAR', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       hora_entrada_programada = VALUES(hora_entrada_programada),
       hora_salida_programada = VALUES(hora_salida_programada),
       entrada_real = VALUES(entrada_real),
       salida_real = VALUES(salida_real),
       estado_entrada = VALUES(estado_entrada),
       estado_salida = VALUES(estado_salida),
       estado_jornada = VALUES(estado_jornada),
       horas_computadas = VALUES(horas_computadas),
       horas_por_justificar = VALUES(horas_por_justificar),
       minutos_tardanza = VALUES(minutos_tardanza),
       recalculado_en = VALUES(recalculado_en)`,
    [
      params.practicanteId,
      params.date,
      params.blockStart ? padTime(params.blockStart) : null,
      params.blockEnd ? padTime(params.blockEnd) : null,
      entradaUtc,
      salidaUtc,
      calc.estadoEntrada,
      calc.estadoSalida,
      calc.estadoJornada,
      calc.horasComputadas,
      calc.horasPorJustificar,
      calc.minutosTardanza,
    ],
  );
}

async function insertMarcacion(
  conn: PoolConnection,
  practicanteId: number,
  tipo: 'ENTRADA' | 'SALIDA',
  date: string,
  time: string,
  key: string,
): Promise<boolean> {
  try {
    await conn.query(
      `INSERT INTO marcaciones
        (practicante_id, tipo, contexto, recuperacion_id, marcado_en, origen, idempotency_key)
       VALUES (?, ?, 'REGULAR', NULL, ?, 'migracion', ?)`,
      [practicanteId, tipo, limaToUtcDateTime(date, padTime(time)), key],
    );
    return true;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
}

async function migrateSheetsToMysql(): Promise<void> {
  loadLocalEnv();
  await applyMysqlSchema();

  const google = loadGoogleConfig();
  const mysql = createMysqlPool(loadMysqlConfig());

  const practicantesSheets = new PracticantesSheetsService(google);
  const horariosSheets = new HorariosSheetsService(google);
  const asistenciaSheets = new SheetsService(google);

  await practicantesSheets.ensureSheetExists();
  await horariosSheets.ensureSheetExists();
  await asistenciaSheets.ensureSheetExists();

  const practicanteRows = await practicantesSheets.readAll();
  const { entries: sheetSchedule, errors: scheduleErrors } = parseScheduleRows(
    await horariosSheets.readAll(),
  );
  const attendanceRecords = await asistenciaSheets.readAllRecords();
  const scheduleEntries = mergeSchedules(sheetSchedule, canonicalScheduleEntries());

  if (scheduleErrors.length > 0) {
    logger.warn(`Horarios Sheets: ${scheduleErrors.length} fila(s) inválidas omitidas`);
  }

  logger.info(
    `Origen — practicantes sheet: ${practicanteRows.length}, bloques: ${scheduleEntries.length}, asistencias: ${attendanceRecords.length}`,
  );

  try {
    const stats = await withTransaction(mysql, async (conn) => {
      await conn.query('SET time_zone = "+00:00"');

      const byDiscord = new Map<string, PracticanteRow>();
      const byName = new Map<string, PracticanteRow>();
      let nextCodigo = 1;

      const [existingPracticantes] = await conn.query<RowDataPacket[]>(
        'SELECT id, id_externo_bot, nombres, apellidos FROM practicantes',
      );
      for (const row of existingPracticantes) {
        const full = `${row.nombres} ${row.apellidos}`.replace('—', '').trim();
        const mapped: PracticanteRow = {
          id: Number(row.id),
          discordId: row.id_externo_bot ? String(row.id_externo_bot) : null,
          nombre: full,
        };
        if (mapped.discordId) byDiscord.set(mapped.discordId, mapped);
        byName.set(full.toLowerCase(), mapped);
        nextCodigo += 1;
      }

      const ensurePracticante = async (
        nombre: string,
        discordId: string | null,
        carrera = '',
        ciclo = '',
      ): Promise<PracticanteRow> => {
        if (discordId && byDiscord.has(discordId)) {
          return byDiscord.get(discordId)!;
        }
        const named = byName.get(nombre.trim().toLowerCase());
        if (named) {
          if (discordId && !named.discordId) {
            await conn.query(
              'UPDATE practicantes SET id_externo_bot = ? WHERE id = ?',
              [discordId, named.id],
            );
            named.discordId = discordId;
            byDiscord.set(discordId, named);
          }
          return named;
        }

        const meta = carreraCicloDe(nombre);
        const id = await insertPracticante(conn, {
          codigo: codigoFromIndex(nextCodigo),
          nombre,
          discordId,
          carrera: carrera || meta.carrera,
          ciclo: ciclo || meta.ciclo,
        });
        nextCodigo += 1;
        const created: PracticanteRow = { id, discordId, nombre: nombre.trim() };
        if (discordId) byDiscord.set(discordId, created);
        byName.set(nombre.trim().toLowerCase(), created);
        return created;
      };

      let practicantesCreados = 0;
      for (const row of practicanteRows) {
        const [discordIdRaw, nombre, carrera, ciclo] = row;
        const nombreLimpio = (nombre ?? '').trim();
        if (!nombreLimpio) continue;
        const before = byName.size;
        await ensurePracticante(
          nombreLimpio,
          discordIdRaw?.trim() || null,
          carrera ?? '',
          ciclo ?? '',
        );
        if (byName.size > before) practicantesCreados += 1;
      }

      for (const seed of PRACTICANTES_SCHEDULE) {
        const before = byName.size;
        await ensurePracticante(
          seed.nombre,
          null,
          seed.carrera ?? '',
          seed.ciclo ?? '',
        );
        if (byName.size > before) practicantesCreados += 1;
      }

      const scheduleByName = new Map<string, ScheduleEntry[]>();
      for (const entry of scheduleEntries) {
        const key = entry.nombre.trim().toLowerCase();
        const list = scheduleByName.get(key) ?? [];
        list.push(entry);
        scheduleByName.set(key, list);
        if (entry.discordId) {
          await ensurePracticante(entry.nombre, entry.discordId);
        }
      }

      let horariosCreados = 0;
      let asignacionesCreadas = 0;

      for (const [, entries] of scheduleByName) {
        const sample = entries[0];
        const practicante = await ensurePracticante(
          sample.nombre,
          sample.discordId || null,
        );

        const [existingAsig] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM asignaciones_horario
           WHERE practicante_id = ? AND vigente_hasta IS NULL
           LIMIT 1`,
          [practicante.id],
        );
        if (existingAsig.length > 0) continue;

        const [horarioResult] = await conn.query<ResultSetHeader>(
          `INSERT INTO horarios
            (nombre, limite_horas_semana, tolerancia_entrada_min, adelanto_max_min,
             tolerancia_salida_min, limite_sin_salida_min, refrigerio_min, activo)
           VALUES (?, 30, 5, 60, 30, 180, 0, 1)`,
          [`Horario ${sample.nombre}`],
        );
        const horarioId = horarioResult.insertId;
        horariosCreados += 1;

        const byDay = new Map(entries.map((entry) => [entry.dia, entry]));
        for (let dia = 1; dia <= 7; dia += 1) {
          const block = byDay.get(dia);
          await conn.query(
            `INSERT INTO horario_dias
              (horario_id, dia_semana, hora_entrada, hora_salida, es_laborable)
             VALUES (?, ?, ?, ?, ?)`,
            [
              horarioId,
              dia,
              block ? `${block.start}:00` : null,
              block ? `${block.end}:00` : null,
              block ? 1 : 0,
            ],
          );
        }

        await conn.query(
          `INSERT INTO asignaciones_horario
            (practicante_id, horario_id, vigente_desde, vigente_hasta, creado_por)
           VALUES (?, ?, ?, NULL, ?)`,
          [practicante.id, horarioId, DEFAULT_VIGENCIA, SYSTEM_USER_ID],
        );
        asignacionesCreadas += 1;
      }

      const usernames = new Map<string, string>();
      for (const record of attendanceRecords) {
        if (record.discordId && record.username) {
          usernames.set(record.discordId, record.username);
        }
      }

      let marcaciones = 0;
      let jornadas = 0;
      let omitidas = 0;

      for (const record of attendanceRecords) {
        if (!record.discordId || !record.date || !record.entryTime) {
          omitidas += 1;
          continue;
        }

        const displayName =
          usernames.get(record.discordId) || record.username || record.discordId;
        const practicante = await ensurePracticante(displayName, record.discordId);
        const dia = weekdayFromDate(record.date);
        const block = findBlock(
          scheduleEntries,
          practicante.nombre,
          practicante.discordId,
          dia,
        );

        const insertedEntry = await insertMarcacion(
          conn,
          practicante.id,
          'ENTRADA',
          record.date,
          record.entryTime,
          `migracion:entrada:${record.discordId}:${record.date}`,
        );
        if (insertedEntry) marcaciones += 1;

        if (record.exitTime) {
          const insertedExit = await insertMarcacion(
            conn,
            practicante.id,
            'SALIDA',
            record.date,
            record.exitTime,
            `migracion:salida:${record.discordId}:${record.date}`,
          );
          if (insertedExit) marcaciones += 1;
        }

        await upsertJornada(conn, {
          practicanteId: practicante.id,
          date: record.date,
          entryTime: record.entryTime,
          exitTime: record.exitTime || null,
          blockStart: block?.start ?? null,
          blockEnd: block?.end ?? null,
        });
        jornadas += 1;
      }

      const alreadyByDay = new Set(
        attendanceRecords
          .filter((record) => record.discordId && record.date)
          .map((record) => `${record.discordId}|${record.date}`),
      );

      let semana30 = 0;
      for (const [nameKey, entries] of scheduleByName) {
        const sample = entries[0];
        const practicante = await ensurePracticante(
          sample.nombre,
          sample.discordId || null,
        );
        const identity = practicante.discordId || nameKey;

        for (const date of WEEK_30H_DATES) {
          const block = findBlock(
            entries,
            sample.nombre,
            practicante.discordId,
            weekdayFromDate(date),
          );
          if (!block) continue;

          const alreadyMarked =
            Boolean(practicante.discordId) &&
            alreadyByDay.has(`${practicante.discordId}|${date}`);

          if (!alreadyMarked) {
            const entryKey = `semana30:entrada:${identity}:${date}`;
            const exitKey = `semana30:salida:${identity}:${date}`;
            if (
              await insertMarcacion(
                conn,
                practicante.id,
                'ENTRADA',
                date,
                `${block.start}:00`,
                entryKey,
              )
            ) {
              marcaciones += 1;
            }
            if (
              await insertMarcacion(
                conn,
                practicante.id,
                'SALIDA',
                date,
                `${block.end}:00`,
                exitKey,
              )
            ) {
              marcaciones += 1;
            }
          }

          await upsertJornada(conn, {
            practicanteId: practicante.id,
            date,
            entryTime: `${block.start}:00`,
            exitTime: `${block.end}:00`,
            blockStart: block.start,
            blockEnd: block.end,
          });
          semana30 += 1;
        }
      }

      await conn.query(
        `INSERT INTO auditoria
          (entidad, entidad_id, accion, valor_anterior, valor_nuevo, usuario_id)
         VALUES ('schema_migrations', 1, 'MIGRATE_SHEETS', NULL, ?, ?)`,
        [
          JSON.stringify({
            practicantesCreados,
            horariosCreados,
            asignacionesCreadas,
            marcaciones,
            jornadas,
            omitidas,
            semana30,
          }),
          SYSTEM_USER_ID,
        ],
      );

      return {
        practicantesCreados,
        horariosCreados,
        asignacionesCreadas,
        marcaciones,
        jornadas,
        omitidas,
        semana30,
      };
    });

    const [resumen] = await mysql.query<RowDataPacket[]>(
      `SELECT p.id, CONCAT(p.nombres, ' ', p.apellidos) AS nombre,
              COUNT(j.id) AS jornadas_semana,
              ROUND(SUM(j.horas_computadas), 2) AS horas_semana
       FROM practicantes p
       LEFT JOIN jornadas j
         ON j.practicante_id = p.id
        AND j.fecha BETWEEN '2026-08-17' AND '2026-08-22'
        AND j.contexto = 'REGULAR'
       GROUP BY p.id
       ORDER BY p.id`,
    );
    logger.info('Migración completada:', stats);
    for (const row of resumen) {
      logger.info(
        `  ${row.nombre}: ${row.jornadas_semana} jornadas / ${row.horas_semana ?? 0} h (17–22 ago)`,
      );
    }
  } finally {
    await mysql.end();
  }
}

if (require.main === module) {
  migrateSheetsToMysql().catch((error) => {
    logger.error('Error al migrar Sheets → MySQL:', error);
    process.exit(1);
  });
}
