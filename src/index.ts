import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config/env';
import { registerReadyWithInit } from './events/ready';
import { registerButtonHandler } from './handlers/buttonHandler';
import { registerCommandHandler } from './handlers/commandHandler';
import { loadLocalEnv } from './scripts/loadLocalEnv';
import { AttendanceService } from './services/attendanceService';
import { BotStateService } from './services/botStateService';
import { startBotApiServer } from './http/apiServer';
import { createMysqlPool } from './services/mysqlClient';
import { MysqlHorariosRepository } from './services/mysqlHorariosRepository';
import { ScheduleService } from './services/scheduleService';
import { SheetsService } from './services/sheetsService';
import { ConfigService } from './services/configService';
import { ErpReadService } from './services/erpReadService';
import { StatsService } from './services/statsService';
import { CommandContext } from './types/command.type';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  loadLocalEnv();
  const config = loadConfig();
  const pool = createMysqlPool(config.mysql);
  const scheduleService = new ScheduleService(
    new MysqlHorariosRepository(pool),
  );
  const sheetsService = config.google
    ? new SheetsService(config.google)
    : null;
  const attendanceService = new AttendanceService(
    config,
    scheduleService,
    pool,
    sheetsService,
  );
  const configService = new ConfigService(pool);
  const erpReadService = new ErpReadService(pool);
  const statsService = new StatsService(pool, config.timezone, configService);
  const botStateService = new BotStateService(pool);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const commandContext: CommandContext = {
    attendanceService,
    scheduleService,
    statsService,
    botStateService,
    adminRoleId: config.discord.adminRoleId,
    timezone: config.timezone,
  };

  registerReadyWithInit(
    client,
    attendanceService,
    scheduleService,
    botStateService,
    config,
  );
  registerCommandHandler(client, commandContext);
  registerButtonHandler(client, commandContext);

  const apiKey =
    process.env.BOT_API_KEY?.trim() ||
    process.env.ATTENDANCE_BOT_API_KEY?.trim();
  const port = Number(process.env.PORT ?? 3000);
  startBotApiServer({
    port,
    apiKey,
    client,
    botStateService,
    statsService,
    configService,
    erpReadService,
    startedAt: Date.now(),
  });

  await client.login(config.discord.token);
}

main().catch((error) => {
  logger.error('Error fatal al iniciar el bot:', error);
  process.exit(1);
});
