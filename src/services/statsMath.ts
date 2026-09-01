import {
  HOURS_PER_LEVEL,
  NOTE_COLORS,
  NOTE_WEIGHTS,
} from '../config/constants';
import { computeHoursDifference, getWeekdayNumber } from '../utils/date';

export type NotaLabel = 'Excelente' | 'Bueno' | 'Regular' | 'Deficiente';

export interface JornadaStatsRow {
  fecha: string;
  estadoEntrada: string | null;
  estadoJornada: string;
  horasComputadas: number;
  horasJustificadas: number;
  horasPorJustificar: number;
}

export interface HorarioDiaStats {
  diaSemana: number;
  horaEntrada: string | null;
  horaSalida: string | null;
  esLaborable: boolean;
}

export interface PeriodSummary {
  programadas: number;
  asistidas: number;
  puntuales: number;
  tardanzas: number;
  faltas: number;
  pendientes: number;
  diasLaborablesPeriodo: number;
  horasAcumuladas: number;
  horasPorJustificar: number;
  horasProgramadas: number;
  pctAsistencia: number;
  pctPuntualidad: number;
  pctHoras: number;
  nota: number;
  sinRegistros: boolean;
}

export interface SummarizeContext {
  today: string;
  nowMinutes: number;
  /** Días anteriores no entran ni como falta ni como pendiente. */
  fromDate?: string;
  /** Días posteriores (p. ej. cesado) no entran al cálculo. */
  untilDate?: string;
  feriados?: Set<string>;
  contarDiaEnCurso?: boolean;
  toleranciaEntradaMin?: number;
  weights?: { asistencia: number; puntualidad: number; horas: number };
}

export function maxIsoDate(
  ...values: Array<string | null | undefined>
): string | null {
  const dates = values.filter((value): value is string => Boolean(value));
  if (dates.length === 0) return null;
  return dates.reduce((best, item) => (item > best ? item : best));
}

export function minIsoDate(
  ...values: Array<string | null | undefined>
): string | null {
  const dates = values.filter((value): value is string => Boolean(value));
  if (dates.length === 0) return null;
  return dates.reduce((best, item) => (item < best ? item : best));
}

export function effectiveWindow(params: {
  periodStart: string;
  periodEnd: string;
  globalStart?: string | null;
  practicanteStart?: string | null;
  practicanteEnd?: string | null;
  today: string;
}): { start: string; end: string } | null {
  const start = maxIsoDate(
    params.periodStart,
    params.globalStart,
    params.practicanteStart,
  );
  const end = minIsoDate(
    params.periodEnd,
    params.today,
    params.practicanteEnd ?? params.today,
  );
  if (!start || !end || start > end) {
    return null;
  }
  return { start, end };
}

const ASISTIDAS = new Set([
  'CERRADA',
  'ABIERTA',
  'FALTA_JUSTIFICADA',
]);

const NO_PROGRAMADAS = new Set(['NO_LABORABLE', 'VACACIONES', 'LICENCIA']);

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeNota(
  pctAsistencia: number,
  pctPuntualidad: number,
  pctHoras: number,
  weights: { asistencia: number; puntualidad: number; horas: number } = NOTE_WEIGHTS,
): number {
  const weighted =
    weights.asistencia * pctAsistencia +
    weights.puntualidad * pctPuntualidad +
    weights.horas * pctHoras;
  return round1((weighted / 100) * 20);
}

export function notaLabel(nota: number): NotaLabel {
  if (nota >= 18) return 'Excelente';
  if (nota >= 15) return 'Bueno';
  if (nota >= 12) return 'Regular';
  return 'Deficiente';
}

export function notaColor(nota: number): number {
  if (nota >= 18) return NOTE_COLORS.EXCELENTE;
  if (nota >= 15) return NOTE_COLORS.BUENO;
  if (nota >= 12) return NOTE_COLORS.REGULAR;
  return NOTE_COLORS.DEFICIENTE;
}

export function computeLevel(
  allTimeHours: number,
  hoursPerLevel: number = HOURS_PER_LEVEL,
): {
  nivel: number;
  nextLevelHours: number;
} {
  const step = hoursPerLevel > 0 ? hoursPerLevel : HOURS_PER_LEVEL;
  const hours = Math.max(0, allTimeHours);
  const nivel = Math.floor(hours / step) + 1;
  return { nivel, nextLevelHours: nivel * step };
}

