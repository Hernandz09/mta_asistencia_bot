import { describe, expect, it } from 'vitest';
import { combineExtraHours } from './extraHoursService';

describe('combineExtraHours', () => {
  it('acumula extras del mismo día sin pasar de 12 h', () => {
    expect(combineExtraHours(0, 2)).toBe(2);
    expect(combineExtraHours(2, 1.5)).toBe(3.5);
    expect(combineExtraHours(11, 2)).toBeNull();
    expect(combineExtraHours(12, 0.01)).toBeNull();
  });
});
