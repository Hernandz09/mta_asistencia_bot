import { BUSINESS_RULES } from '../config/business';
import { ATTENDANCE_STATUS } from '../config/constants';
import { AttendanceStatus } from '../interfaces/attendance.interface';
import { getWeekdayNumber, parseTimeToMinutes } from '../utils/date';
import { logger } from '../utils/logger';

const TIME_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;

function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface ScheduleBlock {
  start: string;
  end: string;
}

export interface ScheduleEntry {
  discordId: string;
  nombre: string;
  dia: number;
  start: string;
  end: string;
}

export interface ScheduleParseResult {
  entries: ScheduleEntry[];
  errors: string[];
}

export interface ScheduleReloadResult {
  loaded: number;
  errors: string[];
}

/** Lo mínimo que ScheduleService necesita de la fuente de datos (MySQL en prod, fake en tests). */
export interface HorariosRepository {
  ensureSheetExists(): Promise<void>;
  readAll(): Promise<string[][]>;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Valida y transforma las filas crudas de la hoja Horarios. Filas con
 * discord_id vacío se saltan en silencio (estado transitorio esperado hasta
 * que se completen los IDs). Filas malformadas se descartan y quedan
 * reportadas en `errors` en vez de tumbar el proceso.
 */
export function parseScheduleRows(rawRows: string[][]): ScheduleParseResult {
  const entries: ScheduleEntry[] = [];
  const errors: string[] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 por índice 0-based, +1 por el encabezado
    const [discordId, nombre, diaRaw, horaInicio, horaFin] = row;

    if (!discordId || !discordId.trim()) {
      return;
    }

    const dia = Number(diaRaw);
    if (!Number.isInteger(dia) || dia < 1 || dia > 6) {
      errors.push(
        `Fila ${rowNumber}: "dia" inválido ("${diaRaw ?? ''}"), debe ser un entero entre 1 y 6.`,
      );
      return;
    }

    if (!horaInicio || !TIME_FORMAT.test(horaInicio)) {
      errors.push(
        `Fila ${rowNumber}: "hora_inicio" inválida ("${horaInicio ?? ''}"), formato esperado HH:mm.`,
      );
      return;
    }

    if (!horaFin || !TIME_FORMAT.test(horaFin)) {
      errors.push(
        `Fila ${rowNumber}: "hora_fin" inválida ("${horaFin ?? ''}"), formato esperado HH:mm.`,
      );
      return;
    }

    if (parseTimeToMinutes(horaFin) <= parseTimeToMinutes(horaInicio)) {
      errors.push(
        `Fila ${rowNumber}: "hora_fin" (${horaFin}) debe ser posterior a "hora_inicio" (${horaInicio}).`,
      );
      return;
    }

    const candidate: ScheduleEntry = {
      discordId: discordId.trim(),
      nombre: (nombre ?? '').trim(),
      dia,
      start: horaInicio,
      end: horaFin,
    };

    const overlapsExisting = entries.some(
      (entry) =>
        entry.discordId === candidate.discordId &&
        entry.dia === candidate.dia &&
        rangesOverlap(
          parseTimeToMinutes(entry.start),
          parseTimeToMinutes(entry.end),
          parseTimeToMinutes(candidate.start),
          parseTimeToMinutes(candidate.end),
        ),
    );

    if (overlapsExisting) {
      errors.push(
        `Fila ${rowNumber}: bloque de ${candidate.discordId} para el día ${candidate.dia} se solapa con otro ya cargado.`,
      );
      return;
    }

    entries.push(candidate);
  });

  return { entries, errors };
}

/**
 * Puntual si entra hasta `toleranceMinutes` después de hora_inicio; Tardanza
 * si entra después pero todavía dentro del bloque (hasta hora_fin); Fuera de
 * horario si entra después de hora_fin, o si ese día no tiene bloque
 * asignado.
 */
