import {
  ButtonInteraction,
  Client,
  Events,
  MessageFlags,
} from 'discord.js';
import { BUTTON_CUSTOM_IDS } from '../config/constants';
import {
  buildEntrySuccessEmbed,
  buildErrorEmbed,
  buildExitSuccessEmbed,
  buildGenericErrorEmbed,
} from '../embeds/response.embeds';
import { buildStatusEmbed } from '../embeds/status.embeds';
import {
  handleStatsButton,
  handleStatsSelect,
  handleStatusSelect,
  handleTopButton,
  handleTopSelect,
} from './componentHandler';
import { CommandContext } from '../types/command.type';
import { hasStaffRole } from '../utils/roles';
import { isAttendanceError } from '../utils/errors';
import { logger } from '../utils/logger';

async function handleMarcarEntrada(
  interaction: ButtonInteraction,
  context: CommandContext,
): Promise<void> {
  const { date, entryTime, status } = await context.attendanceService.registerEntry(
    interaction.user.id,
    interaction.user.username,
  );

  await interaction.editReply({
    embeds: [buildEntrySuccessEmbed(date, entryTime, status)],
  });
}

async function handleMarcarSalida(
  interaction: ButtonInteraction,
  context: CommandContext,
): Promise<void> {
  const { date, exitTime, horasTrabajadas, horasRestantes } =
    await context.attendanceService.registerExit(interaction.user.id);

  await interaction.editReply({
    embeds: [
      buildExitSuccessEmbed(date, exitTime, horasTrabajadas, horasRestantes),
    ],
  });
}

export function registerButtonHandler(
  client: Client,
  context: CommandContext,
): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isStringSelectMenu()) {
        if (await handleTopSelect(interaction, context)) return;
        if (await handleStatsSelect(interaction, context)) return;
        if (await handleStatusSelect(interaction, context)) return;
        return;
      }

      if (!interaction.isButton()) return;

      if (await handleTopButton(interaction, context)) return;
      if (await handleStatsButton(interaction, context)) return;

      const { customId } = interaction;
      if (
        customId !== BUTTON_CUSTOM_IDS.MARCAR_ENTRADA &&
        customId !== BUTTON_CUSTOM_IDS.MARCAR_SALIDA
      ) {
        return;
      }

      const isAdmin = hasStaffRole(interaction, context.adminRoleId);
      const { allowed, estado } = await context.botStateService.canMark(
        isAdmin,
      );
      if (!allowed) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              estado,
              {
                latencyMs: Math.max(0, Math.round(interaction.client.ws.ping)),
                uptimeSeconds: process.uptime(),
                dbOk: true,
                ventanaEntrada: null,
              },
              'practicante',
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (customId === BUTTON_CUSTOM_IDS.MARCAR_ENTRADA) {
        await handleMarcarEntrada(interaction, context);
        return;
      }

      await handleMarcarSalida(interaction, context);
    } catch (error) {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return;
      }

      const embed = isAttendanceError(error)
        ? buildErrorEmbed(error.userMessage)
        : buildGenericErrorEmbed();

      if (!isAttendanceError(error)) {
        logger.error(
          `Error en componente ${'customId' in interaction ? interaction.customId : ''}:`,
          error,
        );
      }

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error(
          'No se pudo responder al componente tras un error:',
          replyError,
        );
      }
    }
  });
}
