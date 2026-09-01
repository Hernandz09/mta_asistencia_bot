import { describe, expect, it } from 'vitest';
import {
  buildPeriodDetalle,
  computeLevel,
  computeNota,
  effectiveWindow,
  formatHoursShort,
  notaColor,
  notaLabel,
  sinceDaySuffix,
  summarizePeriod,
  weeklyProgressBar,
  HorarioDiaStats,
  JornadaStatsRow,
} from './statsMath';
import { NOTE_COLORS } from '../config/constants';
import { eachDateInclusive } from '../utils/date';

function diasLunVie(): HorarioDiaStats[] {
  return [1, 2, 3, 4, 5].map((diaSemana) => ({
    diaSemana,
    horaEntrada: '09:00:00',
    horaSalida: '15:00:00',
    esLaborable: true,
  }));
}

function jornada(
  fecha: string,
  extra: Partial<JornadaStatsRow> = {},
): JornadaStatsRow {
  return {
    fecha,
    estadoEntrada: 'PUNTUAL',
    estadoJornada: 'CERRADA',
    horasComputadas: 6,
    horasJustificadas: 0,
    horasPorJustificar: 0,
    ...extra,
  };
}

const AGOSTO_EVAL = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-24',
  '2026-08-25',
  '2026-08-26',
  '2026-08-27',
  '2026-08-28',
  '2026-08-31',
];

