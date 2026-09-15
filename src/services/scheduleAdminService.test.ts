import { describe, expect, it } from 'vitest';
import { normalizeDays } from './scheduleAdminService';

describe('normalizeDays', () => {
  it('completa la semana y calcula horas del sábado 12-18', () => {
    const days = normalizeDays([
      { day: 1, start: '12:00', end: '18:00', laborable: true },
      { day: 6, start: '12:00', end: '18:00', laborable: true },
    ]);
    expect(days).toHaveLength(7);
    expect(days[0].hours).toBe(6);
    expect(days[5].dayLabel).toBe('Sábado');
    expect(days[5].hours).toBe(6);
    expect(days[1].laborable).toBe(false);
    expect(days.reduce((sum, day) => sum + day.hours, 0)).toBe(12);
  });

  it('rechaza un bloque invertido', () => {
    expect(() =>
      normalizeDays([{ day: 1, start: '18:00', end: '12:00', laborable: true }]),
    ).toThrow(/salida igual o anterior/);
  });
});
