import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { COMMAND_NAMES } from '../config/constants';
import {
  buildEstadoChangeRow,
  buildStatusEmbed,
  StatusRuntime,
  StatusViewerRole,
} from '../embeds/status.embeds';
import { buildGenericErrorEmbed } from '../embeds/response.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { getTodayDate } from '../utils/date';
import { hasStaffRole } from '../utils/roles';
import { logger } from '../utils/logger';

function resolveRole(
  interaction: ChatInputCommandInteraction,
  adminRoleId?: string,
): StatusViewerRole {
  return hasStaffRole(interaction, adminRoleId) ? 'admin' : 'practicante';
}

const data = new SlashCommandBuilder()
  .setName(COMMAND_NAMES.STATUS)
  .setDescription('Ver el estado del bot');

async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const [estado, dbOk] = await Promise.all([
      context.botStateService.getEstado(true),
      context.botStateService.pingDatabase(),
    ]);
    const role = resolveRole(interaction, context.adminRoleId);
    const runtime: StatusRuntime = {
      latencyMs: Math.max(0, Math.round(interaction.client.ws.ping)),
      uptimeSeconds: process.uptime(),
      dbOk,
      ventanaEntrada: context.scheduleService.getTodayEntryWindow(
        getTodayDate(context.timezone),
      ),
    };

    const components =
      role === 'admin' ? [buildEstadoChangeRow()] : [];

    await interaction.editReply({
      embeds: [buildStatusEmbed(estado, runtime, role)],
      components,
    });
  } catch (error) {
    logger.error('Error en /status:', error);
    await interaction.editReply({
      embeds: [buildGenericErrorEmbed()],
    });
  }
}

export const statusCommand: BotCommand = {
  data,
  execute,
};
