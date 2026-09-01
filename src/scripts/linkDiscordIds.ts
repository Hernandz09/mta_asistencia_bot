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
] as const;

async function linkDiscordIds(): Promise<void> {
  loadLocalEnv();
  const pool = createMysqlPool(loadMysqlConfig());

  try {
    const ids = LINKS.map((item) => item.discordId);
    await pool.query(
      `UPDATE practicantes
       SET id_externo_bot = NULL
       WHERE id_externo_bot IN (?, ?)
         AND NOT (nombres = 'Kevin' AND apellidos = 'Ludeña')
         AND NOT (nombres = 'Alfredo' AND apellidos = 'Gonzales')`,
      [...ids],
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
