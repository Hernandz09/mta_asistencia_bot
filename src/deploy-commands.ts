import { loadConfig } from './config/env';
import { getCommandsData } from './handlers/commandHandler';
import { loadLocalEnv } from './scripts/loadLocalEnv';
import { logger } from './utils/logger';
import { REST, Routes } from 'discord.js';

async function deployCommands(): Promise<void> {
  loadLocalEnv();
  const config = loadConfig();
  const commands = getCommandsData();

  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  if (config.discord.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(
        config.discord.clientId,
        config.discord.guildId,
      ),
      { body: commands },
    );
    logger.info(
      `Comandos registrados en el servidor ${config.discord.guildId}`,
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: commands,
    });
    logger.info('Comandos registrados globalmente');
  }
}

deployCommands().catch((error) => {
  logger.error('Error al registrar comandos:', error);
  process.exit(1);
});
