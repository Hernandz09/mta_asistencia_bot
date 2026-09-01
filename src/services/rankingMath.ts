import { RankingCriterio } from '../config/constants';
import { PeriodSummary } from './statsMath';

export interface RankingCandidate {
  id: number;
  discordId: string;
  nombre: string;
  area: string;
  estado: 'activo' | 'cesado' | 'suspendido';
  fechaInicio: string | null;
  hasHorario: boolean;
  summary: PeriodSummary;
}

export interface RankedRow extends RankingCandidate {
  posicion: number;
  calificado: boolean;
  posicionAnterior: number | null;
  movimiento: number | null;
}

export function rankingDisplayName(nombres: string, apellidos: string): string {
  const first = nombres.trim().split(/\s+/)[0] ?? '';
  const last = apellidos.replace(/—/g, '').trim().split(/\s+/)[0] ?? '';
  return `${first} ${last}`.trim();
}

/**
 * Mínimo de días para calificar: max(3, 40% del periodo).
 * Se recorta a los días ya evaluados para que un lunes de la semana
 * no deje el ranking vacío (ESPEC-ASIS-004 §5.1 vs caso 2).
 */
export function minDaysRequired(
  diasLaborablesPeriodo: number,
  diasEvaluadosPeriodo: number,
  minAbsoluto: number,
  pctPeriodo: number,
): number {
  const raw = Math.max(
    minAbsoluto,
    Math.ceil(diasLaborablesPeriodo * pctPeriodo),
  );
  const evaluados = Math.max(0, diasEvaluadosPeriodo);
  if (evaluados <= 0) {
    return raw;
  }
  return Math.min(raw, evaluados);
}

export function primaryRankingValue(
  criterio: RankingCriterio,
  summary: PeriodSummary,
): number {
  if (criterio === 'puntualidad') return summary.pctPuntualidad;
  if (criterio === 'horas') return summary.horasAcumuladas;
  if (criterio === 'nota') return summary.nota;
  return summary.pctAsistencia;
}

export function compareRanking(
  a: RankingCandidate,
  b: RankingCandidate,
  criterio: RankingCriterio,
): number {
  const primary = primaryRankingValue(criterio, b.summary) -
    primaryRankingValue(criterio, a.summary);
  if (primary !== 0) return primary;

  const puntualidad = b.summary.pctPuntualidad - a.summary.pctPuntualidad;
  if (puntualidad !== 0) return puntualidad;

  const tardanzas = a.summary.tardanzas - b.summary.tardanzas;
  if (tardanzas !== 0) return tardanzas;

  const horas = b.summary.horasAcumuladas - a.summary.horasAcumuladas;
  if (horas !== 0) return horas;

  const porJustificar =
    a.summary.horasPorJustificar - b.summary.horasPorJustificar;
  if (porJustificar !== 0) return porJustificar;

  const altaA = a.fechaInicio ?? '9999-12-31';
  const altaB = b.fechaInicio ?? '9999-12-31';
  if (altaA !== altaB) return altaA < altaB ? -1 : 1;

  return 0;
}

export function assignPositions(
  sorted: RankingCandidate[],
  criterio: RankingCriterio,
): RankedRow[] {
  const result: RankedRow[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    const tied =
      index > 0 && compareRanking(row, sorted[index - 1], criterio) === 0;
    const posicion = tied ? result[index - 1].posicion : index + 1;
    result.push({
      ...row,
      posicion,
      calificado: true,
      posicionAnterior: null,
      movimiento: null,
    });
  }
  return result;
}

export function applyMovement(
  rows: RankedRow[],
  previous: Map<number, number>,
): RankedRow[] {
  return rows.map((row) => {
    const anterior = previous.get(row.id);
    if (anterior == null) {
      return { ...row, posicionAnterior: null, movimiento: null };
    }
    return {
      ...row,
      posicionAnterior: anterior,
      movimiento: anterior - row.posicion,
    };
  });
}

export function movementSymbol(movimiento: number | null): string {
  if (movimiento == null) return '🆕';
  if (movimiento > 0) return `▲${movimiento}`;
  if (movimiento < 0) return `▼${Math.abs(movimiento)}`;
  return '▬';
}

export function medalFor(posicion: number): string {
  if (posicion === 1) return '🥇';
  if (posicion === 2) return '🥈';
  if (posicion === 3) return '🥉';
  return '  ';
}

export function formatPrimaryValue(
  criterio: RankingCriterio,
  summary: PeriodSummary,
): string {
  if (criterio === 'horas') {
    const hours = summary.horasAcumuladas;
    const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
    return `${text} h`;
  }
  if (criterio === 'nota') {
    return summary.nota.toFixed(1);
  }
  const pct =
    criterio === 'puntualidad'
      ? summary.pctPuntualidad
      : summary.pctAsistencia;
  return `${pct.toFixed(1)}%`;
}

export function criterioLabel(criterio: RankingCriterio): string {
  if (criterio === 'puntualidad') return '% Puntualidad';
  if (criterio === 'horas') return 'Horas';
  if (criterio === 'nota') return 'Nota';
  return '% Asistencia';
}
