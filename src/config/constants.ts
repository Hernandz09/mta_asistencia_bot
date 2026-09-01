export const SHEET_NAME = 'Asistencias';

export const SHEET_HEADERS = [
  'discord_id',
  'username',
  'fecha',
  'hora_entrada',
  'hora_salida',
  'estado',
  'horas_trabajadas',
  'horas_restantes',
] as const;

export const SHEET_HEADER_RANGE = `${SHEET_NAME}!A1:H1`;
export const SHEET_DATA_RANGE = `${SHEET_NAME}!A:H`;

export const HORARIOS_SHEET_NAME = 'Horarios';

export const HORARIOS_HEADERS = [
  'discord_id',
  'nombre',
  'dia',
  'hora_inicio',
  'hora_fin',
] as const;

export const HORARIOS_HEADER_RANGE = `${HORARIOS_SHEET_NAME}!A1:E1`;
export const HORARIOS_DATA_RANGE = `${HORARIOS_SHEET_NAME}!A:E`;

export const PRACTICANTES_SHEET_NAME = 'Practicantes';

export const PRACTICANTES_HEADERS = [
  'discord_id',
  'nombre',
  'carrera',
  'ciclo',
] as const;

export const PRACTICANTES_HEADER_RANGE = `${PRACTICANTES_SHEET_NAME}!A1:D1`;
export const PRACTICANTES_DATA_RANGE = `${PRACTICANTES_SHEET_NAME}!A:D`;

export const CLASES_SHEET_NAME = 'Clases';

export const DEFAULT_TIMEZONE = 'America/Mexico_City';

export const ATTENDANCE_STATUS = {
  PUNTUAL: 'Puntual',
  PUNTUAL_ANTICIPADO: 'Puntual anticipado',
  TARDANZA: 'Tardanza',
  FUERA_DE_HORARIO: 'Fuera de horario',
  SALIDA_ANTICIPADA: 'Salida anticipada',
  FUERA_DE_HORA_SALIDA: 'Fuera de hora de salida',
  INCOMPLETO: 'Incompleto',
  SIN_SALIDA: 'Sin salida',
  SIN_REGISTRO: 'Sin registro',
} as const;

export const ATTENDANCE_STATUS_LABELS: Record<
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS],
  string
> = {
  [ATTENDANCE_STATUS.PUNTUAL]: 'Puntual',
  [ATTENDANCE_STATUS.PUNTUAL_ANTICIPADO]: 'Puntual anticipado',
  [ATTENDANCE_STATUS.TARDANZA]: 'Tardanza',
  [ATTENDANCE_STATUS.FUERA_DE_HORARIO]: 'Fuera de horario',
  [ATTENDANCE_STATUS.SALIDA_ANTICIPADA]: 'Salida anticipada',
  [ATTENDANCE_STATUS.FUERA_DE_HORA_SALIDA]: 'Fuera de hora de salida',
  [ATTENDANCE_STATUS.INCOMPLETO]: 'Incompleto',
  [ATTENDANCE_STATUS.SIN_SALIDA]: 'Sin salida',
  [ATTENDANCE_STATUS.SIN_REGISTRO]: 'Sin registro',
};

export const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets';

export const COMMAND_NAMES = {
  ASISTENCIA: 'asistencia',
  STATS: 'stats',
  ESTADISTICAS: 'estadisticas',
  STATUS: 'status',
  TOP: 'top',
} as const;

export const BUTTON_CUSTOM_IDS = {
  MARCAR_ENTRADA: 'marcar_entrada',
  MARCAR_SALIDA: 'marcar_salida',
} as const;

export const STATS_CUSTOM_IDS = {
  DETALLE: 'stats_detalle',
  PUBLICAR: 'stats_publicar',
  PERIODO: 'stats_periodo',
} as const;

export const STATUS_CUSTOM_IDS = {
  CAMBIAR: 'bot_estado_cambiar',
} as const;

export const TOP_CUSTOM_IDS = {
  PERIODO: 'top_periodo',
  AREA: 'top_area',
  CRITERIO: 'top_criterio',
  DETALLE: 'top_detalle',
  SEL_PERIODO: 'top_sel_periodo',
  SEL_AREA: 'top_sel_area',
  SEL_CRITERIO: 'top_sel_criterio',
} as const;

export const STATS_PERIODS = ['semana', 'mes', 'total'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export const RANKING_CRITERIOS = [
  'asistencia',
  'puntualidad',
  'horas',
  'nota',
] as const;
export type RankingCriterio = (typeof RANKING_CRITERIOS)[number];

export const PRACTICANTE_AREAS = [
  'software',
  'video',
  'admin',
  'marketing',
  'fotografia',
  'diseno',
] as const;
export type PracticanteArea = (typeof PRACTICANTE_AREAS)[number];

export const AREA_LABELS: Record<string, string> = {
  software: 'Software',
  video: 'Video',
  admin: 'Administración',
  marketing: 'Marketing',
  fotografia: 'Fotografía',
  diseno: 'Diseño',
};

export const TOP_EMBED_COLOR = 0xf1c40f;
export const RANKING_DEFAULT_LIMIT = 10;
export const RANKING_MIN_LIMIT = 3;
export const RANKING_MAX_LIMIT = 25;
export const RANKING_API_MAX_LIMIT = 100;
export const TOP_BUTTON_TTL_MS = 5 * 60_000;
export const TOP_RATE_LIMIT_MS = 30_000;

export const HOURS_PER_LEVEL = 100;
export const BOT_VERSION = '2.2.0';

export const NOTE_WEIGHTS = {
  asistencia: 0.4,
  puntualidad: 0.3,
  horas: 0.3,
} as const;

export const NOTE_COLORS = {
  EXCELENTE: 0x2ecc71,
  BUENO: 0x3498db,
  REGULAR: 0xf1c40f,
  DEFICIENTE: 0xe74c3c,
} as const;

export const BOT_ESTADO_COLORS = {
  ACTIVO: 0x2ecc71,
  MANTENIMIENTO: 0xf1c40f,
  DESACTIVADO: 0xe74c3c,
} as const;

export const EMPTY_DISPLAY_VALUE = '—';

export const EMBED_COLORS = {
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
  WARNING: 0xfee75c,
} as const;
