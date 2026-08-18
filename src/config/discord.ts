function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${key}`);
  }
  return value;
}

export interface DiscordConfig {
  token: string;
  clientId: string;
  attendanceChannelId: string;
  guildId?: string;
  adminRoleId?: string;
}

export function loadDiscordConfig(): DiscordConfig {
  return {
    token: requireEnv('DISCORD_TOKEN').trim(),
    clientId: requireEnv('DISCORD_CLIENT_ID').trim(),
    attendanceChannelId: requireEnv('ATTENDANCE_CHANNEL_ID').trim(),
    guildId: process.env.DISCORD_GUILD_ID?.trim(),
    adminRoleId: process.env.ADMIN_ROLE_ID?.trim(),
  };
}
