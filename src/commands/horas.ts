import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { COMMAND_NAMES, EMBED_COLORS } from '../config/constants';
import { buildErrorEmbed } from '../embeds/response.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { getTodayDate } from '../utils/date';
import {
  formatDurationInput,
  parseDurationToHours,
} from '../utils/duration';
import { hasStaffRole } from '../utils/roles';
import { formatHoursShort } from '../services/statsMath';
import { logger } from '../utils/logger';

const data = new SlashCommandBuilder()
  .setName(COMMAND_NAMES.HORAS)
  .setDescription('Registrar horas extra que suman a la meta semanal')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Agregar horas extra (2h, 2h 30m, 2h 30m 22s)')
      .addStringOption((option) =>
        option
          .setName('tiempo')
          .setDescription('Duración: 2h, 2h 30m o 2h 30m 22s')
          .setRequired(true)
          .setMaxLength(40),
      )
      .addStringOption((option) =>
        option
          .setName('motivo')
          .setDescription('Por qué se agregan (opcional)')
          .setRequired(false)
          .setMaxLength(200),
      )
      .addUserOption((option) =>
        option
          .setName('usuario')
          .setDescription('Practicante (solo encargado / admin)')
          .setRequired(false),
      ),
  );

async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'add') {
    await interaction.reply({
      embeds: [buildErrorEmbed('Usa `/horas add` para cargar horas extra.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!context.extraHoursService) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Las horas extra no están disponibles ahora.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;
  if (
    targetUser.id !== interaction.user.id &&
    !hasStaffRole(interaction, context.adminRoleId)
  ) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden agregar horas extra a otro practicante.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tiempo = interaction.options.getString('tiempo', true);
  const horas = parseDurationToHours(tiempo);
  if (horas == null) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'No entendí el tiempo. Ejemplos: `2h`, `2h 30m`, `2h 30m 22s` (máximo 12 h).',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const practicante = await context.statsService.findPracticanteByDiscord(
    targetUser.id,
  );
  if (!practicante) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          targetUser.id === interaction.user.id
            ? 'No estás registrado como practicante.'
            : 'Ese usuario no está registrado como practicante.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const fecha = getTodayDate(context.timezone);
  const motivo = interaction.options.getString('motivo');

  try {
    await context.extraHoursService.add({
      practicanteId: practicante.id,
      fecha,
      horas,
      motivo,
      creadoPorDiscord: interaction.user.id,
    });
    context.statsService.invalidatePracticante(practicante.id);

    const week = await context.attendanceService.getWeeklySummary(targetUser.id);
    const extraLabel = formatDurationInput(horas);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.SUCCESS)
          .setTitle('Horas extra registradas')
          .setDescription(
            `Se sumaron **${extraLabel}** (${formatHoursShort(horas)} h) ${
              targetUser.id === interaction.user.id
                ? 'a tu acumulado de hoy'
                : `a ${targetUser.username} (hoy)`
            }.`,
          )
          .addFields(
            { name: 'Fecha', value: fecha, inline: true },
            {
              name: 'Esta semana',
              value: `${formatHoursShort(week.horasAcumuladas)} / ${formatHoursShort(week.meta)} h`,
              inline: true,
            },
            ...(motivo
              ? [{ name: 'Motivo', value: motivo, inline: false }]
              : []),
          )
          .setFooter({
            text: 'Aparece en /stats → Ver detalle como Extra',
          }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error('Error en /horas add:', error);
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'No pude guardar las horas extra. Intenta de nuevo en unos minutos.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

export const horasCommand: BotCommand = {
  data,
  execute,
};
