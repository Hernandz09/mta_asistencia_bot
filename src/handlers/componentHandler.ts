import {
  ButtonInteraction,
  GuildMember,
  MessageFlags,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import {
  STATS_CUSTOM_IDS,
  STATUS_CUSTOM_IDS,
  StatsPeriod,
} from '../config/constants';
import {
  buildErrorEmbed,
  buildGenericErrorEmbed,
} from '../embeds/response.embeds';
import {
  buildPeriodSelect,
  buildStatsButtons,
  buildStatsDetailEmbed,
  buildStatsEmbed,
  statsTargetFromUser,
} from '../embeds/stats.embeds';
import {
  DEFAULT_ESTADO_MENSAJES,
  buildEstadoChangeRow,
  buildStatusEmbed,
} from '../embeds/status.embeds';
import { BotEstadoNombre } from '../services/botStateService';
import { CommandContext } from '../types/command.type';
import { getTodayDate } from '../utils/date';
import { hasStaffRole } from '../utils/roles';
import { logger } from '../utils/logger';

function isPublishableChannel(channel: unknown): channel is {
  send: (options: { embeds: ReturnType<typeof buildStatsEmbed>[] }) => Promise<unknown>;
} {
  if (!channel || typeof channel !== 'object') {
    return false;
  }
  const ch = channel as {
    isSendable?: () => boolean;
    isVoiceBased?: () => boolean;
    send?: unknown;
  };
  if (typeof ch.send !== 'function') {
    return false;
  }
  if (typeof ch.isVoiceBased === 'function' && ch.isVoiceBased()) {
    return false;
  }
  if (typeof ch.isSendable === 'function' && !ch.isSendable()) {
    return false;
  }
  return true;
}

function parseStatsCustomId(customId: string): {
  action: string;
  periodo?: StatsPeriod;
  targetId: string;
} | null {
  const parts = customId.split(':');
  if (parts[0] === STATS_CUSTOM_IDS.PERIODO && parts.length === 2) {
    return { action: STATS_CUSTOM_IDS.PERIODO, targetId: parts[1] };
  }
  if (parts.length !== 3) {
    return null;
  }
  const [action, periodo, targetId] = parts;
  if (
    action !== STATS_CUSTOM_IDS.DETALLE &&
    action !== STATS_CUSTOM_IDS.PUBLICAR &&
    action !== STATS_CUSTOM_IDS.PERIODO
  ) {
    return null;
  }
  return { action, periodo: periodo as StatsPeriod, targetId };
}

async function resolveTarget(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  targetId: string,
): Promise<{ user: User; displayName: string } | null> {
  const user = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!user) return null;
  const member = await interaction.guild?.members.fetch(targetId).catch(() => null);
  const displayName =
    member instanceof GuildMember ? member.displayName : user.globalName;
  return { user, displayName: displayName ?? user.username };
}

export async function handleStatsButton(
  interaction: ButtonInteraction,
  context: CommandContext,
): Promise<boolean> {
  const parsed = parseStatsCustomId(interaction.customId);
  if (!parsed) return false;

  const isStaff = hasStaffRole(interaction, context.adminRoleId);
  if (parsed.targetId !== interaction.user.id && !isStaff) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden consultar estadísticas de otros practicantes.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (parsed.action === STATS_CUSTOM_IDS.PERIODO) {
    const periodo = parsed.periodo ?? 'mes';
    await interaction.update({
      components: [
        buildStatsButtons(
          parsed.targetId,
          periodo,
          parsed.targetId === interaction.user.id,
        ),
        buildPeriodSelect(parsed.targetId, periodo),
      ],
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const periodo = parsed.periodo ?? 'mes';
    const resumen = await context.statsService.getResumen(
      parsed.targetId,
      periodo,
    );
    if (!resumen) {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            'No estás registrado como practicante. Solicita tu registro a tu encargado.',
          ),
        ],
      });
      return true;
    }

    const targetUser = await resolveTarget(interaction, parsed.targetId);
    if (!targetUser) {
      await interaction.editReply({
        embeds: [buildErrorEmbed('No pude cargar el perfil de Discord.')],
      });
      return true;
    }

    const target = statsTargetFromUser(targetUser.user, targetUser.displayName);

    if (parsed.action === STATS_CUSTOM_IDS.DETALLE) {
      await interaction.editReply({
        embeds: [buildStatsDetailEmbed(target, resumen)],
      });
      return true;
    }

    if (parsed.action === STATS_CUSTOM_IDS.PUBLICAR) {
      if (parsed.targetId !== interaction.user.id) {
        await interaction.editReply({
          embeds: [
            buildErrorEmbed('Solo puedes publicar tus propias estadísticas.'),
          ],
        });
        return true;
      }
      let published = false;
      if (isPublishableChannel(interaction.channel)) {
        await interaction.channel.send({
          embeds: [buildStatsEmbed(target, resumen)],
        });
        published = true;
      } else if (context.attendanceChannelId) {
        const fallback = await interaction.client.channels
          .fetch(context.attendanceChannelId)
          .catch(() => null);
        if (isPublishableChannel(fallback)) {
          await fallback.send({
            embeds: [buildStatsEmbed(target, resumen)],
          });
          published = true;
        }
      }
      if (!published) {
        await interaction.editReply({
          embeds: [
            buildErrorEmbed(
              'No pude publicar aquí. Usa el comando en un canal de texto, no de voz.',
            ),
          ],
        });
        return true;
      }
      await interaction.editReply({
        embeds: [
          buildErrorEmbed('Estadísticas publicadas en el canal.').setColor(
            0x2ecc71,
          ),
        ],
      });
      return true;
    }
  } catch (error) {
    logger.error('Error en botón de stats:', error);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude obtener tus estadísticas ahora. Intenta en unos minutos.',
        ),
      ],
    });
  }

  return true;
}

