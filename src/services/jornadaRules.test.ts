import { calcularJornada, SPEC_TOLERANCES } from './jornadaRules';
import { describe, expect, it } from 'vitest';

describe('calcularJornada (ESPEC-ASIS-001)', () => {
  const H = '08:00';
  const S = '15:00';

  it('6:45 → FUERA_DE_HORARIO y computa desde H', () => {
    const r = calcularJornada('06:45', '15:00', H, S);
    expect(r.estadoEntrada).toBe('FUERA_DE_HORARIO');
    expect(r.horasComputadas).toBe(7);
  });

  it('7:20 → PUNTUAL_ANTICIPADO, sale a su hora', () => {
    const r = calcularJornada('07:20', '15:00', H, S);
    expect(r.estadoEntrada).toBe('PUNTUAL_ANTICIPADO');
    expect(r.estadoSalida).toBe('PUNTUAL');
    expect(r.horasComputadas).toBe(7);
  });

  it('8:03 → PUNTUAL (dentro de 5 min)', () => {
    const r = calcularJornada('08:03', '15:00', H, S);
    expect(r.estadoEntrada).toBe('PUNTUAL');
    expect(r.minutosTardanza).toBe(0);
  });

  it('8:06 → TARDANZA de 6 min, computa desde la marca real', () => {
    const r = calcularJornada('08:06', '15:00', H, S);
    expect(r.estadoEntrada).toBe('TARDANZA');
    expect(r.minutosTardanza).toBe(6);
    expect(r.horasComputadas).toBe(6.9);
  });

  it('salida a las 14:30 → SALIDA_ANTICIPADA', () => {
    const r = calcularJornada('08:00', '14:30', H, S);
    expect(r.estadoSalida).toBe('SALIDA_ANTICIPADA');
    expect(r.horasComputadas).toBe(6.5);
  });

  it('salida a las 15:20 → PUNTUAL (tolerancia 30 min)', () => {
    const r = calcularJornada('08:00', '15:20', H, S);
    expect(r.estadoSalida).toBe('PUNTUAL');
    expect(r.horasComputadas).toBe(7);
  });

  it('salida a las 16:00 → FUERA_DE_HORA_SALIDA, horas hasta S', () => {
    const r = calcularJornada('08:00', '16:00', H, S);
    expect(r.estadoSalida).toBe('FUERA_DE_HORA_SALIDA');
    expect(r.horasComputadas).toBe(7);
  });

  it('sin salida → horas_computadas 0 y por justificar = programadas', () => {
    const r = calcularJornada('08:00', null, H, S);
    expect(r.estadoSalida).toBe('SIN_SALIDA');
    expect(r.horasComputadas).toBe(0);
    expect(r.horasPorJustificar).toBe(7);
  });

  it('usa las tolerancias de la spec por defecto', () => {
    expect(SPEC_TOLERANCES.toleranciaEntradaMin).toBe(5);
    expect(SPEC_TOLERANCES.adelantoMaxMin).toBe(60);
    expect(SPEC_TOLERANCES.toleranciaSalidaMin).toBe(30);
    expect(SPEC_TOLERANCES.limiteSinSalidaMin).toBe(180);
  });
});
