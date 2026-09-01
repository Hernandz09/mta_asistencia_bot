import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMysqlConfig } from '../config/mysql';
import { createMysqlPool } from '../services/mysqlClient';
import { logger } from '../utils/logger';
import { loadLocalEnv } from './loadLocalEnv';

function splitSqlStatements(sql: string): string[] {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^--.*$/gm, '');

  return withoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function applyMysqlSchema(): Promise<void> {
  loadLocalEnv();

  const config = loadMysqlConfig();
  const pool = createMysqlPool(config);
  const sqlDir = resolve(process.cwd(), 'docs/sql');
  const sqlFiles = readdirSync(sqlDir)
    .filter((name) => /^\d+_(schema|bot_estado)\.sql$/i.test(name))
    .sort();

  logger.info(
    `Aplicando schema en ${config.host}/${config.database}: ${sqlFiles.join(', ')}`,
  );

  let applied = 0;
  let skipped = 0;

  try {
    for (const fileName of sqlFiles) {
      const statements = splitSqlStatements(
        readFileSync(resolve(sqlDir, fileName), 'utf8'),
      );
      logger.info(`${fileName}: ${statements.length} sentencias`);

      for (const statement of statements) {
        try {
          await pool.query(statement);
          applied += 1;
        } catch (error) {
          const err = error as { code?: string; message?: string };
          const isTriggerPrivilege =
            err.code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' ||
            /TRIGGER|SUPER/i.test(err.message ?? '');

          if (isTriggerPrivilege && /TRIGGER/i.test(statement)) {
            logger.warn(
              'Sin privilegio TRIGGER en Hostinger: marcaciones queda sin candado SQL (la app no debe editarlas).',
            );
            skipped += 1;
            continue;
          }

          throw error;
        }
      }
    }
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = (tables as Record<string, string>[]).map(
      (row) => Object.values(row)[0],
    );

    logger.info(
      `Schema listo. Sentencias OK: ${applied}. Triggers omitidos: ${skipped}.`,
    );
    logger.info(`Tablas: ${tableNames.join(', ')}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  applyMysqlSchema().catch((error) => {
    logger.error('Error al aplicar el schema MySQL:', error);
    process.exit(1);
  });
}

export { applyMysqlSchema };
