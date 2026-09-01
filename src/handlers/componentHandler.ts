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
  TOP_CUSTOM_IDS,
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
import {
  buildTopAreaSelect,
  buildTopButtons,
  buildTopCriterioSelect,
  buildTopPeriodSelect,
} from '../embeds/top.embeds';
import {
  getTopSession,
  replyTopMessage,
  saveTopSession,
} from '../commands/top';
import { isRankingCriterio, isStatsPeriod } from '../services/rankingService';
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

function topExpiredReply() {
  return buildErrorEmbed(
    'Los botones del ranking expiraron. Vuelve a usar `/top`.',
  );
}

async function requireTopSession(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const session = getTopSession(interaction.message.id);
  if (!session) {
    await interaction.reply({
      embeds: [topExpiredReply()],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  if (session.ownerId !== interaction.user.id) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo quien ejecutó `/top` puede usar estos botones.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return session;
}

export async function handleTopButton(
  interaction: ButtonInteraction,
  context: CommandContext,
): Promise<boolean> {
  const { customId } = interaction;
  if (
    customId !== TOP_CUSTOM_IDS.PERIODO &&
    customId !== TOP_CUSTOM_IDS.AREA &&
    customId !== TOP_CUSTOM_IDS.CRITERIO &&
    customId !== TOP_CUSTOM_IDS.DETALLE
  ) {
    return false;
  }

  const session = await requireTopSession(interaction);
  if (!session) return true;

  if (customId === TOP_CUSTOM_IDS.DETALLE) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const resumen = await context.statsService.getResumen(
        interaction.user.id,
        session.periodo,
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
      const memberName =
        interaction.member && 'displayName' in interaction.member
          ? String(interaction.member.displayName)
          : null;
      await interaction.editReply({
        embeds: [
          buildStatsEmbed(statsTargetFromUser(interaction.user, memberName), resumen),
        ],
      });
    } catch (error) {
      logger.error('Error en detalle de /top:', error);
      await interaction.editReply({
        embeds: [buildGenericErrorEmbed()],
      });
    }
    return true;
  }

  await interaction.update({
    components: [
      customId === TOP_CUSTOM_IDS.PERIODO
        ? buildTopPeriodSelect(session.periodo)
        : customId === TOP_CUSTOM_IDS.AREA
          ? buildTopAreaSelect(session.area)
          : buildTopCriterioSelect(session.criterio),
      buildTopButtons(),
    ],
  });
  return true;
}

export async function handleTopSelect(
  interaction: StringSelectMenuInteraction,
  context: CommandContext,
): Promise<boolean> {
  const { customId } = interaction;
  if (
    customId !== TOP_CUSTOM_IDS.SEL_PERIODO &&
    customId !== TOP_CUSTOM_IDS.SEL_AREA &&
    customId !== TOP_CUSTOM_IDS.SEL_CRITERIO
  ) {
    return false;
  }

  const session = await requireTopSession(interaction);
  if (!session) return true;

  const value = interaction.values[0];
  if (customId === TOP_CUSTOM_IDS.SEL_PERIODO && isStatsPeriod(value)) {
    session.periodo = value;
  }
  if (customId === TOP_CUSTOM_IDS.SEL_AREA) {
    session.area = value === 'todas' ? null : value;
  }
  if (customId === TOP_CUSTOM_IDS.SEL_CRITERIO && isRankingCriterio(value)) {
    session.criterio = value;
  }

  await interaction.deferUpdate();
  try {
    const view = await replyTopMessage(context, session);
    await interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
    saveTopSession(interaction.message.id, session);
  } catch (error) {
    logger.error('Error al actualizar /top:', error);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude armar el ranking ahora. Intenta en unos minutos.',
        ),
      ],
    });
  }
  return true;
}
