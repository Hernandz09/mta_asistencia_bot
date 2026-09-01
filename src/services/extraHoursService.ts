import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { logger } from '../utils/logger';

export const EXTRA_HOURS_DAY_CAP = 12;

export interface ExtraHoursRow {
  id: number;
  fecha: string;
  horas: number;
  motivo: string | null;
}

export class ExtraHoursError extends Error {
  constructor(
    public readonly code: 'DAY_CAP' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ExtraHoursError';
  }
}

function asDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function mapRow(row: RowDataPacket): ExtraHoursRow {
  return {
    id: Number(row.id ?? 0),
    fecha: asDateString(row.fecha),
    horas: Number(row.horas ?? 0),
    motivo: row.motivo ? String(row.motivo) : null,
  };
}

export function combineExtraHours(current: number, added: number): number | null {
  const next = Math.round((current + added) * 100) / 100;
  if (next <= 0 || next > EXTRA_HOURS_DAY_CAP) {
    return null;
  }
  return next;
}

export class ExtraHoursService {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS horas_extra (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        practicante_id BIGINT UNSIGNED NOT NULL,
        fecha DATE NOT NULL,
        horas DECIMAL(6, 2) NOT NULL,
        motivo VARCHAR(400) NULL,
        origen VARCHAR(32) NOT NULL DEFAULT 'bot',
        creado_por_discord VARCHAR(32) NULL,
        creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_horas_extra_prac_fecha (practicante_id, fecha),
        CONSTRAINT fk_horas_extra_practicante
          FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.mergeDuplicateDays();
    await this.ensureUniqueDayIndex();
    logger.info('Tabla horas_extra lista');
  }

  async findByDate(
    practicanteId: number,
    fecha: string,
  ): Promise<ExtraHoursRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, fecha, horas, motivo
       FROM horas_extra
       WHERE practicante_id = ? AND fecha = ?
       ORDER BY id
       LIMIT 1`,
      [practicanteId, fecha],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Suma horas extra a un día. Si ya había extra, las acumula sin tocar la jornada. */
  async add(params: {
    practicanteId: number;
    fecha: string;
    horas: number;
    motivo?: string | null;
    creadoPorDiscord?: string | null;
  }): Promise<ExtraHoursRow> {
    const current = await this.findByDate(params.practicanteId, params.fecha);
    const nextHours = combineExtraHours(current?.horas ?? 0, params.horas);
    if (nextHours == null) {
      throw new ExtraHoursError(
        'DAY_CAP',
        `Ese día no puede pasar de ${EXTRA_HOURS_DAY_CAP} h extra.`,
      );
    }
    const motivo = params.motivo?.trim() || current?.motivo || null;
    return this.upsert({
      practicanteId: params.practicanteId,
      fecha: params.fecha,
      horas: nextHours,
      motivo,
      creadoPorDiscord: params.creadoPorDiscord,
    });
  }

  /** Reemplaza el extra de ese día. No cambia puntual / tardanza / falta. */
  async set(params: {
    practicanteId: number;
    fecha: string;
    horas: number;
    motivo?: string | null;
    creadoPorDiscord?: string | null;
  }): Promise<ExtraHoursRow> {
    if (params.horas > EXTRA_HOURS_DAY_CAP) {
      throw new ExtraHoursError(
        'DAY_CAP',
        `Ese día no puede pasar de ${EXTRA_HOURS_DAY_CAP} h extra.`,
      );
    }
    const current = await this.findByDate(params.practicanteId, params.fecha);
    return this.upsert({
      practicanteId: params.practicanteId,
      fecha: params.fecha,
      horas: params.horas,
      motivo:
        params.motivo !== undefined
          ? params.motivo?.trim() || null
          : current?.motivo ?? null,
      creadoPorDiscord: params.creadoPorDiscord,
    });
  }

  async remove(
    practicanteId: number,
    fecha: string,
  ): Promise<ExtraHoursRow | null> {
    const current = await this.findByDate(practicanteId, fecha);
    if (!current) return null;
    await this.pool.query(
      `DELETE FROM horas_extra WHERE practicante_id = ? AND fecha = ?`,
      [practicanteId, fecha],
    );
    return current;
  }

  async sumBetween(
    practicanteId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    const [rows] = startDate && endDate
      ? await this.pool.query<RowDataPacket[]>(
          `SELECT ROUND(COALESCE(SUM(horas), 0), 2) AS total
           FROM horas_extra
           WHERE practicante_id = ? AND fecha BETWEEN ? AND ?`,
          [practicanteId, startDate, endDate],
        )
      : await this.pool.query<RowDataPacket[]>(
          `SELECT ROUND(COALESCE(SUM(horas), 0), 2) AS total
           FROM horas_extra
           WHERE practicante_id = ?`,
          [practicanteId],
        );
    return Number(rows[0]?.total ?? 0);
  }

  async listBetween(
    practicanteId: number,
    startDate: string,
    endDate: string,
  ): Promise<ExtraHoursRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, fecha, horas, motivo
       FROM horas_extra
       WHERE practicante_id = ? AND fecha BETWEEN ? AND ?
       ORDER BY fecha, id`,
      [practicanteId, startDate, endDate],
    );
    return rows.map((row) => mapRow(row));
  }

  private async upsert(params: {
    practicanteId: number;
    fecha: string;
    horas: number;
    motivo?: string | null;
    creadoPorDiscord?: string | null;
  }): Promise<ExtraHoursRow> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `DELETE FROM horas_extra WHERE practicante_id = ? AND fecha = ?`,
        [params.practicanteId, params.fecha],
      );
      await conn.query<ResultSetHeader>(
        `INSERT INTO horas_extra
           (practicante_id, fecha, horas, motivo, origen, creado_por_discord)
         VALUES (?, ?, ?, ?, 'bot', ?)`,
        [
          params.practicanteId,
          params.fecha,
          params.horas,
          params.motivo ?? null,
          params.creadoPorDiscord ?? null,
        ],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const saved = await this.findByDate(params.practicanteId, params.fecha);
    if (!saved) {
      throw new Error('No se pudo guardar el extra de ese día');
    }
    return saved;
  }

  private async mergeDuplicateDays(): Promise<void> {
    const [groups] = await this.pool.query<RowDataPacket[]>(
      `SELECT practicante_id, fecha, MIN(id) AS keep_id, SUM(horas) AS total
       FROM horas_extra
       GROUP BY practicante_id, fecha
       HAVING COUNT(*) > 1`,
    );
    for (const group of groups) {
      const keepId = Number(group.keep_id);
      const total = Math.min(
        EXTRA_HOURS_DAY_CAP,
        Math.round(Number(group.total ?? 0) * 100) / 100,
      );
      await this.pool.query(
        `UPDATE horas_extra SET horas = ? WHERE id = ?`,
        [total, keepId],
      );
      await this.pool.query(
        `DELETE FROM horas_extra
         WHERE practicante_id = ? AND fecha = ? AND id <> ?`,
        [Number(group.practicante_id), asDateString(group.fecha), keepId],
      );
    }
  }

  private async ensureUniqueDayIndex(): Promise<void> {
    try {
      await this.pool.query(
        `ALTER TABLE horas_extra
           ADD UNIQUE KEY uq_horas_extra_prac_fecha (practicante_id, fecha)`,
      );
    } catch (error) {
      const code = (error as { errno?: number }).errno;
      if (code === 1061 || code === 1062) {
        return;
      }
      throw error;
    }
  }
}
