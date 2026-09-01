import { describe, expect, it } from 'vitest';
import { extraFechaError, parseHoursInput } from './extraHoursApi';

describe('parseHoursInput', () => {
  it('acepta número, texto decimal y 2h 30m', () => {
    expect(parseHoursInput({ horas: 2 })).toBe(2);
    expect(parseHoursInput({ horas: 2.5 })).toBe(2.5);
    expect(parseHoursInput({ horas: '2h 30m' })).toBe(2.5);
    expect(parseHoursInput({ tiempo: '2h 30m 22s' })).toBe(2.51);
  });

  it('rechaza vacío o más de 12 h', () => {
    expect(parseHoursInput({})).toBeNull();
    expect(parseHoursInput({ horas: 13 })).toBeNull();
  });
});

describe('extraFechaError', () => {
  it('acepta ISO y rechaza futuro o anterior al alta', () => {
    expect(
      extraFechaError('2026-08-31', '2026-09-01', '2026-08-17', null),
    ).toEqual({ fecha: '2026-08-31' });
    expect(
      extraFechaError('2026-09-02', '2026-09-01', '2026-08-17', null),
    ).toEqual({
      error: 'No se pueden cargar horas extra en una fecha futura.',
    });
    const tooOld = extraFechaError(
      '2026-08-01',
      '2026-09-01',
      '2026-08-17',
      null,
    );
    expect('error' in tooOld && tooOld.error).toMatch(/inicio de prácticas/);
  });
});
