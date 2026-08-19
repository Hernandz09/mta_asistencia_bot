import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config/env';
import { registerReadyWithInit } from './events/ready';
import { registerButtonHandler } from './handlers/buttonHandler';
import { registerCommandHandler } from './handlers/commandHandler';
import { AttendanceService } from './services/attendanceService';
import { HorariosSheetsService } from './services/horariosSheetsService';
import { ScheduleService } from './services/scheduleService';
import { CommandContext } from './types/command.type';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();

  const horariosSheetsService = new HorariosSheetsService(config.google);
  const scheduleService = new ScheduleService(horariosSheetsService);
  const attendanceService = new AttendanceService(config, scheduleService);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const commandContext: CommandContext = {
    attendanceService,
    scheduleService,
    adminRoleId: config.discord.adminRoleId,
  };

  registerReadyWithInit(client, attendanceService, scheduleService, config);
  registerCommandHandler(client, commandContext);
  registerButtonHandler(client, attendanceService);

  await client.login(config.discord.token);
}

main().catch((error) => {
  logger.error('Error fatal al iniciar el bot:', error);
  process.exit(1);
});
