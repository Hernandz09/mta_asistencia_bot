import { RowDataPacket } from 'mysql2/promise';
import { loadMysqlConfig } from '../config/mysql';
import { createMysqlPool } from '../services/mysqlClient';
import { logger } from '../utils/logger';
import { loadLocalEnv } from './loadLocalEnv';

async function verifyMysqlMigration(): Promise<void> {
  loadLocalEnv();
  const pool = createMysqlPool(loadMysqlConfig());

  try {
    const [cleanup] = await pool.query(
      `UPDATE jornadas j
       JOIN practicantes p ON p.id = j.practicante_id
       JOIN asignaciones_horario a
         ON a.practicante_id = p.id AND a.vigente_hasta IS NULL
       JOIN horario_dias hd
         ON hd.horario_id = a.horario_id
        AND hd.dia_semana = WEEKDAY(j.fecha) + 1
       SET j.estado_jornada = 'NO_LABORABLE',
           j.horas_computadas = 0,
           j.horas_por_justificar = 0,
           j.recalculado_en = UTC_TIMESTAMP(3)
       WHERE j.fecha BETWEEN '2026-08-17' AND '2026-08-22'
         AND j.contexto = 'REGULAR'
         AND hd.es_laborable = 0`,
    );
    logger.info('Días no laborables de la semana 17–22 marcados:', cleanup);

    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM practicantes) AS practicantes,
         (SELECT COUNT(*) FROM horarios) AS horarios,
         (SELECT COUNT(*) FROM horario_dias WHERE es_laborable = 1) AS bloques,
         (SELECT COUNT(*) FROM marcaciones) AS marcaciones,
         (SELECT COUNT(*) FROM jornadas) AS jornadas`,
    );
    logger.info('Totales:', counts[0]);

    const [estados] = await pool.query<RowDataPacket[]>(
      `SELECT estado_entrada, estado_salida, estado_jornada, COUNT(*) AS n
       FROM jornadas
       GROUP BY estado_entrada, estado_salida, estado_jornada
       ORDER BY n DESC`,
    );
    logger.info('Estados (motor de tolerancias):');
    for (const row of estados) {
      logger.info(
        `  entrada=${row.estado_entrada} salida=${row.estado_salida} jornada=${row.estado_jornada} → ${row.n}`,
      );
    }

    const [semana] = await pool.query<RowDataPacket[]>(
      `SELECT CONCAT(p.nombres, ' ', p.apellidos) AS nombre,
              p.carrera, p.ciclo,
              COUNT(j.id) AS dias,
              ROUND(SUM(j.horas_computadas), 2) AS horas
       FROM practicantes p
       LEFT JOIN jornadas j
         ON j.practicante_id = p.id
        AND j.fecha BETWEEN '2026-08-17' AND '2026-08-22'
        AND j.contexto = 'REGULAR'
        AND j.estado_jornada <> 'NO_LABORABLE'
       GROUP BY p.id
       HAVING horas > 0 OR nombre IN ('Kevin Ludeña', 'Alfredo Gonzales')
       ORDER BY nombre`,
    );
    logger.info('Semana 17–22 ago (sin días no laborables):');
    for (const row of semana) {
      logger.info(
        `  ${row.nombre} [${row.carrera ?? '—'} ${row.ciclo ?? ''}] ${row.dias}d / ${row.horas}h`,
      );
    }

    const [kevin] = await pool.query<RowDataPacket[]>(
      `SELECT hd.dia_semana, hd.hora_entrada, hd.hora_salida, hd.es_laborable
       FROM practicantes p
       JOIN asignaciones_horario a ON a.practicante_id = p.id AND a.vigente_hasta IS NULL
       JOIN horario_dias hd ON hd.horario_id = a.horario_id
       WHERE p.nombres = 'Kevin' AND p.apellidos = 'Ludeña'
       ORDER BY hd.dia_semana`,
    );
    logger.info('Horario Kevin Ludeña:', kevin);

    const [alfredo] = await pool.query<RowDataPacket[]>(
      `SELECT hd.dia_semana, hd.hora_entrada, hd.hora_salida, hd.es_laborable
       FROM practicantes p
       JOIN asignaciones_horario a ON a.practicante_id = p.id AND a.vigente_hasta IS NULL
       JOIN horario_dias hd ON hd.horario_id = a.horario_id
       WHERE p.nombres = 'Alfredo' AND p.apellidos = 'Gonzales'
       ORDER BY hd.dia_semana`,
    );
    logger.info('Horario Alfredo Gonzales:', alfredo);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  verifyMysqlMigration().catch((error) => {
    logger.error('Error al verificar migración:', error);
    process.exit(1);
  });
}
