export function getTodayDate(
  timezone: string,
  referenceDate: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate);
}

export function getCurrentTime(
  timezone: string,
  referenceDate: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(referenceDate);
}

/** HH:MM:SS en zona de negocio. Null si no hay marca o el estado es vacío. */
export function formatPunchClock(
  utc: Date | null,
  estado: string | null,
  emptyEstados: readonly string[],
  timezone: string,
): string | null {
  if (!utc || (estado && emptyEstados.includes(estado))) {
    return null;
  }
  return getCurrentTime(timezone, utc);
}

/**
 * Convierte `hoy`, `31/08`, `31/08/2026` o `2026-08-31` a YYYY-MM-DD.
 * Si no hay año, usa el de `today`; si esa fecha aún no llega, prueba el año anterior.
 */
export function parseBusinessDate(
  raw: string | null | undefined,
  today: string,
): string | null {
  if (raw == null || !raw.trim()) return today;
  const input = raw.trim().toLowerCase();
  if (input === 'hoy' || input === 'today') return today;

  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return normalizeIsoDate(iso[1], iso[2], iso[3]);
  }

  const dmy = input.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (!dmy) return null;

  const day = dmy[1];
  const month = dmy[2];
  let year = dmy[3];
  if (!year) {
    const currentYear = today.slice(0, 4);
    const candidate = normalizeIsoDate(currentYear, month, day);
    if (candidate && candidate > today) {
      return normalizeIsoDate(String(Number(currentYear) - 1), month, day);
    }
    return candidate;
  }
  if (year.length === 2) {
    year = `20${year}`;
  }
  return normalizeIsoDate(year, month, day);
}

function normalizeIsoDate(
  yearText: string,
  monthText: string,
  dayText: string,
): string | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return formatUtcDate(date);
}

/** ISO local America/Lima (UTC−5, sin DST). */
export function formatLimaIso(utc: Date): string {
  return `${getTodayDate('America/Lima', utc)}T${getCurrentTime('America/Lima', utc)}-05:00`;
}

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Diferencia decimal en horas entre dos horas HH:mm(:ss), redondeada a 2
 * decimales. Se usa tanto para horas trabajadas (entrada/salida) como para
 * horas esperadas (hora_inicio/hora_fin del horario).
 */
export function computeHoursDifference(start: string, end: string): number {
  const diffMinutes = Math.max(
    0,
    parseTimeToMinutes(end) - parseTimeToMinutes(start),
  );
  return Math.round((diffMinutes / 60) * 100) / 100;
}

/**
 * Formatea una cantidad de horas decimales como texto legible: "45min" si
 * es menos de una hora, "3h" si son horas exactas, "2h 30min" en el resto de
 * los casos. El signo se ignora (usa el valor absoluto) — quien llama decide
 * cómo comunicar si es un sobrante o un faltante.
 */
export function formatDurationHours(hours: number): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours === 0) {
    return `${minutes}min`;
  }

  if (minutes === 0) {
    return `${wholeHours}h`;
  }

  return `${wholeHours}h ${minutes}min`;
}

/**
 * Igual que `formatDurationHours` pero en palabras completas: "3 horas 25
 * minutos", "6 horas", "13 minutos", "0 minutos". Usado donde el decimal
 * (ej. "3.42h") resulta confuso de leer.
 */
export function formatDurationHoursWords(hours: number): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (wholeHours > 0) {
    parts.push(`${wholeHours} ${wholeHours === 1 ? 'hora' : 'horas'}`);
  }
  if (minutes > 0 || wholeHours === 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
  }

  return parts.join(' ');
}

/** 1=lunes … 7=domingo, para una fecha YYYY-MM-DD ya localizada. */
export function getWeekdayNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Lunes-sábado de la semana en curso. Si `referenceDate` cae en domingo
 * (día 7, sin practicantes con horario ese día) devuelve el lunes-sábado
 * que acaba de terminar, en vez de una semana futura sin datos.
 */
export function getCurrentWeekRange(
  timezone: string,
  referenceDate: Date = new Date(),
): { startDate: string; endDate: string } {
  const todayStr = getTodayDate(timezone, referenceDate);
  const weekday = getWeekdayNumber(todayStr);
  const daysFromMonday = weekday - 1;

  const [year, month, day] = todayStr.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);

  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);

  return {
    startDate: formatUtcDate(monday),
    endDate: formatUtcDate(saturday),
  };
}

export function getMonthRange(
  timezone: string,
  referenceDate: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = getTodayDate(timezone, referenceDate);
  const [year, month] = today.split('-');
  return { startDate: `${year}-${month}-01`, endDate: today };
}

/** Mes calendario completo (día 1 al último), para recortar luego con la ventana efectiva. */
export function getCalendarMonthRange(
  timezone: string,
  referenceDate: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = getTodayDate(timezone, referenceDate);
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return {
    startDate: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`,
    endDate: formatUtcDate(last),
  };
}

export function getCurrentMinutes(
  timezone: string,
  referenceDate: Date = new Date(),
): number {
  return parseTimeToMinutes(getCurrentTime(timezone, referenceDate));
}

export function eachDateInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const [ys, ms, ds] = startDate.split('-').map(Number);
  const [ye, me, de] = endDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(ys, ms - 1, ds));
  const last = new Date(Date.UTC(ye, me - 1, de));

  while (cursor <= last) {
    dates.push(formatUtcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function getPreviousCalendarMonthRange(monthStart: string): {
  startDate: string;
  endDate: string;
} {
  const [year, month] = monthStart.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const last = new Date(Date.UTC(prevYear, prevMonth, 0));
  return {
    startDate: `${String(prevYear).padStart(4, '0')}-${String(prevMonth).padStart(2, '0')}-01`,
    endDate: formatUtcDate(last),
  };
}

/** America/Lima no usa DST: UTC−5. Convierte fecha+hora locales a UTC. */
export function limaLocalToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, (hours ?? 0) + 5, minutes ?? 0, seconds ?? 0),
  );
}
