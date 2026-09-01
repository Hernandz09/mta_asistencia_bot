import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { logger } from '../utils/logger';

export interface ExtraHoursRow {
  fecha: string;
  horas: number;
  motivo: string | null;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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
        KEY ix_horas_extra_prac_fecha (practicante_id, fecha),
        CONSTRAINT fk_horas_extra_practicante
          FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('Tabla horas_extra lista');
  }

  async add(params: {
    practicanteId: number;
    fecha: string;
    horas: number;
    motivo?: string | null;
    creadoPorDiscord?: string | null;
  }): Promise<number> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO horas_extra
         (practicante_id, fecha, horas, motivo, origen, creado_por_discord)
       VALUES (?, ?, ?, ?, 'bot', ?)`,
      [
        params.practicanteId,
        params.fecha,
        params.horas,
        params.motivo?.trim() || null,
        params.creadoPorDiscord ?? null,
      ],
    );
    return result.insertId;
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
      `SELECT fecha, horas, motivo
       FROM horas_extra
       WHERE practicante_id = ? AND fecha BETWEEN ? AND ?
       ORDER BY fecha, id`,
      [practicanteId, startDate, endDate],
    );
    return rows.map((row) => ({
      fecha: asDateString(row.fecha),
      horas: Number(row.horas ?? 0),
      motivo: row.motivo ? String(row.motivo) : null,
    }));
  }
}
