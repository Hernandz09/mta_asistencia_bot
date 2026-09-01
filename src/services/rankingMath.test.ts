import { describe, expect, it } from 'vitest';
import {
  assignPositions,
  compareRanking,
  minDaysRequired,
  movementSymbol,
  rankingDisplayName,
  RankingCandidate,
} from './rankingMath';
import { PeriodSummary } from './statsMath';

function summary(partial: Partial<PeriodSummary>): PeriodSummary {
  return {
    programadas: 11,
    asistidas: 11,
    puntuales: 11,
    tardanzas: 0,
    faltas: 0,
    pendientes: 0,
    diasLaborablesPeriodo: 11,
    horasAcumuladas: 66,
    horasPorJustificar: 0,
    horasProgramadas: 66,
    pctAsistencia: 100,
    pctPuntualidad: 100,
    pctHoras: 100,
    nota: 20,
    sinRegistros: false,
    ...partial,
  };
}

function candidate(
  id: number,
  extra: Partial<RankingCandidate> = {},
): RankingCandidate {
  return {
    id,
    discordId: String(id),
    nombre: `P${id}`,
    area: 'software',
    estado: 'activo',
    fechaInicio: '2026-08-17',
    hasHorario: true,
    summary: summary({}),
    ...extra,
  };
}

describe('minDaysRequired', () => {
  it('semana 5 días exige 3', () => {
    expect(minDaysRequired(5, 5, 3, 0.4)).toBe(3);
  });

  it('agosto 11 días exige 5', () => {
    expect(minDaysRequired(11, 11, 3, 0.4)).toBe(5);
  });

  it('septiembre 22 días exige 9', () => {
    expect(minDaysRequired(22, 22, 3, 0.4)).toBe(9);
  });

  it('un lunes recorta el mínimo a los días ya evaluados', () => {
    expect(minDaysRequired(5, 1, 3, 0.4)).toBe(1);
  });
});

describe('assignPositions', () => {
  it('usa ranking de competencia: 1, 2, 2, 4', () => {
    const tied = summary({ pctAsistencia: 90, pctPuntualidad: 80 });
    const rows = [
      candidate(1, { summary: summary({ pctAsistencia: 100 }) }),
      candidate(2, { summary: tied }),
      candidate(3, { summary: { ...tied } }),
      candidate(4, { summary: summary({ pctAsistencia: 80 }) }),
    ];
    const ranked = assignPositions(rows, 'asistencia');
    expect(ranked.map((row) => row.posicion)).toEqual([1, 2, 2, 4]);
  });
});

describe('compareRanking', () => {
  it('desempata 100% por puntualidad y luego tardanzas', () => {
    const a = candidate(1, {
      summary: summary({ pctAsistencia: 100, pctPuntualidad: 100, tardanzas: 0 }),
    });
    const b = candidate(2, {
      summary: summary({ pctAsistencia: 100, pctPuntualidad: 90, tardanzas: 1 }),
    });
    expect(compareRanking(a, b, 'asistencia')).toBeLessThan(0);
  });
});

describe('movementSymbol y nombre', () => {
  it('dibuja flechas y 🆕', () => {
    expect(movementSymbol(null)).toBe('🆕');
    expect(movementSymbol(2)).toBe('▲2');
    expect(movementSymbol(-1)).toBe('▼1');
    expect(movementSymbol(0)).toBe('▬');
  });

  it('usa nombre y primer apellido', () => {
    expect(rankingDisplayName('Taylor Ann', 'Aguirre López')).toBe(
      'Taylor Aguirre',
    );
  });
});
