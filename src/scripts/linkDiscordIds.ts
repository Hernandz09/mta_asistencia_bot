import { loadMysqlConfig } from '../config/mysql';
import { createMysqlPool } from '../services/mysqlClient';
import { logger } from '../utils/logger';
import { loadLocalEnv } from './loadLocalEnv';

const LINKS = [
  {
    nombres: 'Kevin',
    apellidos: 'Ludeña',
    discordId: '755905757190553667',
  },
  {
    nombres: 'Alfredo',
    apellidos: 'Gonzales',
    discordId: '777320698795655178',
  },
  {
    nombres: 'Diego',
    apellidos: 'Galarza',
    discordId: '637326275425599511',
  },
  {
    nombres: 'Deivyd',
    apellidos: 'Saul',
    discordId: '728636011797544990',
  },
] as const;

async function linkDiscordIds(): Promise<void> {
  loadLocalEnv();
  const pool = createMysqlPool(loadMysqlConfig());

  try {
    const ids = LINKS.map((item) => item.discordId);
    const placeholders = ids.map(() => '?').join(', ');
    const keepOwners = LINKS.map(
      () => 'NOT (nombres = ? AND apellidos = ?)',
    ).join(' AND ');
    await pool.query(
      `UPDATE practicantes
       SET id_externo_bot = NULL
       WHERE id_externo_bot IN (${placeholders})
         AND ${keepOwners}`,
      [...ids, ...LINKS.flatMap((item) => [item.nombres, item.apellidos])],
    );

    for (const link of LINKS) {
      const [result] = await pool.query(
        `UPDATE practicantes
         SET id_externo_bot = ?, estado = 'activo'
         WHERE nombres = ? AND apellidos = ?`,
        [link.discordId, link.nombres, link.apellidos],
      );
      logger.info(
        `${link.nombres} ${link.apellidos} → ${link.discordId}`,
        result,
      );
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  linkDiscordIds().catch((error) => {
    logger.error('Error al vincular Discord IDs:', error);
    process.exit(1);
  });
}
