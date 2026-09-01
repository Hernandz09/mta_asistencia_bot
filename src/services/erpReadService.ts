import { Pool, RowDataPacket } from 'mysql2/promise';
import { BUSINESS_RULES } from '../config/business';
import {
  computeHoursDifference,
  formatLimaIso,
  formatPunchClock,
  getTodayDate,
} from '../utils/date';

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

const MARCACION_ORIGEN: Record<string, string> = {
  bot: 'DISCORD',
  web: 'WEB',
  admin: 'ADMIN',
  migracion: 'MIGRACION',
};

export interface ErpPracticante {
  id: number;
  discordId: string | null;
  discordUsername: string | null;
  nombres: string;
  apellidos: string;
  nombre: string;
  area: string;
  estado: string;
  carrera: string | null;
  ciclo: string | null;
  fechaInicio: string | null;
}

export interface ErpJornada {
  id: number;
  practicanteId: number;
  fecha: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  estadoEntrada: string | null;
  estadoSalida: string | null;
  estadoJornada: string;
  horasComputadas: number;
  horasJustificadas: number;
  horasPorJustificar: number;
}

export interface ErpHorarioBlock {
  day: number;
  dayLabel: string;
  start: string;
  end: string;
  hours: number;
}

export interface ErpHorario {
  practicanteId: number;
  displayName: string;
  weeklyScheduledHours: number;
  blocks: ErpHorarioBlock[];
}

export interface ErpMarcacion {
  id: number;
  practicanteId: number;
  jornadaId: number | null;
  fecha: string;
  tipo: string;
  registradoEn: string;
  horaLocal: string;
  origen: string;
}

function asDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asUtcDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hhmm(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function defaultBlocks(): ErpHorarioBlock[] {
  return [1, 2, 3, 4, 5].map((day) => ({
    day,
    dayLabel: DAY_LABELS[day],
    start: '09:00',
    end: '15:00',
    hours: 6,
  }));
}

export class ErpReadService {
  constructor(
    private readonly pool: Pool,
    private readonly timezone: string,
  ) {}

  async listPracticantes(filters: {
    estado?: string;
    area?: string;
  }): Promise<ErpPracticante[]> {
    const where: string[] = [];
    const values: string[] = [];
    if (filters.estado) {
      where.push('estado = ?');
      values.push(filters.estado);
    }
    if (filters.area) {
      where.push('area = ?');
      values.push(filters.area);
    }
    const sqlWhere = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot, nombres, apellidos, area, estado, carrera, ciclo, fecha_inicio
       FROM practicantes
       ${sqlWhere}
       ORDER BY nombres, apellidos`,
      values,
    );
    return rows.map((row) => this.mapPracticante(row));
  }

  async getPracticanteById(id: number): Promise<ErpPracticante | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot, nombres, apellidos, area, estado, carrera, ciclo, fecha_inicio
       FROM practicantes WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? this.mapPracticante(rows[0]) : null;
  }

  async listJornadas(filters: {
    practicanteId?: number;
    desde?: string;
    hasta?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ rows: ErpJornada[]; total: number; page: number; perPage: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(100, Math.max(1, filters.perPage ?? 50));
    const where: string[] = ["contexto = 'REGULAR'"];
    const values: Array<string | number> = [];

    if (filters.practicanteId) {
      where.push('practicante_id = ?');
      values.push(filters.practicanteId);
    }
    if (filters.desde) {
      where.push('fecha >= ?');
      values.push(filters.desde);
    }
    if (filters.hasta) {
      where.push('fecha <= ?');
      values.push(filters.hasta);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM jornadas WHERE ${whereSql}`,
      values,
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, practicante_id, fecha, estado_entrada, estado_salida, estado_jornada,
              horas_computadas, horas_justificadas, horas_por_justificar,
              entrada_real, salida_real
       FROM jornadas
       WHERE ${whereSql}
       ORDER BY fecha DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, perPage, (page - 1) * perPage],
    );

    return {
      rows: rows.map((row) => {
        const estadoEntrada = row.estado_entrada
          ? String(row.estado_entrada)
          : null;
        const estadoSalida = row.estado_salida
          ? String(row.estado_salida)
          : null;
        return {
          id: Number(row.id),
          practicanteId: Number(row.practicante_id),
          fecha: asDate(row.fecha) ?? '',
          horaEntrada: formatPunchClock(
            asUtcDate(row.entrada_real),
            estadoEntrada,
            ['SIN_MARCA'],
            this.timezone,
          ),
          horaSalida: formatPunchClock(
            asUtcDate(row.salida_real),
            estadoSalida,
            ['SIN_SALIDA'],
            this.timezone,
          ),
          estadoEntrada,
          estadoSalida,
          estadoJornada: String(row.estado_jornada),
          horasComputadas: Number(row.horas_computadas ?? 0),
          horasJustificadas: Number(row.horas_justificadas ?? 0),
          horasPorJustificar: Number(row.horas_por_justificar ?? 0),
        };
      }),
      total: Number(countRows[0]?.total ?? 0),
      page,
      perPage,
    };
  }

  async getHorario(practicanteId: number): Promise<ErpHorario | null> {
    const practicante = await this.getPracticanteById(practicanteId);
    if (!practicante) return null;

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT hd.dia_semana,
              TIME_FORMAT(hd.hora_entrada, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hd.hora_salida, '%H:%i') AS hora_fin,
              hd.es_laborable,
              h.limite_horas_semana
       FROM asignaciones_horario a
       JOIN horarios h ON h.id = a.horario_id
       JOIN horario_dias hd ON hd.horario_id = h.id
       WHERE a.practicante_id = ?
         AND a.vigente_hasta IS NULL
       ORDER BY hd.dia_semana`,
      [practicanteId],
    );

    const laborables = rows.filter(
      (row) =>
        Number(row.es_laborable) === 1 &&
        row.hora_inicio &&
        row.hora_fin,
    );

    const blocks: ErpHorarioBlock[] =
      laborables.length > 0
        ? laborables.map((row) => {
            const start = hhmm(row.hora_inicio) ?? '09:00';
            const end = hhmm(row.hora_fin) ?? '15:00';
            return {
              day: Number(row.dia_semana),
              dayLabel: DAY_LABELS[Number(row.dia_semana)] ?? `Día ${row.dia_semana}`,
              start,
              end,
              hours: computeHoursDifference(start, end),
            };
          })
        : defaultBlocks();

    const weeklyFromDb = Number(rows[0]?.limite_horas_semana);
    const weeklyScheduledHours = Number.isFinite(weeklyFromDb) && weeklyFromDb > 0
      ? weeklyFromDb
      : blocks.reduce((sum, block) => sum + block.hours, 0) ||
        BUSINESS_RULES.weeklyGoalHours;

    return {
      practicanteId,
      displayName: practicante.nombre,
      weeklyScheduledHours,
      blocks,
    };
  }

  async listMarcaciones(filters: {
    practicanteId?: number;
    desde?: string;
    hasta?: string;
    tipo?: string;
    page?: number;
    perPage?: number;
  }): Promise<{
    rows: ErpMarcacion[];
    total: number;
    page: number;
    perPage: number;
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(100, Math.max(1, filters.perPage ?? 50));
    const where: string[] = [];
    const values: Array<string | number> = [];

    if (filters.practicanteId) {
      where.push('m.practicante_id = ?');
      values.push(filters.practicanteId);
    }
    if (filters.tipo === 'ENTRADA' || filters.tipo === 'SALIDA') {
      where.push('m.tipo = ?');
      values.push(filters.tipo);
    }
    if (filters.desde) {
      where.push('DATE(DATE_SUB(m.marcado_en, INTERVAL 5 HOUR)) >= ?');
      values.push(filters.desde);
    }
    if (filters.hasta) {
      where.push('DATE(DATE_SUB(m.marcado_en, INTERVAL 5 HOUR)) <= ?');
      values.push(filters.hasta);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM marcaciones m ${whereSql}`,
      values,
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT m.id, m.practicante_id, m.tipo, m.marcado_en, m.origen, m.contexto,
              j.id AS jornada_id
       FROM marcaciones m
       LEFT JOIN jornadas j
         ON j.practicante_id = m.practicante_id
        AND j.contexto = m.contexto
        AND j.fecha = DATE(DATE_SUB(m.marcado_en, INTERVAL 5 HOUR))
       ${whereSql}
       ORDER BY m.marcado_en DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [...values, perPage, (page - 1) * perPage],
    );

    return {
      rows: rows.map((row) => {
        const marcado = asUtcDate(row.marcado_en) ?? new Date(0);
        return {
          id: Number(row.id),
          practicanteId: Number(row.practicante_id),
          jornadaId: row.jornada_id ? Number(row.jornada_id) : null,
          fecha: getTodayDate(this.timezone, marcado),
          tipo: String(row.tipo),
          registradoEn: formatLimaIso(marcado),
          horaLocal: formatPunchClock(marcado, null, [], this.timezone) ?? '00:00:00',
          origen: MARCACION_ORIGEN[String(row.origen)] ?? String(row.origen).toUpperCase(),
        };
      }),
      total: Number(countRows[0]?.total ?? 0),
      page,
      perPage,
    };
  }

  private mapPracticante(row: RowDataPacket): ErpPracticante {
    const nombres = String(row.nombres ?? '').trim();
    const apellidos = String(row.apellidos ?? '')
      .replace(/—/g, '')
      .trim();
    return {
      id: Number(row.id),
      discordId: row.id_externo_bot ? String(row.id_externo_bot) : null,
      discordUsername: null,
      nombres,
      apellidos,
      nombre: `${nombres} ${apellidos}`.trim(),
      area: String(row.area),
      estado: String(row.estado),
      carrera: row.carrera ? String(row.carrera) : null,
      ciclo: row.ciclo ? String(row.ciclo) : null,
      fechaInicio: asDate(row.fecha_inicio),
    };
  }
}
