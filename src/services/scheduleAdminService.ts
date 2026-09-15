import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { PRACTICANTE_AREAS } from '../config/constants';
import { computeHoursDifference } from '../utils/date';
import { logger } from '../utils/logger';
import { ScheduleService } from './scheduleService';

const DAY_LABELS = [
  '',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const SEED_FLAG = 'seed.kiara_yasumy_sabado';
const KIARA_DISCORD_ID = '743334334613946380';

export const YASUMY_KIARA_DAYS: AdminDayInput[] = [
  { day: 1, start: '12:00', end: '18:00', laborable: true },
  { day: 2, start: null, end: null, laborable: false },
  { day: 3, start: '09:00', end: '15:00', laborable: true },
  { day: 4, start: '09:00', end: '15:00', laborable: true },
  { day: 5, start: '09:00', end: '15:00', laborable: true },
  { day: 6, start: '12:00', end: '18:00', laborable: true },
  { day: 7, start: null, end: null, laborable: false },
];

export interface AdminDayInput {
  day: number;
  start: string | null;
  end: string | null;
  laborable: boolean;
}

export interface AdminDay extends AdminDayInput {
  dayLabel: string;
  hours: number;
}

export interface AdminPracticanteRow {
  id: number;
  codigo: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  discordId: string | null;
  area: string;
  estado: string;
  carrera: string | null;
  ciclo: string | null;
  fechaInicio: string | null;
  horarioId: number | null;
  weeklyScheduledHours: number;
  days: AdminDay[];
}

export class ScheduleAdminError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleAdminError';
  }
}

function asDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function hhmm(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function toTimeSql(value: string | null): string | null {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export function normalizeDays(raw: unknown): AdminDay[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ScheduleAdminError(400, 'dias debe ser una lista de lunes a domingo.');
  }

  const byDay = new Map<number, AdminDayInput>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const day = Number(row.day ?? row.dia_semana);
    if (!Number.isInteger(day) || day < 1 || day > 7) continue;
    const laborable = Boolean(
      row.laborable ?? row.es_laborable ?? row.start ?? row.hora_entrada,
    );
    const start = hhmm(
      typeof row.start === 'string'
        ? row.start
        : typeof row.hora_entrada === 'string'
          ? row.hora_entrada
          : null,
    );
    const end = hhmm(
      typeof row.end === 'string'
        ? row.end
        : typeof row.hora_salida === 'string'
          ? row.hora_salida
          : null,
    );
    if (laborable) {
      if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end)) {
        throw new ScheduleAdminError(
          400,
          `El día ${day} necesita hora de entrada y salida (HH:MM).`,
        );
      }
      if (computeHoursDifference(start, end) <= 0) {
        throw new ScheduleAdminError(
          400,
          `El día ${day} tiene salida igual o anterior a la entrada.`,
        );
      }
      if (computeHoursDifference(start, end) > 12) {
        throw new ScheduleAdminError(400, `El día ${day} no puede pasar de 12 h.`);
      }
    }
    byDay.set(day, {
      day,
      start: laborable ? start : null,
      end: laborable ? end : null,
      laborable,
    });
  }

  return [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const item = byDay.get(day) ?? {
      day,
      start: null,
      end: null,
      laborable: false,
    };
    const hours =
      item.laborable && item.start && item.end
        ? computeHoursDifference(item.start, item.end)
        : 0;
    return {
      ...item,
      dayLabel: DAY_LABELS[day],
      hours,
    };
  });
}

export class ScheduleAdminService {
  constructor(
    private readonly pool: Pool,
    private readonly scheduleService?: ScheduleService,
  ) {}

  async ensureKiaraYasumySaturday(): Promise<void> {
    const [flags] = await this.pool.query<RowDataPacket[]>(
      'SELECT valor FROM config_sistema WHERE clave = ? LIMIT 1',
      [SEED_FLAG],
    );
    if (String(flags[0]?.valor ?? '') === '1') {
      return;
    }

    const yasumy = await this.findByName('Yasumy', 'Pastor');
    if (yasumy) {
      await this.saveHorario(yasumy.id, YASUMY_KIARA_DAYS, 30);
    }

    const kiara = await this.ensurePracticante({
      nombres: 'Kiara',
      apellidos: 'Reyes',
      discordId: KIARA_DISCORD_ID,
      area: 'software',
      estado: 'activo',
    });
    await this.saveHorario(kiara.id, YASUMY_KIARA_DAYS, 30);

    await this.pool.query(
      `INSERT INTO config_sistema (clave, valor, descripcion)
       VALUES (?, '1', 'Kiara Reyes + sábado 12:00-18:00 para Yasumy y Kiara')
       ON DUPLICATE KEY UPDATE valor = '1'`,
      [SEED_FLAG],
    );
    logger.info('Horario Yasumy/Kiara listo: sábado 12:00-18:00');
  }