export function formatHoursShort(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function weeklyProgressBar(hours: number, goal: number): string {
  const safeGoal = goal > 0 ? goal : 30;
  const ratio = hours / safeGoal;
  const filled = Math.min(10, Math.max(0, Math.floor(ratio * 10)));
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
  const pct = Math.round(ratio * 100);
  const over = hours > safeGoal ? '  ⚠️ Excedente' : '';
  return `${formatHoursShort(hours)} / ${formatHoursShort(safeGoal)} h  ${bar}  ${pct}%${over}`;
}

export function formatDateEs(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function monthLabelEs(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  return `${MESES_ES[Number(month) - 1]} ${year}`;
}

/** Pie de embed: "(desde el 17)" cuando la ventana no empieza el día 1 del periodo. */
export function sinceDaySuffix(
  periodStart: string,
  effectiveStart: string,
): string {
  if (!effectiveStart || effectiveStart <= periodStart) {
    return '';
  }
  return ` (desde el ${Number(effectiveStart.slice(8))})`;
}

function ratioPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round1((numerator / denominator) * 100);
}

export function isAsistida(jornada: JornadaStatsRow): boolean {
  if (NO_PROGRAMADAS.has(jornada.estadoJornada)) return false;
  if (ASISTIDAS.has(jornada.estadoJornada)) return true;
  return jornada.estadoEntrada !== 'SIN_MARCA' && jornada.estadoEntrada !== null;
}

export function isPuntual(estadoEntrada: string | null): boolean {
  return estadoEntrada === 'PUNTUAL' || estadoEntrada === 'PUNTUAL_ANTICIPADO';
}

export function scheduledHoursForDate(
  date: string,
  dias: HorarioDiaStats[],
  refrigerioMin: number,
): number {
  const weekday = getWeekdayNumber(date);
  const dia = dias.find((item) => item.diaSemana === weekday);
  if (!dia?.esLaborable || !dia.horaEntrada || !dia.horaSalida) {
    return 0;
  }
  return Math.max(
    0,
    computeHoursDifference(dia.horaEntrada, dia.horaSalida) -
      refrigerioMin / 60,
  );
}

export function isLaborableDate(
  date: string,
  dias: HorarioDiaStats[],
  jornada?: JornadaStatsRow,
): boolean {
  if (jornada && NO_PROGRAMADAS.has(jornada.estadoJornada)) {
    return false;
  }
  const weekday = getWeekdayNumber(date);
  const dia = dias.find((item) => item.diaSemana === weekday);
  return Boolean(dia?.esLaborable && dia.horaEntrada && dia.horaSalida);
}

export function summarizePeriod(
  dates: string[],
  jornadas: JornadaStatsRow[],
  dias: HorarioDiaStats[],
  refrigerioMin: number,
  weightsOrContext:
    | { asistencia: number; puntualidad: number; horas: number }
    | SummarizeContext = NOTE_WEIGHTS,
): PeriodSummary {
  const context: SummarizeContext =
    'today' in weightsOrContext
      ? weightsOrContext
      : { today: '9999-12-31', nowMinutes: 24 * 60, weights: weightsOrContext };

  const weights = context.weights ?? NOTE_WEIGHTS;
  const feriados = context.feriados ?? new Set<string>();
  const tolerancia = context.toleranciaEntradaMin ?? 5;
  const byDate = new Map(jornadas.map((row) => [row.fecha, row]));
  let programadas = 0;
  let asistidas = 0;
  let puntuales = 0;
  let tardanzas = 0;
  let faltas = 0;
  let pendientes = 0;
  let diasLaborablesPeriodo = 0;
  let horasAcumuladas = 0;
  let horasPorJustificar = 0;
  let horasProgramadas = 0;

  for (const date of dates) {
    if (context.fromDate && date < context.fromDate) {
      continue;
    }
    if (context.untilDate && date > context.untilDate) {
      continue;
    }

    const jornada = byDate.get(date);
    if (feriados.has(date) || !isLaborableDate(date, dias, jornada)) {
      continue;
    }

    diasLaborablesPeriodo += 1;

    if (date > context.today) {
      pendientes += 1;
      continue;
    }

    const pendingToday =
      date === context.today &&
      !context.contarDiaEnCurso &&
      !(jornada && isAsistida(jornada)) &&
      isEntryWindowOpen(date, dias, context.nowMinutes, tolerancia);

    if (pendingToday) {
      pendientes += 1;
      continue;
    }

    programadas += 1;
    horasProgramadas += scheduledHoursForDate(date, dias, refrigerioMin);

    if (jornada) {
      horasAcumuladas += jornada.horasComputadas + jornada.horasJustificadas;
      horasPorJustificar += jornada.horasPorJustificar;
    }

    if (!jornada || jornada.estadoJornada === 'FALTA' || !isAsistida(jornada)) {
      faltas += 1;
      continue;
    }

    asistidas += 1;
    if (isPuntual(jornada.estadoEntrada)) {
      puntuales += 1;
    } else if (jornada.estadoEntrada === 'TARDANZA') {
      tardanzas += 1;
    }
  }

  const pctAsistencia = ratioPct(asistidas, programadas);
  const pctPuntualidad = ratioPct(puntuales, asistidas);
  const pctHorasRaw = ratioPct(horasAcumuladas, horasProgramadas);
  const pctHoras = Math.min(100, pctHorasRaw);

  return {
    programadas,
    asistidas,
    puntuales,
    tardanzas,
    faltas,
    pendientes,
    diasLaborablesPeriodo,
    horasAcumuladas: round1(horasAcumuladas),
    horasPorJustificar: round1(horasPorJustificar),
    horasProgramadas: round1(horasProgramadas),
    pctAsistencia,
    pctPuntualidad,
    pctHoras,
    nota: computeNota(pctAsistencia, pctPuntualidad, pctHoras, weights),
    sinRegistros: programadas === 0,
  };
}

function isEntryWindowOpen(
  date: string,
  dias: HorarioDiaStats[],
  nowMinutes: number,
  toleranciaEntradaMin: number,
): boolean {
  const weekday = getWeekdayNumber(date);
  const dia = dias.find((item) => item.diaSemana === weekday);
  if (!dia?.horaEntrada) return false;
  const limit =
    parseTimeToMinutesSafe(dia.horaEntrada) + toleranciaEntradaMin;
  return nowMinutes <= limit;
}

function parseTimeToMinutesSafe(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function detalleEstadoLabel(jornada: JornadaStatsRow): string {
  if (jornada.estadoJornada === 'FALTA') return '❌ Falta';
  if (jornada.estadoJornada === 'FALTA_JUSTIFICADA') return '📋 Falta justificada';
  if (jornada.estadoJornada === 'LICENCIA') return '🏖️ Licencia';
  if (jornada.estadoJornada === 'NO_LABORABLE') return '— No laborable';
  if (isPuntual(jornada.estadoEntrada)) return '✅ Puntual';
  if (jornada.estadoEntrada === 'TARDANZA') return '⏰ Tardanza';
  if (jornada.estadoEntrada === 'FUERA_DE_HORARIO') return '🚫 Fuera de horario';
  if (jornada.estadoJornada === 'ABIERTA') return '🔵 Abierta';
  return '📌 Cerrada';
}

export interface PeriodDayDetail {
  fecha: string;
  label: string;
  horas: number;
}

function detalleLine(row: JornadaStatsRow): string {
  const hours = row.horasComputadas + row.horasJustificadas;
  return `${formatDateEs(row.fecha)}  ${detalleEstadoLabel(row)}  ·  ${formatHoursShort(hours)} h`;
}

/**
 * Desglose día a día del periodo: cada día del horario, con puntual,
 * tardanza, falta o pendiente. No se limita a filas ya guardadas.
 */
export function buildPeriodDetalle(
  dates: string[],
  jornadas: JornadaStatsRow[],
  dias: HorarioDiaStats[],
  refrigerioMin: number,
  context: SummarizeContext,
): PeriodDayDetail[] {
  const feriados = context.feriados ?? new Set<string>();
  const tolerancia = context.toleranciaEntradaMin ?? 5;
  const byDate = new Map(jornadas.map((row) => [row.fecha, row]));
  const items: PeriodDayDetail[] = [];

  for (const date of dates) {
    if (context.fromDate && date < context.fromDate) continue;
    if (context.untilDate && date > context.untilDate) continue;

    const jornada = byDate.get(date);
    if (feriados.has(date) || !isLaborableDate(date, dias, jornada)) continue;
    if (['NO_LABORABLE', 'VACACIONES', 'LICENCIA'].includes(jornada?.estadoJornada ?? '')) {
      continue;
    }

    const pendingToday =
      date === context.today &&
      !context.contarDiaEnCurso &&
      !(jornada && isAsistida(jornada)) &&
      isEntryWindowOpen(date, dias, context.nowMinutes, tolerancia);
    const isPending = date > context.today || pendingToday;

    if (isPending) {
      items.push({
        fecha: date,
        label: `${formatDateEs(date)}  ⏳ Pendiente  ·  0 h`,
        horas: 0,
      });
      continue;
    }

    const row: JornadaStatsRow = jornada ?? {
      fecha: date,
      estadoEntrada: 'SIN_MARCA',
      estadoJornada: 'FALTA',
      horasComputadas: 0,
      horasJustificadas: 0,
      horasPorJustificar: scheduledHoursForDate(date, dias, refrigerioMin),
    };

    items.push({
      fecha: date,
      label: detalleLine(row),
      horas: row.horasComputadas + row.horasJustificadas,
    });
  }

  return items;
}
