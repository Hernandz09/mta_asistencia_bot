import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  BOT_ESTADO_COLORS,
  BOT_VERSION,
  STATUS_CUSTOM_IDS,
} from '../config/constants';
import { BotEstado, BotEstadoNombre } from '../services/botStateService';

export type StatusViewerRole = 'practicante' | 'encargado' | 'admin';

export interface StatusRuntime {
  latencyMs: number;
  uptimeSeconds: number;
  dbOk: boolean;
  ventanaEntrada: string | null;
}

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatLima(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const TITLES: Record<BotEstadoNombre, string> = {
  ACTIVO: '🟢  Bot de Asistencias — ACTIVO',
  MANTENIMIENTO: '🟡  Bot de Asistencias — EN MANTENIMIENTO',
  DESACTIVADO: '🔴  Bot de Asistencias — DESACTIVADO',
};

export function buildStatusEmbed(
  estado: BotEstado,
  runtime: StatusRuntime,
  role: StatusViewerRole,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BOT_ESTADO_COLORS[estado.estado])
    .setTitle(TITLES[estado.estado]);

  if (estado.estado === 'ACTIVO') {
    embed.setDescription('Todos los servicios operativos');

    const sistema: string[] = [];
    const conexiones: string[] = [];

    if (role !== 'practicante') {
      sistema.push(`⚙️ Versión: **${estado.version || BOT_VERSION}**`);
      conexiones.push(`🗄️ Base de datos: **${runtime.dbOk ? 'OK' : 'ERROR'}**`);
      conexiones.push('🔌 API ERP: **no configurada**');
    }

    sistema.push(`⏱️ Latencia: **${runtime.latencyMs} ms**`);
    sistema.push(`🕐 Uptime: **${formatUptime(runtime.uptimeSeconds)}**`);

    if (role !== 'practicante') {
      const sinc = estado.ultimaSincronizacion
        ? formatLima(estado.ultimaSincronizacion)
        : '—';
      conexiones.push(`🔄 Última sinc: **${sinc}**`);
    }

    embed.addFields(
      {
        name: 'Sistema',
        value: sistema.join('\n') || '—',
        inline: true,
      },
      {
        name: 'Conexiones',
        value: conexiones.join('\n') || 'Servicios operativos',
        inline: true,
      },
    );

    if (runtime.ventanaEntrada) {
      embed.addFields({
        name: 'Ventana actual',
        value: `📍 Entrada ${runtime.ventanaEntrada}`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Actualizado: ${formatLima(estado.actualizadoEn)} (America/Lima)`,
    });
    return embed;
  }

  if (estado.estado === 'MANTENIMIENTO') {
    const retorno = estado.programadoHasta
      ? formatLima(estado.programadoHasta)
      : 'por confirmar';
    const lines = [
      estado.mensaje ?? 'El bot está en mantenimiento.',
      '',
      '⛔ Las marcaciones están temporalmente deshabilitadas.',
      `🕐 Retorno estimado: **${retorno}**`,
    ];
    if (role === 'admin' && estado.actualizadoPorNombre) {
      lines.push(`👤 Activado por: **${estado.actualizadoPorNombre}**`);
    }
    lines.push(
      '',
      'Si necesitas marcar, avisa a tu encargado para registrar la asistencia manualmente.',
    );
    embed.setDescription(lines.join('\n'));
    return embed;
  }

  embed.setDescription(
    [
      estado.mensaje ?? 'Fuera de servicio',
      '',
      'El bot no está aceptando comandos.',
      'Contacta a RR.HH. para más información.',
    ].join('\n'),
  );
  return embed;
}

export function buildEstadoChangeRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(STATUS_CUSTOM_IDS.CAMBIAR)
      .setPlaceholder('Cambiar estado del bot')
      .addOptions(
        { label: 'Activo', value: 'ACTIVO', emoji: '🟢' },
        { label: 'Mantenimiento', value: 'MANTENIMIENTO', emoji: '🟡' },
        { label: 'Desactivado', value: 'DESACTIVADO', emoji: '🔴' },
      ),
  );
}

export const DEFAULT_ESTADO_MENSAJES: Record<BotEstadoNombre, string | null> = {
  ACTIVO: null,
  MANTENIMIENTO: 'El bot está en mantenimiento.',
  DESACTIVADO: 'Fuera de servicio',
};