export function resolveAttendanceStatus(
  entryTime: string,
  block: ScheduleBlock | null,
  toleranceMinutes: number,
): AttendanceStatus {
  if (!block) {
    return ATTENDANCE_STATUS.FUERA_DE_HORARIO;
  }

  const entryMinutes = parseTimeToMinutes(entryTime);
  const startMinutes = parseTimeToMinutes(block.start);
  const endMinutes = parseTimeToMinutes(block.end);

  if (entryMinutes <= startMinutes + toleranceMinutes) {
    return ATTENDANCE_STATUS.PUNTUAL;
  }

  if (entryMinutes <= endMinutes) {
    return ATTENDANCE_STATUS.TARDANZA;
  }

  return ATTENDANCE_STATUS.FUERA_DE_HORARIO;
}

function groupByDiscordId(
  entries: ScheduleEntry[],
): Map<string, ScheduleEntry[]> {
  const map = new Map<string, ScheduleEntry[]>();

  for (const entry of entries) {
    const list = map.get(entry.discordId) ?? [];
    list.push(entry);
    map.set(entry.discordId, list);
  }

  return map;
}

export class ScheduleService {
  private cache: Map<string, ScheduleEntry[]> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: HorariosRepository,
    private readonly refreshIntervalMinutes: number = BUSINESS_RULES.schedule
      .refreshIntervalMinutes,
  ) {}

  async initialize(): Promise<void> {
    await this.repository.ensureSheetExists();
    await this.reload();
    this.startAutoRefresh();
  }

  async reload(): Promise<ScheduleReloadResult> {
    try {
      const rawRows = await this.repository.readAll();
      const { entries, errors } = parseScheduleRows(rawRows);

      this.cache = groupByDiscordId(entries);

      if (errors.length > 0) {
        logger.warn(
          `Horarios: ${errors.length} fila(s) inválida(s):`,
          errors,
        );
      }

      logger.info(
        `Horarios cargados: ${entries.length} bloque(s) para ${this.cache.size} practicante(s)`,
      );

      return { loaded: entries.length, errors };
    } catch (error) {
      logger.error(
        'Error al leer horarios, se conserva el caché anterior:',
        error,
      );
      return {
        loaded: this.countCachedEntries(),
        errors: ['No se pudieron leer los horarios (ver logs del bot).'],
      };
    }
  }

  getSchedule(discordId: string, dateStr: string): ScheduleBlock | null {
    const entries = this.cache.get(discordId);
    if (!entries) {
      return null;
    }

    const dia = getWeekdayNumber(dateStr);
    const entry = entries.find((candidate) => candidate.dia === dia);

    return entry ? { start: entry.start, end: entry.end } : null;
  }

  /** Ventana de entrada del día: hora más temprana → la más tardía + tolerancia. */
  getTodayEntryWindow(dateStr: string): string | null {
    const dia = getWeekdayNumber(dateStr);
    let minStart: number | null = null;
    let maxStart: number | null = null;

    for (const entries of this.cache.values()) {
      for (const entry of entries) {
        if (entry.dia !== dia) continue;
        const minutes = parseTimeToMinutes(entry.start);
        if (minStart === null || minutes < minStart) minStart = minutes;
        if (maxStart === null || minutes > maxStart) maxStart = minutes;
      }
    }

    if (minStart === null || maxStart === null) {
      return null;
    }

    const end =
      maxStart + BUSINESS_RULES.punctuality.toleranceMinutes;
    return `${formatClock(minStart)} – ${formatClock(end)}`;
  }

  private countCachedEntries(): number {
    let total = 0;
    for (const entries of this.cache.values()) {
      total += entries.length;
    }
    return total;
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(
      () => {
        this.reload().catch((error) => {
          logger.error('Error inesperado al refrescar Horarios:', error);
        });
      },
      this.refreshIntervalMinutes * 60 * 1000,
    );

    this.refreshTimer.unref();
  }
}
