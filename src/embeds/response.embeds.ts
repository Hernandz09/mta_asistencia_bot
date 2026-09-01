import { EmbedBuilder } from 'discord.js';
import { WeeklySummary } from '../services/attendanceService';
import {
  ATTENDANCE_STATUS_LABELS,
  EMBED_COLORS,
  EMPTY_DISPLAY_VALUE,
} from '../config/constants';
import {
  AttendanceStatus,
  AttendanceStatusResult,
} from '../interfaces/attendance.interface';
import { formatDurationHours, formatDurationHoursWords } from '../utils/date';

function formatHoras(hours: number | null): string {
  return hours === null ? EMPTY_DISPLAY_VALUE : formatDurationHoursWords(hours);
}

export function buildAttendancePanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.INFO)
    .setTitle('Registro de asistencia')
    .setDescription(
      'Usa los botones de abajo para marcar tu entrada o salida del día.\n\n' +
        'Tu horario depende del día: usa `/stats` para ver tu desempeño, ' +
        '`/asistencia estado` para el registro de hoy y `/asistencia semana` para las horas acumuladas.',
    );
}

export function buildEntrySuccessEmbed(
  date: string,
  entryTime: string,
  status: AttendanceStatus,
): EmbedBuilder {
  const statusLabel = ATTENDANCE_STATUS_LABELS[status] ?? status;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setTitle('Entrada registrada')
    .setDescription('Tu asistencia de hoy quedó registrada correctamente.')
    .addFields(
      { name: 'Fecha', value: date, inline: true },
      { name: 'Hora', value: entryTime, inline: true },
      { name: 'Estado', value: statusLabel, inline: true },
    );
}

export function buildExitSuccessEmbed(
  date: string,
  exitTime: string,
  horasTrabajadas: number,
  horasRestantes: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setTitle('Salida registrada')
    .setDescription('Tu salida quedó registrada correctamente.')
    .addFields(
      { name: 'Fecha', value: date, inline: true },
      { name: 'Hora', value: exitTime, inline: true },
      {
        name: 'Horas trabajadas',
        value: formatDurationHoursWords(horasTrabajadas),
        inline: true,
      },
      {
        name: 'Horas restantes (hoy)',
        value: horasRestantes,
        inline: true,
      },
    );
}

export function buildAttendanceStatusEmbed(
  status: AttendanceStatusResult,
): EmbedBuilder {
  const entry = status.entryTime ?? EMPTY_DISPLAY_VALUE;
  const exit = status.exitTime ?? EMPTY_DISPLAY_VALUE;
  const statusLabel =
    ATTENDANCE_STATUS_LABELS[status.status] ?? status.status;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.INFO)
    .setTitle(`Asistencia del día (${status.date})`)
    .addFields(
      { name: 'Entrada', value: entry, inline: true },
      { name: 'Salida', value: exit, inline: true },
      { name: 'Estado', value: statusLabel, inline: false },
      {
        name: 'Horas trabajadas',
        value: formatHoras(status.horasTrabajadas),
        inline: true,
      },
      {
        name: 'Horas restantes (hoy)',
        value: status.horasRestantes ?? EMPTY_DISPLAY_VALUE,
        inline: true,
      },
    );
}

function formatDiferencia(diferencia: number): string {
  if (diferencia === 0) {
    return 'Meta cumplida';
  }

  return diferencia > 0
    ? `+${formatDurationHours(diferencia)} sobre la meta`
    : `Faltan ${formatDurationHours(diferencia)}`;
}

export function buildWeeklySummaryEmbed(
  nombre: string,
  summary: WeeklySummary,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.INFO)
    .setTitle(`Horas de la semana — ${nombre}`)
    .setDescription(`Semana del **${summary.startDate}** al **${summary.endDate}**`)
    .addFields(
      {
        name: 'Acumuladas',
        value: formatDurationHours(summary.horasAcumuladas),
        inline: true,
      },
      { name: 'Meta', value: formatDurationHours(summary.meta), inline: true },
      {
        name: 'Diferencia',
        value: formatDiferencia(summary.diferencia),
        inline: true,
      },
    );
}

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.ERROR)
    .setDescription(message);
}

export function buildGenericErrorEmbed(): EmbedBuilder {
  return buildErrorEmbed(
    'Ocurrió un error al procesar tu solicitud. Intenta de nuevo.',
  );
}

export function buildUnknownSubcommandEmbed(): EmbedBuilder {
  return buildErrorEmbed('Subcomando no reconocido.');
}
