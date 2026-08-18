import { describe, expect, it } from 'vitest';
import {
  computeHoursDifference,
  getCurrentWeekRange,
  getWeekdayNumber,
} from './date';

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
