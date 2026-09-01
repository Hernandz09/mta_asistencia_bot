import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeHoursDifference,
  eachDateInclusive,
  formatDurationHours,
  formatDurationHoursWords,
  getCalendarMonthRange,
  getCurrentWeekRange,
  getMonthRange,
  getPreviousCalendarMonthRange,
  getWeekdayNumber,
} from './date';

describe('formatDurationHoursWords', () => {
  it('combina horas y minutos con singular/plural correcto', () => {
    expect(formatDurationHoursWords(3.4166)).toBe('3 horas 25 minutos');
    expect(formatDurationHoursWords(1)).toBe('1 hora');
    expect(formatDurationHoursWords(1 + 1 / 60)).toBe('1 hora 1 minuto');
  });

  it('muestra solo minutos si es menos de una hora', () => {
    expect(formatDurationHoursWords(13 / 60)).toBe('13 minutos');
  });

  it('muestra "0 minutos" cuando no queda nada', () => {
    expect(formatDurationHoursWords(0)).toBe('0 minutos');
  });
});

describe('formatDurationHours', () => {
  it('muestra solo minutos si es menos de una hora', () => {
    expect(formatDurationHours(0.75)).toBe('45min');
    expect(formatDurationHours(0.25)).toBe('15min');
  });

  it('muestra solo horas si son horas exactas', () => {
    expect(formatDurationHours(6)).toBe('6h');
    expect(formatDurationHours(0)).toBe('0min');
  });

  it('muestra horas y minutos combinados', () => {
    expect(formatDurationHours(2.5)).toBe('2h 30min');
    expect(formatDurationHours(4.75)).toBe('4h 45min');
  });

  it('ignora el signo (usa el valor absoluto)', () => {
    expect(formatDurationHours(-3.25)).toBe('3h 15min');
  });
});

describe('computeHoursDifference', () => {
  it('calcula la diferencia decimal entre dos horas HH:mm:ss', () => {
    expect(computeHoursDifference('09:00:00', '15:00:00')).toBe(6);
  });

  it('redondea a 2 decimales', () => {
    expect(computeHoursDifference('09:00:00', '13:45:00')).toBe(4.75);
    expect(computeHoursDifference('13:45:00', '19:45:00')).toBe(6);
  });

  it('nunca devuelve un valor negativo si la salida es antes que la entrada', () => {
    expect(computeHoursDifference('15:00:00', '09:00:00')).toBe(0);
  });
});

describe('getWeekdayNumber', () => {
  it('mapea lunes a 1 y sábado a 6', () => {
    expect(getWeekdayNumber('2026-08-17')).toBe(1); // lunes
    expect(getWeekdayNumber('2026-08-22')).toBe(6); // sábado
  });

  it('mapea domingo a 7', () => {
    expect(getWeekdayNumber('2026-08-23')).toBe(7);
  });
});

describe('getCurrentWeekRange', () => {
  it('devuelve lunes-sábado de la semana cuando hoy es miércoles', () => {
    const wednesday = new Date('2026-08-19T15:00:00Z');
    expect(getCurrentWeekRange('America/Lima', wednesday)).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-22',
    });
  });

  it('devuelve el lunes-sábado que acaba de terminar cuando hoy es domingo', () => {
    const sunday = new Date('2026-08-23T15:00:00Z');
    expect(getCurrentWeekRange('America/Lima', sunday)).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-22',
    });
  });

  it('devuelve la propia semana cuando hoy es lunes', () => {
    const monday = new Date('2026-08-17T15:00:00Z');
    expect(getCurrentWeekRange('America/Lima', monday)).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-22',
    });
  });
});

describe('getMonthRange', () => {
  it('va del 1 del mes hasta hoy', () => {
    const midMonth = new Date('2026-08-31T18:00:00Z');
    expect(getMonthRange('America/Lima', midMonth)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });
});

describe('getCalendarMonthRange', () => {
  it('devuelve el mes calendario completo', () => {
    const midMonth = new Date('2026-08-20T18:00:00Z');
    expect(getCalendarMonthRange('America/Lima', midMonth)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });
});

describe('addDays y mes anterior', () => {
  it('resta una semana', () => {
    expect(addDays('2026-08-31', -7)).toBe('2026-08-24');
  });

  it('calcula agosto desde septiembre', () => {
    expect(getPreviousCalendarMonthRange('2026-09-01')).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });
});

describe('eachDateInclusive', () => {
  it('incluye ambos extremos', () => {
    expect(eachDateInclusive('2026-08-30', '2026-08-31')).toEqual([
      '2026-08-30',
      '2026-08-31',
    ]);
  });
});
