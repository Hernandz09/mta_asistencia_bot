/** Convierte textos como `2h`, `2h 30m`, `2h 30m 22s` o `2:30:22` a horas decimales. */

const MAX_HOURS = 12;

export function parseDurationToHours(raw: string): number | null {
  const input = raw.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
  if (!input) return null;

  const clock = input.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3] ?? 0);
    if (minutes >= 60 || seconds >= 60) return null;
    return roundHours(hours + minutes / 60 + seconds / 3600);
  }

  if (/^\d+(\.\d+)?$/.test(input)) {
    return roundHours(Number(input));
  }

  let hours = 0;
  let matched = false;

  const hourPart = input.match(/(\d+(?:\.\d+)?)\s*h(?:oras?)?/);
  if (hourPart) {
    hours += Number(hourPart[1]);
    matched = true;
  }

  const minPart = input.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?/);
  if (minPart) {
    hours += Number(minPart[1]) / 60;
    matched = true;
  }

  const secPart = input.match(/(\d+(?:\.\d+)?)\s*s(?:eg(?:undos?)?)?/);
  if (secPart) {
    hours += Number(secPart[1]) / 3600;
    matched = true;
  }

  if (!matched) return null;
  return roundHours(hours);
}

export function roundHours(hours: number): number | null {
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) {
    return null;
  }
  return Math.round(hours * 100) / 100;
}

export function formatDurationInput(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}
