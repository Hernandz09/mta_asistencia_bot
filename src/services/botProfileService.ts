import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { Client } from 'discord.js';
import { BOT_AVATAR_FILENAME } from '../config/branding';
import { logger } from '../utils/logger';

const HASH_DIR = '.data';
const HASH_FILE = 'avatar.sha256';

function resolveAvatarPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../assets/img', BOT_AVATAR_FILENAME),
    path.join(process.cwd(), 'assets/img', BOT_AVATAR_FILENAME),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function hashPath(): string {
  return path.join(process.cwd(), HASH_DIR, HASH_FILE);
}

async function readStoredHash(): Promise<string | null> {
  try {
    return (await readFile(hashPath(), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

async function writeStoredHash(hash: string): Promise<void> {
  const dir = path.join(process.cwd(), HASH_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(hashPath(), hash, 'utf8');
}

export async function syncBotAvatar(client: Client): Promise<void> {
  const user = client.user;
  if (!user) return;

  const filePath = resolveAvatarPath();
  if (!filePath) {
    logger.warn(
      `No se encontró ${BOT_AVATAR_FILENAME}. El avatar animado no se actualizó.`,
    );
    return;
  }

  const buffer = await readFile(filePath);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if ((await readStoredHash()) === hash) {
    logger.info('Avatar del bot ya está sincronizado.');
    return;
  }

  await user.setAvatar(buffer);
  await writeStoredHash(hash);
  logger.info(`Avatar animado aplicado (${BOT_AVATAR_FILENAME}).`);
}
