import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carga `env` (credenciales actuales) y `.env` (MySQL y overrides). */
export function loadLocalEnv(): void {
  const root = process.cwd();
  const legacyEnv = resolve(root, 'env');
  const dotEnv = resolve(root, '.env');

  if (existsSync(legacyEnv)) {
    config({ path: legacyEnv });
  }
  if (existsSync(dotEnv)) {
    config({ path: dotEnv, override: true });
  }
}
