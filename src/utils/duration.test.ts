import { describe, expect, it } from 'vitest';
import {
  formatDurationInput,
  parseDurationToHours,
} from './duration';

describe('parseDurationToHours', () => {
  it('acepta horas, minutos y segundos', () => {
    expect(parseDurationToHours('2h')).toBe(2);
    expect(parseDurationToHours('2h 30m')).toBe(2.5);
    expect(parseDurationToHours('2h 30m 22s')).toBe(2.51);
    expect(parseDurationToHours('30m')).toBe(0.5);
    expect(parseDurationToHours('90min')).toBe(1.5);
    expect(parseDurationToHours('1.5h')).toBe(1.5);
    expect(parseDurationToHours('2')).toBe(2);
    expect(parseDurationToHours('2:30')).toBe(2.5);
    expect(parseDurationToHours('2:30:22')).toBe(2.51);
  });

  it('rechaza vacío, basura y tope de 12 h', () => {
    expect(parseDurationToHours('')).toBeNull();
    expect(parseDurationToHours('abc')).toBeNull();
    expect(parseDurationToHours('0h')).toBeNull();
    expect(parseDurationToHours('13h')).toBeNull();
  });
});

describe('formatDurationInput', () => {
  it('vuelve a armar el texto corto', () => {
    expect(formatDurationInput(2)).toBe('2h');
    expect(formatDurationInput(2.5)).toBe('2h 30m');
    expect(formatDurationInput(2.51)).toBe('2h 30m 36s');
  });
});
