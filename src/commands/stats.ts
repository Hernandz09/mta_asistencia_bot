import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import { COMMAND_NAMES, StatsPeriod } from '../config/constants';
import {
  buildStatsButtons,
  buildStatsEmbed,
  statsTargetFromUser,
} from '../embeds/stats.embeds';
import {
  buildErrorEmbed,
} from '../embeds/response.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { hasStaffRole } from '../utils/roles';
import { logger } from '../utils/logger';

function buildData(name: string, description: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addUserOption((option) =>
      option
        .setName('usuario')
        .setDescription('Practicante a consultar (solo encargado / admin)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('periodo')
        .setDescription('Rango de las estadísticas')
        .setRequired(false)
        .addChoices(
          { name: 'Esta semana', value: 'semana' },
          { name: 'Este mes', value: 'mes' },
          { name: 'Histórico', value: 'total' },
        ),
    );
}

function memberDisplayName(
  interaction: ChatInputCommandInteraction,
  user: User,
): string | null {
  const member = interaction.guild?.members.cache.get(user.id);
  if (member instanceof GuildMember) {
    return member.displayName;
  }
  return null;
}

export async function executeStats(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;
  const periodo = (interaction.options.getString('periodo') ??
    'mes') as StatsPeriod;

  if (
    targetUser.id !== interaction.user.id &&
    !hasStaffRole(interaction, context.adminRoleId)
  ) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden consultar estadísticas de otros practicantes.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const resumen = await context.statsService.getResumen(
      targetUser.id,
      periodo,
    );

    if (!resumen) {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            targetUser.id === interaction.user.id
              ? 'No estás registrado como practicante. Solicita tu registro a tu encargado.'
              : 'Ese usuario no está registrado como practicante.',
          ),
        ],
      });
      return;
    }

    const target = statsTargetFromUser(
      targetUser,
      memberDisplayName(interaction, targetUser),
    );
    const canPublish = targetUser.id === interaction.user.id;

    await interaction.editReply({
      embeds: [buildStatsEmbed(target, resumen)],
      components: [buildStatsButtons(targetUser.id, periodo, canPublish)],
    });
  } catch (error) {
    logger.error('Error en /stats:', error);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude obtener tus estadísticas ahora. Intenta en unos minutos.',
        ),
      ],
    });
  }
}

const statsData = buildData(
  COMMAND_NAMES.STATS,
  'Ver tus estadísticas de asistencia',
);

const estadisticasData = buildData(
  COMMAND_NAMES.ESTADISTICAS,
  'Ver tus estadísticas de asistencia (espejo de /stats)',
);

export const statsCommand: BotCommand = {
  data: statsData,
  execute: executeStats,
};

export const estadisticasCommand: BotCommand = {
  data: estadisticasData,
  execute: executeStats,
};
