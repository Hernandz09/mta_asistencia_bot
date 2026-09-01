import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { MysqlConfig } from '../config/mysql';
import { logger } from '../utils/logger';

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ETIMEDOUT',
  'EPIPE',
]);

function isTransientMysqlError(error: unknown): boolean {
  const err = error as { code?: string };
  return Boolean(err.code && TRANSIENT_CODES.has(err.code));
}

export function createMysqlPool(config: MysqlConfig): Pool {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 25_000,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    timezone: 'Z',
    charset: 'utf8mb4',
    connectTimeout: 20_000,
  });

  const originalQuery = pool.query.bind(pool) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  pool.query = (async (...args: unknown[]) => {
    try {
      return await originalQuery(...args);
    } catch (error) {
      if (!isTransientMysqlError(error)) {
        throw error;
      }
      logger.warn(
        `MySQL reconectando tras ${(error as { code?: string }).code}`,
      );
      return originalQuery(...args);
    }
  }) as typeof pool.query;

  const ping = setInterval(() => {
    pool.query('SELECT 1').catch(() => undefined);
  }, 25_000);
  ping.unref();

  return pool;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