export async function handleStatsSelect(
  interaction: StringSelectMenuInteraction,
  context: CommandContext,
): Promise<boolean> {
  if (!interaction.customId.startsWith(`${STATS_CUSTOM_IDS.PERIODO}:`)) {
    return false;
  }

  const targetId = interaction.customId.split(':')[1];
  const periodo = interaction.values[0] as StatsPeriod;
  const isStaff = hasStaffRole(interaction, context.adminRoleId);

  if (targetId !== interaction.user.id && !isStaff) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden consultar estadísticas de otros practicantes.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const resumen = await context.statsService.getResumen(targetId, periodo);
    if (!resumen) {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            'No estás registrado como practicante. Solicita tu registro a tu encargado.',
          ),
        ],
        components: [],
      });
      return true;
    }

    const targetUser = await resolveTarget(interaction, targetId);
    if (!targetUser) {
      await interaction.editReply({
        embeds: [buildErrorEmbed('No pude cargar el perfil de Discord.')],
        components: [],
      });
      return true;
    }

    const target = statsTargetFromUser(targetUser.user, targetUser.displayName);
    const canPublish = targetId === interaction.user.id;

    await interaction.editReply({
      embeds: [buildStatsEmbed(target, resumen)],
      components: [buildStatsButtons(targetId, periodo, canPublish)],
    });
  } catch (error) {
    logger.error('Error al cambiar periodo de stats:', error);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude obtener tus estadísticas ahora. Intenta en unos minutos.',
        ),
      ],
      components: [],
    });
  }

  return true;
}

export async function handleStatusSelect(
  interaction: StringSelectMenuInteraction,
  context: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== STATUS_CUSTOM_IDS.CAMBIAR) {
    return false;
  }

  if (!hasStaffRole(interaction, context.adminRoleId)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Solo un admin puede cambiar el estado del bot.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const nuevo = interaction.values[0] as BotEstadoNombre;
    const usuarioId = await context.botStateService.findUsuarioIdByDiscord(
      interaction.user.id,
    );
    const estado = await context.botStateService.setEstado({
      estado: nuevo,
      mensaje: DEFAULT_ESTADO_MENSAJES[nuevo],
      origen: 'ADMIN',
      usuarioId,
      notificarCanal: true,
    });

    const runtime = {
      latencyMs: Math.max(0, Math.round(interaction.client.ws.ping)),
      uptimeSeconds: process.uptime(),
      dbOk: await context.botStateService.pingDatabase(),
      ventanaEntrada: context.scheduleService.getTodayEntryWindow(
        getTodayDate(context.timezone),
      ),
    };

    await interaction.editReply({
      embeds: [buildStatusEmbed(estado, runtime, 'admin')],
      components: [buildEstadoChangeRow()],
    });

    const channel = interaction.channel;
    if (channel?.isSendable()) {
      await channel.send({
        embeds: [buildStatusEmbed(estado, runtime, 'practicante')],
      });
    }
  } catch (error) {
    logger.error('Error al cambiar estado del bot:', error);
    await interaction.followUp({
      embeds: [buildGenericErrorEmbed()],
      flags: MessageFlags.Ephemeral,
    });
  }

  return true;
}