describe('computeNota', () => {
  it('aplica los pesos 40/30/30 y redondea a un decimal', () => {
    expect(computeNota(100, 100, 100)).toBe(20);
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

describe('effectiveWindow', () => {
  it('recorta por fecha global, alta del practicante y hoy', () => {
    expect(
      effectiveWindow({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        globalStart: '2026-08-17',
        practicanteStart: '2026-08-17',
        today: '2026-08-31',
      }),
    ).toEqual({ start: '2026-08-17', end: '2026-08-31' });
  });

  it('devuelve null si el periodo es anterior al inicio de registros', () => {
    expect(
      effectiveWindow({
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        globalStart: '2026-08-17',
        today: '2026-08-31',
      }),
    ).toBeNull();
  });
});

describe('sinceDaySuffix', () => {
  it('solo aparece cuando la ventana no empieza el día 1', () => {
    expect(sinceDaySuffix('2026-08-01', '2026-08-17')).toBe(' (desde el 17)');
    expect(sinceDaySuffix('2026-09-01', '2026-09-01')).toBe('');
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
        jornada('2026-08-17'),
        jornada('2026-08-18', {
          estadoEntrada: 'TARDANZA',
          horasComputadas: 5.5,
          horasPorJustificar: 0.5,
        }),
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
    const summary = summarizePeriod(['2026-08-17'], [], dias, 0);
    expect(summary.programadas).toBe(1);
    expect(summary.faltas).toBe(1);
    expect(summary.asistidas).toBe(0);
    expect(summary.sinRegistros).toBe(false);
  });

  it('ESPEC-1: agosto 2026 no cuenta días anteriores al 17', () => {
    const summary = summarizePeriod(
      eachDateInclusive('2026-08-01', '2026-08-31'),
      AGOSTO_EVAL.map((fecha) => jornada(fecha)),
      diasLunVie(),
      0,
      {
        today: '2026-08-31',
        nowMinutes: 18 * 60,
        fromDate: '2026-08-17',
      },
    );
    expect(summary.programadas).toBe(11);
    expect(summary.asistidas).toBe(11);
    expect(summary.puntuales).toBe(11);
    expect(summary.faltas).toBe(0);
    expect(summary.pendientes).toBe(0);
    expect(summary.pctAsistencia).toBe(100);
    expect(summary.pctHoras).toBe(100);
    expect(summary.nota).toBe(20);
    expect(summary.sinRegistros).toBe(false);
  });

  it('ESPEC-2: semana del 31/08 cuenta 1 evaluado y 4 pendientes', () => {
    const summary = summarizePeriod(
      eachDateInclusive('2026-08-31', '2026-09-05'),
      [jornada('2026-08-31')],
      diasLunVie(),
      0,
      {
        today: '2026-08-31',
        nowMinutes: 18 * 60,
        fromDate: '2026-08-31',
      },
    );
    expect(summary.programadas).toBe(1);
    expect(summary.faltas).toBe(0);
    expect(summary.pendientes).toBe(4);
    expect(summary.diasLaborablesPeriodo).toBe(5);
    expect(summary.pctAsistencia).toBe(100);
  });

  it('ESPEC-3: septiembre 2026 tiene 22 días laborables lun-vie', () => {
    const summary = summarizePeriod(
      eachDateInclusive('2026-09-01', '2026-09-30'),
      [],
      diasLunVie(),
      0,
      { today: '2026-09-30', nowMinutes: 18 * 60 },
    );
    expect(summary.programadas).toBe(22);
    expect(summary.faltas).toBe(22);
  });

  it('ESPEC-4: alta el 10/09 solo cuenta desde esa fecha', () => {
    const summary = summarizePeriod(
      eachDateInclusive('2026-09-01', '2026-09-30'),
      [],
      diasLunVie(),
      0,
      {
        today: '2026-09-30',
        nowMinutes: 18 * 60,
        fromDate: '2026-09-10',
      },
    );
    expect(summary.programadas).toBe(15);
  });

  it('ESPEC-5: a las 7:30 sin marca el día queda pendiente', () => {
    const summary = summarizePeriod(
      ['2026-08-31'],
      [],
      diasLunVie(),
      0,
      {
        today: '2026-08-31',
        nowMinutes: 7 * 60 + 30,
        contarDiaEnCurso: false,
      },
    );
    expect(summary.programadas).toBe(0);
    expect(summary.faltas).toBe(0);
    expect(summary.pendientes).toBe(1);
  });

  it('ESPEC-6: a las 10:00 sin marca el día es falta', () => {
    const summary = summarizePeriod(
      ['2026-08-31'],
      [],
      diasLunVie(),
      0,
      {
        today: '2026-08-31',
        nowMinutes: 10 * 60,
        contarDiaEnCurso: false,
      },
    );
    expect(summary.programadas).toBe(1);
    expect(summary.faltas).toBe(1);
    expect(summary.pendientes).toBe(0);
  });

  it('ESPEC-7: un feriado laborable no entra al denominador', () => {
    const summary = summarizePeriod(
      ['2026-08-17', '2026-08-18'],
      [jornada('2026-08-17'), jornada('2026-08-18')],
      diasLunVie(),
      0,
      {
        today: '2026-08-18',
        nowMinutes: 18 * 60,
        feriados: new Set(['2026-08-18']),
      },
    );
    expect(summary.programadas).toBe(1);
    expect(summary.asistidas).toBe(1);
    expect(summary.faltas).toBe(0);
  });

  it('ESPEC-8: cesado el 20/09 no cuenta días posteriores', () => {
    const summary = summarizePeriod(
      eachDateInclusive('2026-09-01', '2026-09-30'),
      [],
      diasLunVie(),
      0,
      {
        today: '2026-09-30',
        nowMinutes: 18 * 60,
        untilDate: '2026-09-20',
      },
    );
    expect(summary.programadas).toBe(14);
    expect(summary.pendientes).toBe(0);
  });

  it('ESPEC-9: mes anterior a la fecha de inicio queda sin registros', () => {
    const window = effectiveWindow({
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      globalStart: '2026-08-17',
      today: '2026-08-31',
    });
    const dates = window ? eachDateInclusive(window.start, window.end) : [];
    const summary = summarizePeriod(dates, [], diasLunVie(), 0, {
      today: '2026-08-31',
      nowMinutes: 18 * 60,
    });
    expect(summary.programadas).toBe(0);
    expect(summary.sinRegistros).toBe(true);
    expect(summary.nota).toBe(0);
  });

  it('ESPEC-10: día justificado cuenta como asistido, no puntual', () => {
    const summary = summarizePeriod(
      ['2026-08-17', '2026-08-18'],
      [
        jornada('2026-08-17'),
        jornada('2026-08-18', {
          estadoEntrada: 'SIN_MARCA',
          estadoJornada: 'FALTA_JUSTIFICADA',
          horasComputadas: 0,
          horasJustificadas: 6,
        }),
      ],
      dias,
      0,
    );
    expect(summary.asistidas).toBe(2);
    expect(summary.puntuales).toBe(1);
    expect(summary.faltas).toBe(0);
    expect(summary.pctPuntualidad).toBe(50);
  });

  it('capa %Horas en 100 para no inflar la nota', () => {
    const summary = summarizePeriod(
      ['2026-08-17'],
      [jornada('2026-08-17', { horasComputadas: 9 })],
      dias,
      0,
    );
    expect(summary.pctHoras).toBe(100);
    expect(summary.nota).toBe(20);
  });
});

describe('buildPeriodDetalle', () => {
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

  it('incluye el día laborable sin jornada como falta', () => {
    const detalle = buildPeriodDetalle(
      ['2026-08-31', '2026-09-01', '2026-09-02'],
      [
        jornada('2026-08-31', {
          estadoEntrada: 'TARDANZA',
          horasComputadas: 6,
        }),
      ],
      dias,
      0,
      {
        today: '2026-09-01',
        nowMinutes: 16 * 60,
      },
    );

    expect(detalle.map((item) => item.label)).toEqual([
      '31/08/2026  ⏰ Tardanza  ·  6 h',
      '01/09/2026  ❌ Falta  ·  0 h',
    ]);
  });

  it('lista todos los días del horario: puntual, falta y pendientes', () => {
    const horarioJaneth: HorarioDiaStats[] = [
      { diaSemana: 1, horaEntrada: '15:00:00', horaSalida: '21:00:00', esLaborable: true },
      { diaSemana: 2, horaEntrada: '09:00:00', horaSalida: '15:00:00', esLaborable: true },
      { diaSemana: 3, horaEntrada: null, horaSalida: null, esLaborable: false },
      { diaSemana: 4, horaEntrada: '09:00:00', horaSalida: '15:00:00', esLaborable: true },
      { diaSemana: 5, horaEntrada: '09:00:00', horaSalida: '15:00:00', esLaborable: true },
      { diaSemana: 6, horaEntrada: '09:00:00', horaSalida: '15:00:00', esLaborable: true },
    ];
    const week = eachDateInclusive('2026-08-31', '2026-09-05');
    const detalle = buildPeriodDetalle(
      week,
      [
        jornada('2026-08-31', {
          estadoEntrada: 'TARDANZA',
          horasComputadas: 6,
        }),
      ],
      horarioJaneth,
      0,
      {
        today: '2026-09-01',
        nowMinutes: 16 * 60,
        fromDate: '2026-08-31',
      },
    );

    expect(detalle.map((item) => item.label)).toEqual([
      '31/08/2026  ⏰ Tardanza  ·  6 h',
      '01/09/2026  ❌ Falta  ·  0 h',
      '03/09/2026  ⏳ Pendiente  ·  0 h',
      '04/09/2026  ⏳ Pendiente  ·  0 h',
      '05/09/2026  ⏳ Pendiente  ·  0 h',
    ]);
  });
});

describe('formatHoursShort', () => {
  it('omite el decimal si es entero', () => {
    expect(formatHoursShort(6)).toBe('6');
    expect(formatHoursShort(6.5)).toBe('6.5');
  });
});
