import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATTENDANCE_STATUS } from '../config/constants';
import { loadGoogleConfig } from '../config/google';
import { HorariosSheetsService } from '../services/horariosSheetsService';
import { PracticantesSheetsService } from '../services/practicantesSheetsService';
import { parseScheduleRows, ScheduleEntry } from '../services/scheduleService';
import { SheetsService } from '../services/sheetsService';
import { logger } from '../utils/logger';
import { loadLocalEnv } from './loadLocalEnv';

const TIMEZONE_OFFSET_HOURS = 5;
const SYSTEM_USER_ID = 1;
const DEFAULT_VIGENCIA = '2026-01-01';

function sqlString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
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
  return utc.toISOString().slice(0, 19).replace('T', ' ');
}

function weekdayFromDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function mapEstadoEntrada(status: string): string {
  if (status === ATTENDANCE_STATUS.PUNTUAL) return 'PUNTUAL';
  if (status === ATTENDANCE_STATUS.TARDANZA) return 'TARDANZA';
  if (status === ATTENDANCE_STATUS.FUERA_DE_HORARIO) return 'FUERA_DE_HORARIO';
  return 'SIN_MARCA';
}

export async function dumpSheetsToSql(): Promise<string> {
  loadLocalEnv();
  const google = loadGoogleConfig();

  const practicantesSheets = new PracticantesSheetsService(google);
  const horariosSheets = new HorariosSheetsService(google);
  const asistenciaSheets = new SheetsService(google);

  await practicantesSheets.ensureSheetExists();
  await horariosSheets.ensureSheetExists();
  await asistenciaSheets.ensureSheetExists();

  const practicanteRows = await practicantesSheets.readAll();
  const { entries: scheduleEntries, errors } = parseScheduleRows(
    await horariosSheets.readAll(),
  );
  const attendanceRecords = await asistenciaSheets.readAllRecords();

  if (errors.length > 0) {
    logger.warn(`Horarios: ${errors.length} fila(s) inválidas omitidas`);
  }

  type Person = {
    id: number;
    nombre: string;
    discordId: string | null;
    carrera: string;
    ciclo: string;
  };

  const people: Person[] = [];
  const byDiscord = new Map<string, Person>();
  const byName = new Map<string, Person>();

  const addPerson = (
    nombre: string,
    discordId: string | null,
    carrera = '',
    ciclo = '',
  ): Person => {
    if (discordId && byDiscord.has(discordId)) {
      return byDiscord.get(discordId)!;
    }
    const named = byName.get(nombre.trim().toLowerCase());
    if (named) {
      if (discordId && !named.discordId) {
        named.discordId = discordId;
        byDiscord.set(discordId, named);
      }
      return named;
    }
    const person: Person = {
      id: people.length + 1,
      nombre: nombre.trim(),
      discordId,
      carrera,
      ciclo,
    };
    people.push(person);
    if (discordId) byDiscord.set(discordId, person);
    byName.set(person.nombre.toLowerCase(), person);
    return person;
  };

  for (const row of practicanteRows) {
    const [discordIdRaw, nombre, carrera, ciclo] = row;
    if (!nombre?.trim()) continue;
    addPerson(nombre.trim(), discordIdRaw?.trim() || null, carrera ?? '', ciclo ?? '');
  }

  const scheduleByName = new Map<string, ScheduleEntry[]>();
  for (const entry of scheduleEntries) {
    addPerson(entry.nombre, entry.discordId || null);
    const key = entry.nombre.trim().toLowerCase();
    const list = scheduleByName.get(key) ?? [];
    list.push(entry);
    scheduleByName.set(key, list);
  }

  for (const record of attendanceRecords) {
    if (!record.discordId) continue;
    addPerson(record.username || record.discordId, record.discordId);
  }

  const lines: string[] = [
    '-- Datos migrados desde Google Sheets (ESPEC-ASIS-001 Fase 1)',
    '-- Generado automáticamente. No editar a mano.',
    'SET NAMES utf8mb4;',
    'SET time_zone = "+00:00";',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  for (const person of people) {
    const { nombres, apellidos } = splitNombre(person.nombre);
    const codigo = `PRAC-${String(person.id).padStart(3, '0')}`;
    lines.push(
      `INSERT INTO practicantes (id, codigo, nombres, apellidos, area, estado, id_externo_bot, carrera, ciclo, encargado_id)
VALUES (${person.id}, ${sqlString(codigo)}, ${sqlString(nombres)}, ${sqlString(apellidos)}, 'software', 'activo', ${sqlString(person.discordId)}, ${sqlString(person.carrera || null)}, ${sqlString(person.ciclo || null)}, ${SYSTEM_USER_ID})
ON DUPLICATE KEY UPDATE nombres=VALUES(nombres), apellidos=VALUES(apellidos), id_externo_bot=VALUES(id_externo_bot), carrera=VALUES(carrera), ciclo=VALUES(ciclo);`,
    );
  }

  let horarioId = 0;
  const horarioOfPerson = new Map<number, number>();
  for (const person of people) {
    const blocks = scheduleByName.get(person.nombre.toLowerCase());
    if (!blocks || blocks.length === 0) continue;
    horarioId += 1;
    horarioOfPerson.set(person.id, horarioId);
    lines.push(
      `INSERT INTO horarios (id, nombre, limite_horas_semana, tolerancia_entrada_min, adelanto_max_min, tolerancia_salida_min, limite_sin_salida_min, refrigerio_min, activo)
VALUES (${horarioId}, ${sqlString(`Horario ${person.nombre}`)}, 30, 5, 60, 30, 180, 0, 1)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);`,
    );
    const byDay = new Map(blocks.map((block) => [block.dia, block]));
    for (let dia = 1; dia <= 7; dia += 1) {
      const block = byDay.get(dia);
      lines.push(
        `INSERT INTO horario_dias (horario_id, dia_semana, hora_entrada, hora_salida, es_laborable)
VALUES (${horarioId}, ${dia}, ${sqlString(block ? `${block.start}:00` : null)}, ${sqlString(block ? `${block.end}:00` : null)}, ${block ? 1 : 0})
ON DUPLICATE KEY UPDATE hora_entrada=VALUES(hora_entrada), hora_salida=VALUES(hora_salida), es_laborable=VALUES(es_laborable);`,
      );
    }
    lines.push(
      `INSERT INTO asignaciones_horario (practicante_id, horario_id, vigente_desde, vigente_hasta, creado_por)
SELECT ${person.id}, ${horarioId}, ${sqlString(DEFAULT_VIGENCIA)}, NULL, ${SYSTEM_USER_ID}
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM asignaciones_horario
  WHERE practicante_id = ${person.id} AND vigente_hasta IS NULL
);`,
    );
  }

  let marcaciones = 0;
  let jornadas = 0;
  let omitidas = 0;

  for (const record of attendanceRecords) {
    if (!record.discordId || !record.date || !record.entryTime) {
      omitidas += 1;
      continue;
    }
    const person = byDiscord.get(record.discordId);
    if (!person) {
      omitidas += 1;
      continue;
    }

    const entradaUtc = limaToUtcDateTime(record.date, record.entryTime);
    lines.push(
      `INSERT IGNORE INTO marcaciones (practicante_id, tipo, contexto, recuperacion_id, marcado_en, origen, idempotency_key)
VALUES (${person.id}, 'ENTRADA', 'REGULAR', NULL, ${sqlString(entradaUtc)}, 'migracion', ${sqlString(`migracion:entrada:${record.discordId}:${record.date}`)});`,
    );
    marcaciones += 1;

    let salidaUtc: string | null = null;
    if (record.exitTime) {
      salidaUtc = limaToUtcDateTime(record.date, record.exitTime);
      lines.push(
        `INSERT IGNORE INTO marcaciones (practicante_id, tipo, contexto, recuperacion_id, marcado_en, origen, idempotency_key)
VALUES (${person.id}, 'SALIDA', 'REGULAR', NULL, ${sqlString(salidaUtc)}, 'migracion', ${sqlString(`migracion:salida:${record.discordId}:${record.date}`)});`,
      );
      marcaciones += 1;
    }

    const schedule = scheduleEntries.find(
      (entry) =>
        entry.discordId === record.discordId &&
        entry.dia === weekdayFromDate(record.date),
    );
    const incompleto = record.status === ATTENDANCE_STATUS.INCOMPLETO;
    const estadoEntrada = incompleto ? 'SIN_MARCA' : mapEstadoEntrada(record.status);
    const estadoSalida = incompleto
      ? 'SIN_SALIDA'
      : record.exitTime
        ? 'PUNTUAL'
        : null;
    const estadoJornada = record.exitTime || incompleto ? 'CERRADA' : 'ABIERTA';

    lines.push(
      `INSERT INTO jornadas
        (practicante_id, fecha, contexto, recuperacion_id, hora_entrada_programada, hora_salida_programada,
         entrada_real, salida_real, estado_entrada, estado_salida, estado_jornada,
         horas_computadas, horas_por_justificar, horas_justificadas, minutos_tardanza, recalculado_en)
VALUES (${person.id}, ${sqlString(record.date)}, 'REGULAR', NULL, ${sqlString(schedule ? `${schedule.start}:00` : null)}, ${sqlString(schedule ? `${schedule.end}:00` : null)},
        ${sqlString(entradaUtc)}, ${sqlString(salidaUtc)}, ${sqlString(estadoEntrada)}, ${sqlString(estadoSalida)}, ${sqlString(estadoJornada)},
        ${record.horasTrabajadas ?? 0}, 0, 0, 0, UTC_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  entrada_real=VALUES(entrada_real), salida_real=VALUES(salida_real),
  estado_entrada=VALUES(estado_entrada), estado_salida=VALUES(estado_salida),
  estado_jornada=VALUES(estado_jornada), horas_computadas=VALUES(horas_computadas),
  recalculado_en=VALUES(recalculado_en);`,
    );
    jornadas += 1;
  }

  lines.push(
    `INSERT INTO auditoria (entidad, entidad_id, accion, valor_anterior, valor_nuevo, usuario_id)
VALUES ('schema_migrations', 1, 'MIGRATE_SHEETS', NULL, ${sqlString(
      JSON.stringify({
        practicantes: people.length,
        horarios: horarioId,
        marcaciones,
        jornadas,
        omitidas,
      }),
    )}, ${SYSTEM_USER_ID});`,
    'SET FOREIGN_KEY_CHECKS = 1;',
  );

  const sql = `${lines.join('\n')}\n`;
  const outPath = resolve(process.cwd(), 'docs/sql/002_migracion_datos.sql');
  mkdirSync(resolve(process.cwd(), 'docs/sql'), { recursive: true });
  writeFileSync(outPath, sql, 'utf8');

  logger.info(
    `Dump SQL escrito en docs/sql/002_migracion_datos.sql — practicantes=${people.length} horarios=${horarioId} marcaciones=${marcaciones} jornadas=${jornadas} omitidas=${omitidas}`,
  );
  return outPath;
}

if (require.main === module) {
  dumpSheetsToSql().catch((error) => {
    logger.error('Error al generar SQL de migración:', error);
    process.exit(1);
  });
}
