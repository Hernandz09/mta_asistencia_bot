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
    `📅  Registrado el ${registrado}`,
  ];

  if (resumen.practicante.estado === 'cesado') {
    descriptionLines.unshift('Practicante cesado — datos históricos');
  }
  if (summary.sinRegistros) {
    descriptionLines.push('_Sin registros en este periodo_');
  }

  const officialNota =
    resumen.periodo === 'semana' ? resumen.notaMes : summary.nota;
  const hideNote =
    summary.sinRegistros ||
    (resumen.periodo === 'semana' && officialNota === null);

  const notaTexto =
    resumen.periodo === 'mes'
      ? 'Nota del mes'
      : resumen.periodo === 'semana'
        ? 'Nota del mes (referencia)'
        : 'Nota histórica';

  const asistenciaLines = [
    `✅ Puntuales: **${summary.puntuales}**`,
    `⏰ Tardanzas: **${summary.tardanzas}**`,
    `❌ Faltas: **${summary.faltas}**`,
  ];
  if (summary.pendientes > 0) {
    asistenciaLines.push(
      `⏳ Pendientes: **${summary.pendientes}** días por transcurrir`,
    );
  }

  const rendimientoLines = [
    `📊 Asistencia: **${summary.pctAsistencia}%**   🎯 Puntualidad: **${summary.pctPuntualidad}%**`,
  ];
  if (!hideNote && officialNota !== null) {
    rendimientoLines.push(
      `📝 ${notaTexto}: **${officialNota.toFixed(1)} / 20**  ·  ${notaLabel(officialNota)}`,
    );
  }

  const evaluados = summary.programadas;
  const cubiertos = summary.programadas + summary.pendientes;
  const diasWord = resumen.periodo === 'semana' ? 'transcurridos' : 'evaluados';

  return new EmbedBuilder()
    .setColor(hideNote ? 0x95a5a6 : notaColor(officialNota ?? 0))
    .setTitle(`${target.displayName} (@${target.username})`)
    .setThumbnail(target.avatarUrl)
    .setDescription(descriptionLines.join('\n'))
    .addFields(
      {
        name: 'Asistencia',
        value: asistenciaLines.join('\n'),
        inline: true,
      },
      {
        name: 'Horas',
        value: [
          `🪙 Horas del periodo: **${formatHoursShort(summary.horasAcumuladas)}**`,
          `🏅 Total acumulado: **${formatHoursShort(resumen.allTimeHours)} h**`,
          `🏦 Esta semana:\n${weeklyProgressBar(resumen.horasSemana, resumen.metaSemana)}`,
          `📋 Por justificar: **${formatHoursShort(summary.horasPorJustificar)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Rendimiento',
        value: rendimientoLines.join('\n'),
        inline: false,
      },
      {
        name: 'Recuperaciones',
        value: `🔁 Cumplidas: **${resumen.recupCumplidas}**  ·  Pendientes: **${resumen.recupPendientes}**`,
        inline: false,
      },
    )
    .setFooter({
      text: `Periodo: ${resumen.periodoLabel} · ${evaluados} de ${cubiertos} días ${diasWord}`,
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
