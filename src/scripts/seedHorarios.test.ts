import { describe, expect, it } from 'vitest';
import { computeHoursDifference } from '../utils/date';
import { PRACTICANTES_SCHEDULE, toHorarioRows } from './seedHorarios';

const WEEKLY_GOAL_HOURS = 30;

describe('seed de Horarios', () => {
  it('cada practicante suma exactamente 30 horas semanales', () => {
    const rows = toHorarioRows();
    const totalsByName = new Map<string, number>();

    for (const [, nombre, , horaInicio, horaFin] of rows) {
      const hours = computeHoursDifference(horaInicio, horaFin);
      totalsByName.set(nombre, (totalsByName.get(nombre) ?? 0) + hours);
    }

    expect(totalsByName.size).toBe(PRACTICANTES_SCHEDULE.length);

    for (const [nombre, total] of totalsByName) {
      expect(total, `${nombre} debería sumar 30h/semana`).toBe(
        WEEKLY_GOAL_HOURS,
      );
    }
  });

  it('deja discord_id vacío para completarlo manualmente', () => {
    const rows = toHorarioRows();
    expect(rows.every(([discordId]) => discordId === '')).toBe(true);
  });
});
