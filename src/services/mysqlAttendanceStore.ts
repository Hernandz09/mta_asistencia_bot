import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ToleranceConfig, SPEC_TOLERANCES } from './jornadaRules';

export interface MysqlPracticante {
  id: number;
  discordId: string;
  nombre: string;
}

export interface MysqlJornada {
  id: number;
  practicanteId: number;
  discordId: string;
  fecha: string;
  horaEntradaProgramada: string | null;
  horaSalidaProgramada: string | null;
  entradaReal: Date | null;
  salidaReal: Date | null;
  estadoEntrada: string | null;
  estadoSalida: string | null;
  estadoJornada: string;
  horasComputadas: number;
  horasPorJustificar: number;
}

export class MysqlAttendanceStore {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async findPracticanteByDiscord(
    discordId: string,
  ): Promise<MysqlPracticante | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot AS discordId,
              TRIM(CONCAT(nombres, ' ', REPLACE(apellidos, '—', ''))) AS nombre
       FROM practicantes
       WHERE id_externo_bot = ? AND estado = 'activo'
       LIMIT 1`,
      [discordId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      discordId: String(row.discordId),
      nombre: String(row.nombre).trim(),
    };
  }

  async findTodayJornada(
    practicanteId: number,
    date: string,
  ): Promise<MysqlJornada | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT j.id, j.practicante_id, p.id_externo_bot AS discord_id, j.fecha,
              j.hora_entrada_programada, j.hora_salida_programada,
              j.entrada_real, j.salida_real, j.estado_entrada, j.estado_salida,
              j.estado_jornada, j.horas_computadas, j.horas_por_justificar
       FROM jornadas j
       JOIN practicantes p ON p.id = j.practicante_id
       WHERE j.practicante_id = ? AND j.fecha = ? AND j.contexto = 'REGULAR'
       LIMIT 1`,
      [practicanteId, date],
    );
    return rows[0] ? this.mapJornada(rows[0]) : null;
  }

  async findOpenJornadasForDate(date: string): Promise<MysqlJornada[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT j.id, j.practicante_id, p.id_externo_bot AS discord_id, j.fecha,
              j.hora_entrada_programada, j.hora_salida_programada,
              j.entrada_real, j.salida_real, j.estado_entrada, j.estado_salida,
              j.estado_jornada, j.horas_computadas, j.horas_por_justificar
       FROM jornadas j
       JOIN practicantes p ON p.id = j.practicante_id
       WHERE j.fecha = ?
         AND j.contexto = 'REGULAR'
         AND j.estado_jornada = 'ABIERTA'
         AND j.entrada_real IS NOT NULL
         AND j.salida_real IS NULL`,
      [date],
    );
    return rows.map((row) => this.mapJornada(row));
  }

  async getToleranceConfig(practicanteId: number): Promise<ToleranceConfig> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT h.tolerancia_entrada_min, h.adelanto_max_min, h.tolerancia_salida_min,
              h.limite_sin_salida_min, h.refrigerio_min
       FROM asignaciones_horario a
       JOIN horarios h ON h.id = a.horario_id
       WHERE a.practicante_id = ? AND a.vigente_hasta IS NULL
       LIMIT 1`,
      [practicanteId],
    );
    const row = rows[0];
    if (!row) return SPEC_TOLERANCES;
    return {
      toleranciaEntradaMin: Number(row.tolerancia_entrada_min),
      adelantoMaxMin: Number(row.adelanto_max_min),
      toleranciaSalidaMin: Number(row.tolerancia_salida_min),
      limiteSinSalidaMin: Number(row.limite_sin_salida_min),
      refrigerioMin: Number(row.refrigerio_min),
    };
  }

  async getWeeklyGoalHours(practicanteId: number): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT h.limite_horas_semana
       FROM asignaciones_horario a
       JOIN horarios h ON h.id = a.horario_id
       WHERE a.practicante_id = ? AND a.vigente_hasta IS NULL
       LIMIT 1`,
      [practicanteId],
    );
    return rows[0] ? Number(rows[0].limite_horas_semana) : 30;
  }

  async getEarliestAttendanceDate(practicanteId: number): Promise<string> {
    const [[configRows], [pracRows]] = await Promise.all([
      this.pool.query<RowDataPacket[]>(
        `SELECT valor FROM config_sistema
         WHERE clave = 'asistencia.fecha_inicio' LIMIT 1`,
      ),
      this.pool.query<RowDataPacket[]>(
        `SELECT fecha_inicio FROM practicantes WHERE id = ? LIMIT 1`,
        [practicanteId],
      ),
    ]);
    const global = configRows[0]?.valor
      ? String(configRows[0].valor).slice(0, 10)
      : '2026-08-17';
    const own = pracRows[0]?.fecha_inicio
      ? pracRows[0].fecha_inicio instanceof Date
        ? pracRows[0].fecha_inicio.toISOString().slice(0, 10)
        : String(pracRows[0].fecha_inicio).slice(0, 10)
      : null;
    return own && own > global ? own : global;
  }

  async sumHorasSemana(
    practicanteId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ROUND(
          COALESCE(SUM(horas_computadas + horas_justificadas), 0)
          + COALESCE((
              SELECT SUM(horas)
              FROM horas_extra
              WHERE practicante_id = ?
                AND fecha BETWEEN ? AND ?
            ), 0)
        , 2) AS total
       FROM jornadas
       WHERE practicante_id = ?
         AND fecha BETWEEN ? AND ?
         AND contexto = 'REGULAR'
         AND estado_jornada NOT IN ('NO_LABORABLE', 'VACACIONES', 'LICENCIA')`,
      [practicanteId, startDate, endDate, practicanteId, startDate, endDate],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async insertMarcacion(params: {
    practicanteId: number;
    tipo: 'ENTRADA' | 'SALIDA';
    marcadoEnUtc: Date;
    idempotencyKey: string;
  }): Promise<void> {
    await this.pool.query<ResultSetHeader>(
      `INSERT INTO marcaciones
        (practicante_id, tipo, contexto, recuperacion_id, marcado_en, origen, idempotency_key)
       VALUES (?, ?, 'REGULAR', NULL, ?, 'bot', ?)`,
      [
        params.practicanteId,
        params.tipo,
        params.marcadoEnUtc,
        params.idempotencyKey,
      ],
    );
  }

  async upsertJornada(params: {
    practicanteId: number;
    fecha: string;
    horaEntradaProgramada: string | null;
    horaSalidaProgramada: string | null;
    entradaRealUtc: Date | null;
    salidaRealUtc: Date | null;
    estadoEntrada: string | null;
    estadoSalida: string | null;
    estadoJornada: string;
    horasComputadas: number;
    horasPorJustificar: number;
    minutosTardanza: number;
  }): Promise<void> {
    await this.pool.query(
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
        params.fecha,
        params.horaEntradaProgramada,
        params.horaSalidaProgramada,
        params.entradaRealUtc,
        params.salidaRealUtc,
        params.estadoEntrada,
        params.estadoSalida,
        params.estadoJornada,
        params.horasComputadas,
        params.horasPorJustificar,
        params.minutosTardanza,
      ],
    );
  }

  private mapJornada(row: RowDataPacket): MysqlJornada {
    const fecha =
      row.fecha instanceof Date
        ? row.fecha.toISOString().slice(0, 10)
        : String(row.fecha).slice(0, 10);
    return {
      id: Number(row.id),
      practicanteId: Number(row.practicante_id),
      discordId: row.discord_id ? String(row.discord_id) : '',
      fecha,
      horaEntradaProgramada: row.hora_entrada_programada
        ? String(row.hora_entrada_programada)
        : null,
      horaSalidaProgramada: row.hora_salida_programada
        ? String(row.hora_salida_programada)
        : null,
      entradaReal: row.entrada_real ? new Date(row.entrada_real) : null,
      salidaReal: row.salida_real ? new Date(row.salida_real) : null,
      estadoEntrada: row.estado_entrada ? String(row.estado_entrada) : null,
      estadoSalida: row.estado_salida ? String(row.estado_salida) : null,
      estadoJornada: String(row.estado_jornada),
      horasComputadas: Number(row.horas_computadas ?? 0),
      horasPorJustificar: Number(row.horas_por_justificar ?? 0),
    };
  }
}
