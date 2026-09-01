import { IncomingMessage, ServerResponse } from 'node:http';
import {
  ExtraHoursError,
  ExtraHoursRow,
  ExtraHoursService,
} from '../services/extraHoursService';
import { StatsService } from '../services/statsService';
import { getTodayDate, parseBusinessDate } from '../utils/date';
import { parseDurationToHours, roundHours } from '../utils/duration';

export interface ExtraHoursApiDeps {
  extraHoursService: ExtraHoursService;
  statsService: StatsService;
  timezone: string;
  sendJson: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<Record<string, unknown>>;
}

function extraPayload(row: ExtraHoursRow, practicanteId: number) {
  return {
    id: row.id,
    practicante_id: row.practicanteId ?? practicanteId,
    fecha: row.fecha,
    horas: row.horas,
    motivo: row.motivo,
  };
}

export function parseHoursInput(body: Record<string, unknown>): number | null {
  if (typeof body.horas === 'number') {
    return roundHours(body.horas);
  }
  if (typeof body.horas === 'string') {
    return parseDurationToHours(body.horas);
  }
  if (typeof body.tiempo === 'string') {
    return parseDurationToHours(body.tiempo);
  }
  return null;
}

export function extraFechaError(
  raw: string | null | undefined,
  today: string,
  minDate: string,
  fechaFin: string | null,
): { fecha: string } | { error: string } {
  const fecha = parseBusinessDate(raw, today);
  if (!fecha) {
    return {
      error: 'fecha inválida. Usa YYYY-MM-DD, 31/08/2026 o hoy.',
    };
  }
  if (fecha > today) {
    return { error: 'No se pueden cargar horas extra en una fecha futura.' };
  }
  if (fecha < minDate) {
    return { error: `fecha anterior al inicio de prácticas (${minDate}).` };
  }
  if (fechaFin && fecha > fechaFin) {
    return { error: `fecha posterior al fin de prácticas (${fechaFin}).` };
  }
  return { fecha };
}

export async function handleExtraHoursApi(
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  deps: ExtraHoursApiDeps,
): Promise<boolean> {
  const nested = path.match(/^\/api\/v1\/practicantes\/(\d+)\/horas-extra$/);
  const collection = path === '/api/v1/horas-extra';
  if (!nested && !collection) return false;

  const { extraHoursService, statsService, timezone, sendJson, readJson } =
    deps;

  const practicanteId = nested
    ? Number(nested[1])
    : Number(url.searchParams.get('practicante_id') ?? 0);

  if (method === 'GET') {
    if (!practicanteId) {
      sendJson(res, 400, {
        error: { code: 400, message: 'practicante_id es obligatorio.' },
      });
      return true;
    }
    const practicante = await statsService.findPracticanteById(practicanteId);
    if (!practicante) {
      sendJson(res, 404, {
        error: { code: 404, message: 'Practicante no encontrado.' },
      });
      return true;
    }
    const rows = await extraHoursService.listInRange({
      practicanteId,
      startDate: url.searchParams.get('desde') ?? undefined,
      endDate: url.searchParams.get('hasta') ?? undefined,
    });
    sendJson(res, 200, {
      data: rows.map((row) => extraPayload(row, practicanteId)),
    });
    return true;
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    let body: Record<string, unknown> = {};
    if (method !== 'DELETE') {
      body = await readJson(req).catch(() => ({}));
    }
    const id =
      practicanteId ||
      Number(body.practicante_id ?? url.searchParams.get('practicante_id') ?? 0);
    if (!id) {
      sendJson(res, 400, {
        error: { code: 400, message: 'practicante_id es obligatorio.' },
      });
      return true;
    }
    const practicante = await statsService.findPracticanteById(id);
    if (!practicante) {
      sendJson(res, 404, {
        error: { code: 404, message: 'Practicante no encontrado.' },
      });
      return true;
    }

    const today = getTodayDate(timezone);
    const fechaRaw =
      (typeof body.fecha === 'string' ? body.fecha : null) ??
      url.searchParams.get('fecha');
    const parsed = extraFechaError(
      fechaRaw,
      today,
      practicante.fechaInicio ?? '2026-08-17',
      practicante.fechaFin,
    );
    if ('error' in parsed) {
      sendJson(res, 400, { error: { code: 400, message: parsed.error } });
      return true;
    }

    try {
      if (method === 'DELETE') {
        const removed = await extraHoursService.remove(id, parsed.fecha);
        statsService.invalidatePracticante(id);
        if (!removed) {
          sendJson(res, 404, {
            error: {
              code: 404,
              message: `No hay horas extra el ${parsed.fecha}.`,
            },
          });
          return true;
        }
        sendJson(res, 200, {
          data: { ...extraPayload(removed, id), eliminado: true },
        });
        return true;
      }

      const horas = parseHoursInput(body);
      if (horas == null) {
        sendJson(res, 400, {
          error: {
            code: 400,
            message:
              'horas o tiempo es obligatorio. Ejemplos: 2, 2.5, "2h 30m". Máximo 12 h.',
          },
        });
        return true;
      }

      const motivo =
        typeof body.motivo === 'string' ? body.motivo : undefined;
      const modoRaw = String(body.modo ?? '').toLowerCase();
      const replace =
        method === 'PUT' || modoRaw === 'set' || modoRaw === 'actualizar';
      const saved = replace
        ? await extraHoursService.set({
            practicanteId: id,
            fecha: parsed.fecha,
            horas,
            motivo,
            origen: 'api',
          })
        : await extraHoursService.add({
            practicanteId: id,
            fecha: parsed.fecha,
            horas,
            motivo,
            origen: 'api',
          });
      statsService.invalidatePracticante(id);
      sendJson(res, method === 'POST' && !replace ? 201 : 200, {
        data: extraPayload(saved, id),
      });
      return true;
    } catch (error) {
      if (error instanceof ExtraHoursError) {
        sendJson(res, 422, {
          error: { code: 422, message: error.message },
        });
        return true;
      }
      throw error;
    }
  }

  return false;
}
