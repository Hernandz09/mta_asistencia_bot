import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { EMBED_COLORS } from '../config/constants';
import {
  buildAttendanceStatusEmbed,
  buildErrorEmbed,
  buildGenericErrorEmbed,
  buildUnknownSubcommandEmbed,
  buildWeeklySummaryEmbed,
} from '../embeds/response.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { isAttendanceError } from '../utils/errors';
import { logger } from '../utils/logger';

const data = new SlashCommandBuilder()
  .setName('asistencia')
  .setDescription('Gestión de asistencia de practicantes')
  .addSubcommand((sub) =>
    sub.setName('estado').setDescription('Consultar tu asistencia del día'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('semana')
      .setDescription('Consultar horas acumuladas de la semana en curso')
      .addUserOption((option) =>
        option
          .setName('practicante')
          .setDescription('Practicante a consultar (solo admins)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('recargar')
      .setDescription(
        'Recargar el caché de horarios desde Google Sheets (solo admins)',
      ),
  );

function hasAdminRole(
  interaction: ChatInputCommandInteraction,
  adminRoleId?: string,
): boolean {
  if (!adminRoleId) {
    return false;
  }

  const member = interaction.member;
  if (!member) {
    return false;
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(adminRoleId);
  }

  return member.roles.cache.has(adminRoleId);
}

async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'estado':
        await handleEstado(interaction, context);
        break;
      case 'semana':
        await handleSemana(interaction, context);
        break;
      case 'recargar':
        await handleRecargar(interaction, context);
        break;
      default:
        await interaction.reply({
          embeds: [buildUnknownSubcommandEmbed()],
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (error) {
    if (isAttendanceError(error)) {
      await interaction.reply({
        embeds: [buildErrorEmbed(error.userMessage)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.error(`Error en /asistencia ${subcommand}:`, error);
    await interaction.reply({
      embeds: [buildGenericErrorEmbed()],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleEstado(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const status = await context.attendanceService.getTodayStatus(
    interaction.user.id,
  );

  await interaction.reply({
    embeds: [buildAttendanceStatusEmbed(status)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSemana(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const targetUser =
    interaction.options.getUser('practicante') ?? interaction.user;

  if (
    targetUser.id !== interaction.user.id &&
    !hasAdminRole(interaction, context.adminRoleId)
  ) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'No tienes permiso para consultar las horas de otro practicante.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const summary = await context.attendanceService.getWeeklySummary(
    targetUser.id,
  );

  await interaction.reply({
    embeds: [buildWeeklySummaryEmbed(targetUser.username, summary)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRecargar(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  if (!hasAdminRole(interaction, context.adminRoleId)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('No tienes permiso para ejecutar este comando.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await context.scheduleService.reload();
  const hasErrors = result.errors.length > 0;

  const description = hasErrors
    ? `Se cargaron ${result.loaded} bloque(s). ${result.errors.length} fila(s) con errores (revisa los logs del bot).`
    : `Se cargaron ${result.loaded} bloque(s) sin errores.`;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(hasErrors ? EMBED_COLORS.WARNING : EMBED_COLORS.SUCCESS)
        .setTitle('Horarios recargados')
        .setDescription(description),
    ],
  });
}

export const asistenciaCommand: BotCommand = {
  data,
  execute,
};

export { data, execute };
