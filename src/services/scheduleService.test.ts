import { describe, expect, it } from 'vitest';
import { ATTENDANCE_STATUS } from '../config/constants';
import {
  HorariosRepository,
  ScheduleService,
  parseScheduleRows,
  resolveAttendanceStatus,
} from './scheduleService';

describe('parseScheduleRows', () => {
  it('acepta filas válidas', () => {
    const { entries, errors } = parseScheduleRows([
      ['123', 'Yasumy Pastor', '1', '12:00', '18:00'],
      ['123', 'Yasumy Pastor', '3', '09:00', '15:00'],
    ]);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      discordId: '123',
      nombre: 'Yasumy Pastor',
      dia: 1,
      start: '12:00',
      end: '18:00',
    });
  });

  it('salta en silencio filas sin discord_id (transición mientras se completan IDs)', () => {
    const { entries, errors } = parseScheduleRows([
      ['', 'Yasumy Pastor', '1', '12:00', '18:00'],
    ]);

    expect(entries).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('rechaza un día fuera de rango 1-6', () => {
    const { entries, errors } = parseScheduleRows([
      ['123', 'Alguien', '7', '09:00', '15:00'],
    ]);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('dia');
  });

  it('rechaza un formato de hora inválido', () => {
    const { entries, errors } = parseScheduleRows([
      ['123', 'Alguien', '1', '9am', '15:00'],
    ]);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('hora_inicio');
  });

  it('rechaza hora_fin anterior o igual a hora_inicio', () => {
    const { entries, errors } = parseScheduleRows([
      ['123', 'Alguien', '1', '15:00', '09:00'],
    ]);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('posterior');
  });

  it('rechaza bloques solapados para el mismo practicante y día', () => {
    const { entries, errors } = parseScheduleRows([
      ['123', 'Alguien', '1', '09:00', '15:00'],
      ['123', 'Alguien', '1', '14:00', '18:00'],
    ]);

    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('solapa');
  });
});

describe('resolveAttendanceStatus', () => {
  const block = { start: '09:00', end: '15:00' };

  it('Puntual si entra justo a tiempo', () => {
    expect(resolveAttendanceStatus('09:00:00', block, 10)).toBe(
      ATTENDANCE_STATUS.PUNTUAL,
    );
  });

  it('Puntual dentro de la tolerancia', () => {
    expect(resolveAttendanceStatus('09:10:00', block, 10)).toBe(
      ATTENDANCE_STATUS.PUNTUAL,
    );
  });

  it('Tardanza justo después de la tolerancia', () => {
    expect(resolveAttendanceStatus('09:11:00', block, 10)).toBe(
      ATTENDANCE_STATUS.TARDANZA,
    );
  });

  it('Tardanza hasta el límite del bloque', () => {
    expect(resolveAttendanceStatus('15:00:00', block, 10)).toBe(
      ATTENDANCE_STATUS.TARDANZA,
    );
  });

  it('Fuera de horario después de que terminó el bloque', () => {
    expect(resolveAttendanceStatus('15:01:00', block, 10)).toBe(
      ATTENDANCE_STATUS.FUERA_DE_HORARIO,
    );
  });

  it('Fuera de horario si ese día no tiene bloque asignado', () => {
    expect(resolveAttendanceStatus('09:00:00', null, 10)).toBe(
      ATTENDANCE_STATUS.FUERA_DE_HORARIO,
    );
  });
});

function fakeRepository(rows: string[][]): HorariosRepository {
  return {
    ensureSheetExists: async () => {},
    readAll: async () => rows,
  };
}

describe('ScheduleService', () => {
  it('carga el caché al inicializar y resuelve el bloque del día correcto', async () => {
    const service = new ScheduleService(
      fakeRepository([
        ['123', 'Yasumy Pastor', '1', '12:00', '18:00'],
        ['123', 'Yasumy Pastor', '3', '09:00', '15:00'],
      ]),
      30,
    );

    await service.initialize();

    expect(service.getSchedule('123', '2026-08-17')).toEqual({
      start: '12:00',
      end: '18:00',
    }); // lunes
    expect(service.getSchedule('123', '2026-08-19')).toEqual({
      start: '09:00',
      end: '15:00',
    }); // miércoles
    expect(service.getSchedule('123', '2026-08-18')).toBeNull(); // martes: sin bloque
  });

  it('devuelve null para un discord_id desconocido', async () => {
    const service = new ScheduleService(fakeRepository([]), 30);
    await service.initialize();

    expect(service.getSchedule('999', '2026-08-17')).toBeNull();
  });

  it('conserva el caché anterior si reload() falla', async () => {
    let shouldFail = false;
    const repository: HorariosRepository = {
      ensureSheetExists: async () => {},
      readAll: async () => {
        if (shouldFail) {
          throw new Error('Sheets API caída');
        }
        return [['123', 'Yasumy Pastor', '1', '12:00', '18:00']];
      },
    };

    const service = new ScheduleService(repository, 30);
    await service.initialize();

    shouldFail = true;
    const result = await service.reload();

    expect(result.errors).toHaveLength(1);
    expect(service.getSchedule('123', '2026-08-17')).toEqual({
      start: '12:00',
      end: '18:00',
    });
  });
});
