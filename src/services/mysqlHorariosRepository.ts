import { Pool, RowDataPacket } from 'mysql2/promise';
import { HorariosRepository } from './scheduleService';

export class MysqlHorariosRepository implements HorariosRepository {
  constructor(private readonly pool: Pool) {}

  async ensureSheetExists(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async readAll(): Promise<string[][]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         p.id_externo_bot AS discord_id,
         TRIM(CONCAT(p.nombres, ' ', p.apellidos)) AS nombre,
         hd.dia_semana AS dia,
         TIME_FORMAT(hd.hora_entrada, '%H:%i') AS hora_inicio,
         TIME_FORMAT(hd.hora_salida, '%H:%i') AS hora_fin
       FROM asignaciones_horario a
       JOIN practicantes p ON p.id = a.practicante_id
       JOIN horario_dias hd ON hd.horario_id = a.horario_id
       WHERE a.vigente_hasta IS NULL
         AND p.estado = 'activo'
         AND p.id_externo_bot IS NOT NULL
         AND hd.es_laborable = 1
         AND hd.hora_entrada IS NOT NULL
         AND hd.hora_salida IS NOT NULL
       ORDER BY p.id, hd.dia_semana`,
    );

    return rows.map((row) => [
      String(row.discord_id),
      String(row.nombre).replace(/\s+—$/, '').trim(),
      String(row.dia),
      String(row.hora_inicio),
      String(row.hora_fin),
    ]);
  }
}
