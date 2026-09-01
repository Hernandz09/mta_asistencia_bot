import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  User,
} from 'discord.js';
import { STATS_CUSTOM_IDS, StatsPeriod } from '../config/constants';
import { StatsResumen } from '../services/statsService';
import {
  formatDateEs,
  formatHoursShort,
  notaColor,
  notaLabel,
  weeklyProgressBar,
} from '../services/statsMath';

export interface StatsEmbedTarget {
  displayName: string;
  username: string;
  avatarUrl: string;
}

export function statsTargetFromUser(user: User, displayName?: string | null): StatsEmbedTarget {
  return {
    displayName: displayName?.trim() || user.globalName || user.displayName || user.username,
    username: user.username,
    avatarUrl: user.displayAvatarURL({ size: 256 }),
  };
}

export function buildStatsEmbed(
  target: StatsEmbedTarget,
  resumen: StatsResumen,
): EmbedBuilder {
  const { summary } = resumen;
  const registrado = resumen.practicante.fechaInicio
    ? formatDateEs(resumen.practicante.fechaInicio)
    : formatDateEs(resumen.practicante.creadoEn.slice(0, 10));

  const descriptionLines = [
    `⭐  **Nivel:** ${resumen.nivel} (${formatHoursShort(resumen.allTimeHours)}/${resumen.nextLevelHours} h)`,
    `👑  **Ranking:** #${resumen.ranking} de ${resumen.rankingTotal}`,
  ];

  if (resumen.practicante.estado === 'cesado') {
    descriptionLines.unshift('Practicante cesado — datos históricos');
  }
  if (summary.sinRegistros) {
    descriptionLines.push('_Sin registros en este periodo_');
  }

  const notaTexto =
    resumen.periodo === 'mes'
      ? 'Nota del mes'
      : resumen.periodo === 'semana'
        ? 'Nota de la semana'
        : 'Nota histórica';

  return new EmbedBuilder()
    .setColor(notaColor(summary.nota))
    .setTitle(`${target.displayName} (@${target.username})`)
    .setThumbnail(target.avatarUrl)
    .setDescription(descriptionLines.join('\n'))
    .addFields(
      {
        name: 'Asistencia',
        value: [
          `✅ Puntuales: **${summary.puntuales}**`,
          `⏰ Tardanzas: **${summary.tardanzas}**`,
          `❌ Faltas: **${summary.faltas}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Horas',
        value: [
          `🪙 Acumuladas: **${formatHoursShort(summary.horasAcumuladas)}**`,
          `🏦 Esta semana:\n${weeklyProgressBar(resumen.horasSemana, resumen.metaSemana)}`,
          `📋 Por justificar: **${formatHoursShort(summary.horasPorJustificar)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Rendimiento',
        value: [
          `📊 Asistencia: **${summary.pctAsistencia}%**   🎯 Puntualidad: **${summary.pctPuntualidad}%**`,
          `📝 ${notaTexto}: **${summary.nota.toFixed(1)} / 20**  ·  ${notaLabel(summary.nota)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Recuperaciones',
        value: `🔁 Cumplidas: **${resumen.recupCumplidas}**  ·  Pendientes: **${resumen.recupPendientes}**`,
        inline: false,
      },
    )
    .setFooter({
      text: `Periodo: ${resumen.periodoLabel} · Registrado el ${registrado}`,
    });
}

export function buildStatsDetailEmbed(
  target: StatsEmbedTarget,
  resumen: StatsResumen,
): EmbedBuilder {
  const lines =
    resumen.detalle.length === 0
      ? ['_Sin jornadas en este periodo._']
      : resumen.detalle.slice(0, 31).map((day) => day.label);

  if (resumen.detalle.length > 31) {
    lines.push(`_… y ${resumen.detalle.length - 31} día(s) más._`);
  }

  return new EmbedBuilder()
    .setColor(notaColor(resumen.summary.nota))
    .setTitle(`Detalle · ${target.displayName}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: resumen.periodoLabel });
}

export function buildStatsButtons(
  targetDiscordId: string,
  periodo: StatsPeriod,
  canPublish: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${STATS_CUSTOM_IDS.DETALLE}:${periodo}:${targetDiscordId}`)
      .setLabel('Ver detalle')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${STATS_CUSTOM_IDS.PERIODO}:${periodo}:${targetDiscordId}`)
      .setLabel('Cambiar periodo')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
  );

  if (canPublish) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${STATS_CUSTOM_IDS.PUBLICAR}:${periodo}:${targetDiscordId}`)
        .setLabel('Publicar')
        .setEmoji('📤')
        .setStyle(ButtonStyle.Success),
    );
  }

  return row;
}

export function buildPeriodSelect(
  targetDiscordId: string,
  current: StatsPeriod,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${STATS_CUSTOM_IDS.PERIODO}:${targetDiscordId}`)
      .setPlaceholder('Elige el periodo')
      .addOptions(
        {
          label: 'Esta semana',
          value: 'semana',
          default: current === 'semana',
        },
        {
          label: 'Este mes',
          value: 'mes',
          default: current === 'mes',
        },
        {
          label: 'Histórico (total)',
          value: 'total',
          default: current === 'total',
        },
      ),
  );
}
