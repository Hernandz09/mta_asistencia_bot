import { Client, Events, MessageFlags } from 'discord.js';
import { asistenciaCommand } from '../commands/asistencia';
import { estadisticasCommand, statsCommand } from '../commands/stats';
import { statusCommand } from '../commands/status';
import { horarioCommand } from '../commands/horario';
import { topCommand } from '../commands/top';
import { buildStatusEmbed } from '../embeds/status.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { getTodayDate } from '../utils/date';
import { hasStaffRole } from '../utils/roles';
import { logger } from '../utils/logger';

const commands: BotCommand[] = [
  asistenciaCommand,
  statsCommand,
  estadisticasCommand,
  statusCommand,
  topCommand,
  horarioCommand,
];

const commandsByName = new Map(
  commands.map((command) => [command.data.name, command]),
);

export function getCommandsData() {
  return commands.map((command) => command.data.toJSON());
}

export function registerCommandHandler(
  client: Client,
  context: CommandContext,
): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandsByName.get(interaction.commandName);
    if (!command) return;

    const isAdmin = hasStaffRole(interaction, context.adminRoleId);
    const { allowed, estado } = await context.botStateService.canRunCommand(
      interaction.commandName,
      isAdmin,
    );

    if (!allowed) {
      await interaction.reply({
        embeds: [
          buildStatusEmbed(estado, {
            latencyMs: Math.max(0, Math.round(interaction.client.ws.ping)),
            uptimeSeconds: process.uptime(),
            dbOk: true,
            ventanaEntrada: context.scheduleService.getTodayEntryWindow(
              getTodayDate(context.timezone),
            ),
          }, isAdmin ? 'admin' : 'practicante'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await command.execute(interaction, context);
    } catch (error) {
      logger.error(`Error no controlado en /${interaction.commandName}:`, error);
    }
  });
}