  async list(): Promise<AdminPracticanteRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.id, p.codigo, p.nombres, p.apellidos, p.area, p.estado,
              p.id_externo_bot, p.carrera, p.ciclo, p.fecha_inicio,
              a.horario_id, h.limite_horas_semana
       FROM practicantes p
       LEFT JOIN asignaciones_horario a
         ON a.practicante_id = p.id AND a.vigente_hasta IS NULL
       LEFT JOIN horarios h ON h.id = a.horario_id
       ORDER BY p.estado = 'activo' DESC, p.nombres, p.apellidos`,
    );
    const result: AdminPracticanteRow[] = [];
    for (const row of rows) {
      result.push(await this.hydrate(row));
    }
    return result;
  }

  async getById(id: number): Promise<AdminPracticanteRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.id, p.codigo, p.nombres, p.apellidos, p.area, p.estado,
              p.id_externo_bot, p.carrera, p.ciclo, p.fecha_inicio,
              a.horario_id, h.limite_horas_semana
       FROM practicantes p
       LEFT JOIN asignaciones_horario a
         ON a.practicante_id = p.id AND a.vigente_hasta IS NULL
       LEFT JOIN horarios h ON h.id = a.horario_id
       WHERE p.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  async ensurePracticante(params: {
    nombres: string;
    apellidos: string;
    discordId?: string | null;
    area?: string;
    estado?: string;
    carrera?: string | null;
    ciclo?: string | null;
    fechaInicio?: string | null;
  }): Promise<AdminPracticanteRow> {
    const nombres = params.nombres.trim();
    const apellidos = params.apellidos.trim();
    if (!nombres || !apellidos) {
      throw new ScheduleAdminError(400, 'nombres y apellidos son obligatorios.');
    }

    if (params.discordId) {
      await this.pool.query(
        `UPDATE practicantes
         SET id_externo_bot = NULL
         WHERE id_externo_bot = ?
           AND NOT (nombres = ? AND apellidos = ?)`,
        [params.discordId, nombres, apellidos],
      );
    }

    const existing =
      (params.discordId
        ? await this.findByDiscord(params.discordId)
        : null) ?? (await this.findByName(nombres, apellidos));

    if (existing) {
      await this.pool.query(
        `UPDATE practicantes
         SET nombres = ?, apellidos = ?, id_externo_bot = COALESCE(?, id_externo_bot),
             area = COALESCE(?, area), estado = COALESCE(?, estado),
             carrera = COALESCE(?, carrera), ciclo = COALESCE(?, ciclo)
         WHERE id = ?`,
        [
          nombres,
          apellidos,
          params.discordId ?? null,
          params.area ?? null,
          params.estado ?? null,
          params.carrera ?? null,
          params.ciclo ?? null,
          existing.id,
        ],
      );
      const updated = await this.getById(existing.id);
      if (!updated) throw new ScheduleAdminError(500, 'No se pudo actualizar el practicante.');
      return updated;
    }

    const area = params.area ?? 'software';
    if (!(PRACTICANTE_AREAS as readonly string[]).includes(area)) {
      throw new ScheduleAdminError(400, `Área inválida: ${area}.`);
    }

    const codigo = await this.nextCodigo();
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO practicantes
         (codigo, nombres, apellidos, area, estado, id_externo_bot, carrera, ciclo, fecha_inicio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigo,
        nombres,
        apellidos,
        area,
        params.estado ?? 'activo',
        params.discordId ?? null,
        params.carrera ?? null,
        params.ciclo ?? null,
        params.fechaInicio ?? new Date().toISOString().slice(0, 10),
      ],
    );
    const created = await this.getById(result.insertId);
    if (!created) throw new ScheduleAdminError(500, 'No se pudo crear el practicante.');
    return created;
  }

  async saveHorario(
    practicanteId: number,
    daysInput: unknown,
    limiteHorasSemana?: number,
  ): Promise<AdminPracticanteRow> {
    const practicante = await this.getById(practicanteId);
    if (!practicante) {
      throw new ScheduleAdminError(404, 'Practicante no encontrado.');
    }
    const days = normalizeDays(daysInput);
    const weekly = days.reduce((sum, day) => sum + day.hours, 0);
    const limite =
      limiteHorasSemana && limiteHorasSemana > 0 ? limiteHorasSemana : weekly || 30;

    const horarioId = await this.dedicatedHorarioId(
      practicanteId,
      practicante.horarioId,
      `${practicante.nombre}`,
      limite,
    );

    for (const day of days) {
      await this.pool.query(
        `INSERT INTO horario_dias (horario_id, dia_semana, hora_entrada, hora_salida, es_laborable)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           hora_entrada = VALUES(hora_entrada),
           hora_salida = VALUES(hora_salida),
           es_laborable = VALUES(es_laborable)`,
        [
          horarioId,
          day.day,
          toTimeSql(day.start),
          toTimeSql(day.end),
          day.laborable ? 1 : 0,
        ],
      );
    }
    await this.pool.query(
      `UPDATE horarios SET limite_horas_semana = ?, nombre = ? WHERE id = ?`,
      [limite, `Horario ${practicante.nombre}`, horarioId],
    );

    await this.scheduleService?.reload();
    const saved = await this.getById(practicanteId);
    if (!saved) throw new ScheduleAdminError(500, 'No se pudo leer el horario guardado.');
    return saved;
  }

  private async dedicatedHorarioId(
    practicanteId: number,
    currentHorarioId: number | null,
    nombre: string,
    limite: number,
  ): Promise<number> {
    if (currentHorarioId) {
      const [share] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM asignaciones_horario
         WHERE horario_id = ? AND vigente_hasta IS NULL`,
        [currentHorarioId],
      );
      if (Number(share[0]?.total ?? 0) <= 1) {
        return currentHorarioId;
      }
      await this.pool.query(
        `UPDATE asignaciones_horario
         SET vigente_hasta = CURDATE()
         WHERE practicante_id = ? AND vigente_hasta IS NULL`,
        [practicanteId],
      );
    }

    const [created] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO horarios (nombre, limite_horas_semana, activo)
       VALUES (?, ?, 1)`,
      [`Horario ${nombre}`, limite],
    );
    await this.pool.query(
      `INSERT INTO asignaciones_horario (practicante_id, horario_id, vigente_desde, vigente_hasta)
       VALUES (?, ?, CURDATE(), NULL)`,
      [practicanteId, created.insertId],
    );
    return created.insertId;
  }

  private async hydrate(row: RowDataPacket): Promise<AdminPracticanteRow> {
    const horarioId = row.horario_id ? Number(row.horario_id) : null;
    const days = horarioId
      ? await this.loadDays(horarioId)
      : normalizeDays(
          [1, 2, 3, 4, 5, 6, 7].map((day) => ({
            day,
            start: null,
            end: null,
            laborable: false,
          })),
        );
    const nombres = String(row.nombres ?? '').trim();
    const apellidos = String(row.apellidos ?? '').replace(/—/g, '').trim();
    const weeklyFromDb = Number(row.limite_horas_semana);
    const weekly =
      Number.isFinite(weeklyFromDb) && weeklyFromDb > 0
        ? weeklyFromDb
        : days.reduce((sum, day) => sum + day.hours, 0) || 30;
    return {
      id: Number(row.id),
      codigo: String(row.codigo),
      nombres,
      apellidos,
      nombre: `${nombres} ${apellidos}`.trim(),
      discordId: row.id_externo_bot ? String(row.id_externo_bot) : null,
      area: String(row.area),
      estado: String(row.estado),
      carrera: row.carrera ? String(row.carrera) : null,
      ciclo: row.ciclo ? String(row.ciclo) : null,
      fechaInicio: asDate(row.fecha_inicio),
      horarioId,
      weeklyScheduledHours: weekly,
      days,
    };
  }

  private async loadDays(horarioId: number): Promise<AdminDay[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT dia_semana,
              TIME_FORMAT(hora_entrada, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hora_salida, '%H:%i') AS hora_fin,
              es_laborable
       FROM horario_dias
       WHERE horario_id = ?
       ORDER BY dia_semana`,
      [horarioId],
    );
    return normalizeDays(
      [1, 2, 3, 4, 5, 6, 7].map((day) => {
        const row = rows.find((item) => Number(item.dia_semana) === day);
        return {
          day,
          start: row?.hora_inicio ? String(row.hora_inicio) : null,
          end: row?.hora_fin ? String(row.hora_fin) : null,
          laborable: Number(row?.es_laborable ?? 0) === 1,
        };
      }),
    );
  }

  private async findByName(
    nombres: string,
    apellidos: string,
  ): Promise<{ id: number } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id FROM practicantes
       WHERE nombres = ? AND apellidos = ?
       LIMIT 1`,
      [nombres, apellidos],
    );
    return rows[0] ? { id: Number(rows[0].id) } : null;
  }

  private async findByDiscord(discordId: string): Promise<{ id: number } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id FROM practicantes WHERE id_externo_bot = ? LIMIT 1`,
      [discordId],
    );
    return rows[0] ? { id: Number(rows[0].id) } : null;
  }

  private async nextCodigo(): Promise<string> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT codigo FROM practicantes WHERE codigo LIKE 'PRAC-%'`,
    );
    let max = 0;
    for (const row of rows) {
      const match = String(row.codigo).match(/^PRAC-(\d+)$/i);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `PRAC-${String(max + 1).padStart(3, '0')}`;
  }
}
