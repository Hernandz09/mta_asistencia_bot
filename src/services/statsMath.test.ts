import { describe, expect, it } from 'vitest';
import {
  computeLevel,
  computeNota,
  formatHoursShort,
  notaColor,
  notaLabel,
  summarizePeriod,
  weeklyProgressBar,
} from './statsMath';
import { NOTE_COLORS } from '../config/constants';

describe('computeNota', () => {
  it('aplica los pesos 40/30/30 y redondea a un decimal', () => {
    // ((0.4*100)+(0.3*100)+(0.3*100))/100*20 = 20
    expect(computeNota(100, 100, 100)).toBe(20);
    // ((0.4*90)+(0.3*80)+(0.3*70))/100*20 = 16.2
    expect(computeNota(90, 80, 70)).toBe(16.2);
  });
});

describe('computeLevel', () => {
  it('sube un nivel cada 100 h acumuladas', () => {
    expect(computeLevel(0)).toEqual({ nivel: 1, nextLevelHours: 100 });
    expect(computeLevel(3)).toEqual({ nivel: 1, nextLevelHours: 100 });
    expect(computeLevel(240)).toEqual({ nivel: 3, nextLevelHours: 300 });
    expect(computeLevel(100)).toEqual({ nivel: 2, nextLevelHours: 200 });
  });
});

describe('notaLabel y color', () => {
  it('clasifica la escala de 0 a 20', () => {
    expect(notaLabel(18)).toBe('Excelente');
    expect(notaLabel(15)).toBe('Bueno');
    expect(notaLabel(12)).toBe('Regular');
    expect(notaLabel(11.9)).toBe('Deficiente');
    expect(notaColor(18)).toBe(NOTE_COLORS.EXCELENTE);
    expect(notaColor(11)).toBe(NOTE_COLORS.DEFICIENTE);
  });
});

describe('weeklyProgressBar', () => {
  it('dibuja 10 bloques y marca excedente', () => {
    expect(weeklyProgressBar(26, 30)).toContain('▰▰▰▰▰▰▰▰▱▱');
    expect(weeklyProgressBar(26, 30)).toContain('87%');
    expect(weeklyProgressBar(32, 30)).toContain('⚠️ Excedente');
  });
});

describe('summarizePeriod', () => {
  const dias = [
    {
      diaSemana: 1,
      horaEntrada: '09:00:00',
      horaSalida: '15:00:00',
      esLaborable: true,
    },
    {
      diaSemana: 2,
      horaEntrada: '09:00:00',
      horaSalida: '15:00:00',
      esLaborable: true,
    },
  ];

  it('cuenta puntuales, tardanzas y faltas sobre días laborables', () => {
    const summary = summarizePeriod(
      ['2026-08-17', '2026-08-18'],
      [
        {
          fecha: '2026-08-17',
          estadoEntrada: 'PUNTUAL',
          estadoJornada: 'CERRADA',
          horasComputadas: 6,
          horasJustificadas: 0,
          horasPorJustificar: 0,
        },
        {
          fecha: '2026-08-18',
          estadoEntrada: 'TARDANZA',
          estadoJornada: 'CERRADA',
          horasComputadas: 5.5,
          horasJustificadas: 0,
          horasPorJustificar: 0.5,
        },
      ],
      dias,
      0,
    );

    expect(summary.programadas).toBe(2);
    expect(summary.asistidas).toBe(2);
    expect(summary.puntuales).toBe(1);
    expect(summary.tardanzas).toBe(1);
    expect(summary.faltas).toBe(0);
    expect(summary.pctAsistencia).toBe(100);
    expect(summary.pctPuntualidad).toBe(50);
    expect(summary.nota).toBeGreaterThan(0);
  });

  it('trata un día laborable sin jornada como falta', () => {
    const summary = summarizePeriod(
      ['2026-08-17'],
      [],
      dias,
      0,
    );
    expect(summary.programadas).toBe(1);
    expect(summary.faltas).toBe(1);
    expect(summary.asistidas).toBe(0);
    expect(summary.sinRegistros).toBe(true);
  });
});

describe('formatHoursShort', () => {
  it('omite el decimal si es entero', () => {
    expect(formatHoursShort(6)).toBe('6');
    expect(formatHoursShort(6.5)).toBe('6.5');
  });
});
