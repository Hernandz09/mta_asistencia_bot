export interface MysqlConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${key}`);
  }
  return value;
}

export function loadMysqlConfig(): MysqlConfig {
  return {
    host: requireEnv('MYSQL_HOST').trim(),
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: requireEnv('MYSQL_DATABASE').trim(),
    user: requireEnv('MYSQL_USER').trim(),
    password: requireEnv('MYSQL_PASSWORD'),
    ssl: (process.env.MYSQL_SSL ?? 'true').toLowerCase() !== 'false',
  };
}
