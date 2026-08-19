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
import { AttendanceService } from '../services/attendanceService';
import { isAttendanceError } from '../utils/errors';
import { logger } from '../utils/logger';

async function handleMarcarEntrada(
  interaction: ButtonInteraction,
  attendanceService: AttendanceService,
): Promise<void> {
  const { date, entryTime, status } = await attendanceService.registerEntry(
    interaction.user.id,
    interaction.user.username,
  );

  await interaction.editReply({
    embeds: [buildEntrySuccessEmbed(date, entryTime, status)],
  });
}

async function handleMarcarSalida(
  interaction: ButtonInteraction,
  attendanceService: AttendanceService,
): Promise<void> {
  const { date, exitTime, horasTrabajadas, horasRestantes } =
    await attendanceService.registerExit(interaction.user.id);

  await interaction.editReply({
    embeds: [
      buildExitSuccessEmbed(date, exitTime, horasTrabajadas, horasRestantes),
    ],
  });
}

export function registerButtonHandler(
  client: Client,
  attendanceService: AttendanceService,
): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    if (
      customId !== BUTTON_CUSTOM_IDS.MARCAR_ENTRADA &&
      customId !== BUTTON_CUSTOM_IDS.MARCAR_SALIDA
    ) {
      return;
    }

    try {
      // Ack inmediato: Sheets + dashboard suelen superar el límite de 3s de Discord
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (customId === BUTTON_CUSTOM_IDS.MARCAR_ENTRADA) {
        await handleMarcarEntrada(interaction, attendanceService);
        return;
      }

      await handleMarcarSalida(interaction, attendanceService);
    } catch (error) {
      const embed = isAttendanceError(error)
        ? buildErrorEmbed(error.userMessage)
        : buildGenericErrorEmbed();

      if (!isAttendanceError(error)) {
        logger.error(`Error en botón ${customId}:`, error);
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
        // El estado local de la interacción (deferred/replied) puede quedar
        // desincronizado del servidor si el ack inicial falló por una
        // condición de carrera (10062) pero sí llegó a registrarse en Discord.
        // No dejar que esto tumbe el proceso.
        logger.error(
          `No se pudo responder al botón ${customId} tras un error:`,
          replyError,
        );
      }
    }
  });
}
