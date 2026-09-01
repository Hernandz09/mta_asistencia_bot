import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import { COMMAND_NAMES } from '../config/constants';
import { buildHorarioEmbed } from '../embeds/horario.embeds';
import { buildErrorEmbed } from '../embeds/response.embeds';
import { BotCommand, CommandContext } from '../types/command.type';
import { getTodayDate, getWeekdayNumber } from '../utils/date';
import { hasStaffRole } from '../utils/roles';
import { logger } from '../utils/logger';

function memberDisplayName(
  interaction: ChatInputCommandInteraction,
  user: User,
): string {
  const member = interaction.guild?.members.cache.get(user.id);
  if (member instanceof GuildMember && member.displayName) {
    return member.displayName;
  }
  return user.globalName || user.displayName || user.username;
}

export async function executeHorario(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;

  if (
    targetUser.id !== interaction.user.id &&
    !hasStaffRole(interaction, context.adminRoleId)
  ) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden consultar el horario de otros practicantes.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const schedule = context.scheduleService.getWeeklySchedule(targetUser.id);
  if (!schedule) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          targetUser.id === interaction.user.id
            ? 'No tienes un horario asignado. Pide a tu encargado que vincule tu Discord.'
            : 'Ese usuario no tiene un horario asignado.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const todayWeekday = getWeekdayNumber(getTodayDate(context.timezone));
  await interaction.reply({
    embeds: [
      buildHorarioEmbed(
        targetUser,
        memberDisplayName(interaction, targetUser),
        schedule,
        todayWeekday,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

const data = new SlashCommandBuilder()
  .setName(COMMAND_NAMES.HORARIO)
  .setDescription('Ver tu horario semanal de prácticas')
  .addUserOption((option) =>
    option
      .setName('usuario')
      .setDescription('Practicante a consultar (solo encargado / admin)')
      .setRequired(false),
  );

async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  try {
    await executeHorario(interaction, context);
  } catch (error) {
    logger.error('Error en /horario:', error);
    if (interaction.replied || interaction.deferred) {
      return;
    }
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'No pude mostrar el horario ahora. Intenta en unos minutos.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

export const horarioCommand: BotCommand = {
  data,
  execute,
};
