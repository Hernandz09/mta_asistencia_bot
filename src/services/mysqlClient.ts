import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { MysqlConfig } from '../config/mysql';

export function createMysqlPool(config: MysqlConfig): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 8,
    enableKeepAlive: true,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    timezone: 'Z',
    charset: 'utf8mb4',
    connectTimeout: 20000,
  });
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
