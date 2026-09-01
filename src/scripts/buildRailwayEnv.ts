import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalEnv } from './loadLocalEnv';
import { logger } from '../utils/logger';

const ROOT = process.cwd();
const PUBLIC_API_URL = 'https://mtaasistenciabot-production.up.railway.app';

const REQUIRED = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'ATTENDANCE_CHANNEL_ID',
  'DISCORD_GUILD_ID',
  'ADMIN_ROLE_ID',
  'TIMEZONE',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_SSL',
] as const;

const OPTIONAL = [
  'GOOGLE_SHEETS_ID',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
] as const;

function quote(value: string): string {
  if (/[\n\r#"']/.test(value) || value.includes(' ')) {
    return JSON.stringify(value);
  }
  return value;
}

function appendIfMissing(filePath: string, key: string, value: string): void {
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  if (new RegExp(`^${key}=`, 'm').test(current)) {
    return;
  }
  const suffix = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  writeFileSync(filePath, `${current}${suffix}${key}=${quote(value)}\n`, 'utf8');
}

function buildRailwayEnv(): void {
  loadLocalEnv();

  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables locales: ${missing.join(', ')}`);
  }

  let apiKey = process.env.BOT_API_KEY?.trim();
  if (!apiKey) {
    apiKey = randomBytes(32).toString('hex');
  }

  const lines: string[] = [
    '# Importar en Railway → Variables → RAW Editor',
    '# No incluir PORT: Railway lo asigna solo.',
    `PUBLIC_API_URL=${PUBLIC_API_URL}`,
    `BOT_API_KEY=${apiKey}`,
  ];

  for (const key of REQUIRED) {
    lines.push(`${key}=${quote(process.env[key]!.trim())}`);
  }

  for (const key of OPTIONAL) {
    const value = process.env[key]?.trim();
    if (value) {
      lines.push(`${key}=${quote(value)}`);
    }
  }

  const outPath = resolve(ROOT, '.env.railway');
  writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

  const localEnv = existsSync(resolve(ROOT, '.env'))
    ? resolve(ROOT, '.env')
    : resolve(ROOT, 'env');
  appendIfMissing(localEnv, 'BOT_API_KEY', apiKey);
  appendIfMissing(localEnv, 'PUBLIC_API_URL', PUBLIC_API_URL);

  logger.info(`Listo: ${outPath}`);
  logger.info('BOT_API_KEY y PUBLIC_API_URL también quedaron en tu .env local.');
}

buildRailwayEnv();
