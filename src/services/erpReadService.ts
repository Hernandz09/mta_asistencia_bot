import { Pool, RowDataPacket } from 'mysql2/promise';

export interface ErpPracticante {
  id: number;
  discordId: string | null;
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
  estadoEntrada: string | null;
  estadoSalida: string | null;
  estadoJornada: string;
  horasComputadas: number;
  horasJustificadas: number;
  horasPorJustificar: number;
}

function asDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export class ErpReadService {
  constructor(private readonly pool: Pool) {}

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
    return rows.map((row) => {
      const nombres = String(row.nombres ?? '').trim();
      const apellidos = String(row.apellidos ?? '')
        .replace(/—/g, '')
        .trim();
      return {
        id: Number(row.id),
        discordId: row.id_externo_bot ? String(row.id_externo_bot) : null,
        nombres,
        apellidos,
        nombre: `${nombres} ${apellidos}`.trim(),
        area: String(row.area),
        estado: String(row.estado),
        carrera: row.carrera ? String(row.carrera) : null,
        ciclo: row.ciclo ? String(row.ciclo) : null,
        fechaInicio: asDate(row.fecha_inicio),
      };
    });
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
              horas_computadas, horas_justificadas, horas_por_justificar
       FROM jornadas
       WHERE ${whereSql}
       ORDER BY fecha DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, perPage, (page - 1) * perPage],
    );

    return {
      rows: rows.map((row) => ({
        id: Number(row.id),
        practicanteId: Number(row.practicante_id),
        fecha: asDate(row.fecha) ?? '',
        estadoEntrada: row.estado_entrada ? String(row.estado_entrada) : null,
        estadoSalida: row.estado_salida ? String(row.estado_salida) : null,
        estadoJornada: String(row.estado_jornada),
        horasComputadas: Number(row.horas_computadas ?? 0),
        horasJustificadas: Number(row.horas_justificadas ?? 0),
        horasPorJustificar: Number(row.horas_por_justificar ?? 0),
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      perPage,
    };
  }
}
