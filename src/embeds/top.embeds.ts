import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  AREA_LABELS,
  RankingCriterio,
  STATS_PERIODS,
  StatsPeriod,
  TOP_CUSTOM_IDS,
  TOP_EMBED_COLOR,
} from '../config/constants';
import { formatDateEs } from '../services/statsMath';
import { RankingResult } from '../services/rankingService';
import {
  criterioLabel,
  formatPrimaryValue,
  medalFor,
  movementSymbol,
} from '../services/rankingMath';

export interface TopViewState {
  periodo: StatsPeriod;
  area: string | null;
  criterio: RankingCriterio;
  limite: number;
  privado: boolean;
  ownerId: string;
}

function padPos(posicion: number): string {
  return String(posicion).padStart(2, ' ');
}

function displayName(
  row: RankingResult['rows'][number],
  mention: boolean,
): string {
  const cesado = row.estado === 'cesado' ? ' 📤' : '';
  if (mention && row.discordId) {
    return `<@${row.discordId}>${cesado}`;
  }
  return `${row.nombre}${cesado}`;
}

function emptyMessage(result: RankingResult): string {
  if (result.emptyReason === 'no_records') {
    return 'No hay registros de asistencia en ese periodo.';
  }
  if (result.emptyReason === 'no_area') {
    const label = result.area
      ? AREA_LABELS[result.area] ?? result.area
      : 'esa área';
    return `No hay practicantes activos en el área ${label}.`;
  }
  return 'Todavía no hay suficientes días registrados para armar el ranking.';
}

export function buildTopEmbed(
  result: RankingResult,
  options: { mention: boolean; viewerDiscordId?: string },
): EmbedBuilder {
  const areaLine = result.area
    ? `Área: ${AREA_LABELS[result.area] ?? result.area}`
    : 'Todas las áreas';
  const qualifiedLine = `${result.totalCalificados} de ${result.totalPracticantes} practicantes calificados`;

  const embed = new EmbedBuilder()
    .setColor(TOP_EMBED_COLOR)
    .setTitle(`🏆  Top Asistencia — ${result.periodoLabel}`)
    .setDescription(`${areaLine} · ${qualifiedLine}`);

  if (result.emptyReason !== 'none' || result.rows.length === 0) {
    embed.addFields({ name: '\u200b', value: emptyMessage(result) });
  } else {
    const lines = result.rows.map((row) => {
      const medal = medalFor(row.posicion);
      const primary = formatPrimaryValue(result.criterio, row.summary);
      const nota = row.summary.nota.toFixed(1);
      const move = movementSymbol(row.movimiento);
      const name = displayName(row, options.mention);
      const valuePart =
        result.criterio === 'nota'
          ? primary
          : `${primary}  ·  ${nota}`;
      return `${medal}  ${padPos(row.posicion)}. ${name}        ${valuePart}   ${move}`;
    });
    embed.addFields({ name: '\u200b', value: lines.join('\n') });
  }

  const footerLines: string[] = [];
  const viewer = result.viewer;
  const visibleIds = new Set(result.rows.map((row) => row.id));
  if (
    viewer &&
    options.viewerDiscordId &&
    viewer.discordId === options.viewerDiscordId &&
    !visibleIds.has(viewer.id) &&
    viewer.calificado
  ) {
    footerLines.push(
      `📍 Tu posición: #${viewer.posicion} de ${result.totalCalificados}  ·  ${formatPrimaryValue(result.criterio, viewer.summary)}`,
    );
  }
  if (result.noCalificados > 0) {
    footerLines.push(
      `⏳ ${result.noCalificados} practicantes aún no califican (menos de ${result.diasMinimos} días)`,
    );
  }
  if (footerLines.length > 0) {
    embed.addFields({ name: '\u200b', value: footerLines.join('\n') });
  }

  const actualizado = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(result.calculatedAt);

  embed.setFooter({
    text: `Criterio: ${criterioLabel(result.criterio)} · Periodo: ${formatDateEs(result.effectiveStart)} – ${formatDateEs(result.effectiveEnd)}\nActualizado: ${actualizado} (America/Lima)`,
  });

  return embed;
}

export function buildTopButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TOP_CUSTOM_IDS.PERIODO)
      .setLabel('Cambiar periodo')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(TOP_CUSTOM_IDS.AREA)
      .setLabel('Filtrar por área')
      .setEmoji('🏢')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(TOP_CUSTOM_IDS.CRITERIO)
      .setLabel('Cambiar criterio')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(TOP_CUSTOM_IDS.DETALLE)
      .setLabel('Ver mi detalle')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Success),
  );
}

export function buildTopPeriodSelect(
  current: StatsPeriod,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(TOP_CUSTOM_IDS.SEL_PERIODO)
      .setPlaceholder('Elige el periodo')
      .addOptions(
        STATS_PERIODS.map((value) => ({
          label:
            value === 'semana'
              ? 'Esta semana'
              : value === 'mes'
                ? 'Este mes'
                : 'Histórico (total)',
          value,
          default: current === value,
        })),
      ),
  );
}

export function buildTopAreaSelect(
  current: string | null,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(TOP_CUSTOM_IDS.SEL_AREA)
      .setPlaceholder('Filtra por área')
      .addOptions([
        { label: 'Todas', value: 'todas', default: current == null },
        ...Object.entries(AREA_LABELS).map(([value, label]) => ({
          label,
          value,
          default: current === value,
        })),
      ]),
  );
}

export function buildTopCriterioSelect(
  current: RankingCriterio,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(TOP_CUSTOM_IDS.SEL_CRITERIO)
      .setPlaceholder('Elige el criterio')
      .addOptions([
        { label: '% Asistencia', value: 'asistencia', default: current === 'asistencia' },
        { label: '% Puntualidad', value: 'puntualidad', default: current === 'puntualidad' },
        { label: 'Horas', value: 'horas', default: current === 'horas' },
        { label: 'Nota', value: 'nota', default: current === 'nota' },
      ]),
  );
}
