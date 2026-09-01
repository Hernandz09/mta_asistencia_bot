import { Client } from 'discord.js';
import { DiscordConfig } from '../config/discord';
import { getCommandsData } from '../handlers/commandHandler';
import { logger } from '../utils/logger';

export async function syncSlashCommands(
  client: Client,
  config: DiscordConfig,
): Promise<void> {
  const commands = getCommandsData();
  const application = client.application;
  if (!application) {
    throw new Error('El cliente de Discord no tiene application lista');
  }

  if (config.guildId) {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.commands.set(commands);
    logger.info(`Slash commands actualizados en el servidor ${config.guildId}`);
    return;
  }

  await application.commands.set(commands);
  logger.info('Slash commands actualizados de forma global');
}
