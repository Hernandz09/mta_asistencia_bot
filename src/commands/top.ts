import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import {
  AREA_LABELS,
  COMMAND_NAMES,
  PRACTICANTE_AREAS,
  RANKING_MAX_LIMIT,
  RANKING_MIN_LIMIT,
  RankingCriterio,
  StatsPeriod,
  TOP_BUTTON_TTL_MS,
  TOP_RATE_LIMIT_MS,
} from '../config/constants';
import { buildErrorEmbed } from '../embeds/response.embeds';
import {
  buildTopButtons,
  buildTopEmbed,
  TopViewState,
} from '../embeds/top.embeds';
import { isRankingCriterio, isStatsPeriod } from '../services/rankingService';
import { BotCommand, CommandContext } from '../types/command.type';
import { logger } from '../utils/logger';

const lastRun = new Map<string, number>();

export const topSessions = new Map<
  string,
  TopViewState & { expiresAt: number }
>();

export function getTopSession(
  messageId: string,
): (TopViewState & { expiresAt: number }) | null {
  const session = topSessions.get(messageId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    topSessions.delete(messageId);
    return null;
  }
  return session;
}

export function saveTopSession(messageId: string, state: TopViewState): void {
  topSessions.set(messageId, {
    ...state,
    expiresAt: Date.now() + TOP_BUTTON_TTL_MS,
  });
}

function rateLimited(userId: string): boolean {
  const previous = lastRun.get(userId) ?? 0;
  if (Date.now() - previous < TOP_RATE_LIMIT_MS) {
    return true;
  }
  lastRun.set(userId, Date.now());
  return false;
}

const data = new SlashCommandBuilder()
  .setName(COMMAND_NAMES.TOP)
  .setDescription('Ver el ranking de asistencia de los practicantes')
  .addStringOption((option) =>
    option
      .setName('periodo')
      .setDescription('Rango del ranking')
      .setRequired(false)
      .addChoices(
        { name: 'Esta semana', value: 'semana' },
        { name: 'Este mes', value: 'mes' },
        { name: 'Histórico', value: 'total' },
      ),
  )
  .addStringOption((option) =>
    option
      .setName('area')
      .setDescription('Filtrar por área')
      .setRequired(false)
      .addChoices(
        { name: 'Todas', value: 'todas' },
        ...PRACTICANTE_AREAS.map((value) => ({
          name: AREA_LABELS[value] ?? value,
          value,
        })),
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName('limite')
      .setDescription('Cuántas posiciones mostrar (3–25)')
      .setRequired(false)
      .setMinValue(RANKING_MIN_LIMIT)
      .setMaxValue(RANKING_MAX_LIMIT),
  )
  .addStringOption((option) =>
    option
      .setName('criterio')
      .setDescription('Cómo ordenar el ranking')
      .setRequired(false)
      .addChoices(
        { name: '% Asistencia', value: 'asistencia' },
        { name: '% Puntualidad', value: 'puntualidad' },
        { name: 'Horas', value: 'horas' },
        { name: 'Nota', value: 'nota' },
      ),
  )
  .addBooleanOption((option) =>
    option
      .setName('privado')
      .setDescription('Si es true, solo tú ves el ranking')
      .setRequired(false),
  );

export async function replyTopMessage(
  context: CommandContext,
  state: TopViewState,
) {
  const result = await context.rankingService.getRanking({
    periodo: state.periodo,
    area: state.area,
    criterio: state.criterio,
    limite: state.limite,
    discordId: state.ownerId,
  });
  const cfg = await context.rankingService.getConfig();
  return {
    embed: buildTopEmbed(result, {
      mention: cfg.mostrarMenciones,
      viewerDiscordId: state.ownerId,
    }),
    components: [buildTopButtons()],
  };
}

export async function executeTop(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  if (rateLimited(interaction.user.id)) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed('Espera 30 segundos antes de volver a usar `/top`.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const periodoOpt = interaction.options.getString('periodo') ?? 'mes';
  const areaOpt = interaction.options.getString('area') ?? 'todas';
  const criterioOpt = interaction.options.getString('criterio') ?? 'asistencia';
  const periodo: StatsPeriod = isStatsPeriod(periodoOpt) ? periodoOpt : 'mes';
  const criterio: RankingCriterio = isRankingCriterio(criterioOpt)
    ? criterioOpt
    : 'asistencia';
  const cfg = await context.rankingService.getConfig();
  const limite = Math.min(
    RANKING_MAX_LIMIT,
    Math.max(
      RANKING_MIN_LIMIT,
      interaction.options.getInteger('limite') ?? cfg.limiteDefault,
    ),
  );
  const privado = interaction.options.getBoolean('privado') ?? false;
  const area = areaOpt === 'todas' ? null : areaOpt;

  const state: TopViewState = {
    periodo,
    area,
    criterio,
    limite,
    privado,
    ownerId: interaction.user.id,
  };

  await interaction.deferReply({
    flags: privado ? MessageFlags.Ephemeral : undefined,
  });

  try {
    const view = await replyTopMessage(context, state);
    await interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
    const message = await interaction.fetchReply();
    saveTopSession(message.id, state);
  } catch (error) {
    logger.error('Error en /top:', error);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude armar el ranking ahora. Intenta en unos minutos.',
        ),
      ],
    });
  }
}

export const topCommand: BotCommand = {
  data,
  execute: executeTop,
};
