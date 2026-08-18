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
