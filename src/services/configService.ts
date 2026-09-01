import { Pool, RowDataPacket } from 'mysql2/promise';
import { HOURS_PER_LEVEL, NOTE_WEIGHTS } from '../config/constants';

export interface ConfigItem {
  clave: string;
  valor: string;
  descripcion: string | null;
  editable: boolean;
}

const EDITABLE = new Set([
  'timezone',
  'nota_peso_asistencia',
  'nota_peso_puntualidad',
  'nota_peso_horas',
  'alerta_limite_horas_pct',
  'limite_horas_semana_default',
  'hours_per_level',
  'asistencia.fecha_inicio',
  'asistencia.contar_dia_en_curso',
  'nota.periodo_base',
  'ranking.dias_minimos',
  'ranking.pct_dias_minimos',
  'ranking.limite_default',
  'ranking.mostrar_menciones',
  'ranking.cache_segundos',
]);

const READONLY = new Set(['schema_spec']);

function validateValor(clave: string, valor: string): string | null {
  const trimmed = valor.trim();
  if (!trimmed) return 'El valor no puede estar vacío.';

  if (clave === 'timezone') {
    return trimmed.length > 64 ? 'timezone demasiado largo.' : null;
  }

  if (clave === 'asistencia.fecha_inicio') {
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? null
      : 'asistencia.fecha_inicio debe ser YYYY-MM-DD.';
  }

  if (clave === 'asistencia.contar_dia_en_curso') {
    return trimmed === '0' || trimmed === '1'
      ? null
      : 'asistencia.contar_dia_en_curso debe ser 0 o 1.';
  }

  if (clave === 'nota.periodo_base') {
    return ['MES', 'SEMANA', 'TOTAL'].includes(trimmed.toUpperCase())
      ? null
      : 'nota.periodo_base debe ser MES, SEMANA o TOTAL.';
  }

  if (clave === 'ranking.mostrar_menciones') {
    return trimmed === '0' || trimmed === '1'
      ? null
      : 'ranking.mostrar_menciones debe ser 0 o 1.';
  }

  if (clave === 'ranking.dias_minimos') {
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 1 && n <= 20
      ? null
      : 'ranking.dias_minimos debe ser un entero entre 1 y 20.';
  }

  if (clave === 'ranking.limite_default' || clave === 'ranking.cache_segundos') {
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 1
      ? null
      : `"${clave}" debe ser un entero positivo.`;
  }

  if (clave === 'ranking.pct_dias_minimos') {
    const n = Number(trimmed);
    return n >= 0 && n <= 1
      ? null
      : 'ranking.pct_dias_minimos debe estar entre 0 y 1.';
  }

  const numeric = Number(trimmed);
  if (Number.isNaN(numeric)) {
    return `"${clave}" debe ser numérico.`;
  }

  if (clave.startsWith('nota_peso_')) {
    if (numeric < 0 || numeric > 1) {
      return `"${clave}" debe estar entre 0 y 1.`;
    }
  }

  if (clave === 'alerta_limite_horas_pct' && (numeric < 1 || numeric > 100)) {
    return 'alerta_limite_horas_pct debe estar entre 1 y 100.';
  }

  if (clave === 'limite_horas_semana_default' && (numeric < 1 || numeric > 80)) {
    return 'limite_horas_semana_default debe estar entre 1 y 80.';
  }

  if (clave === 'hours_per_level' && (numeric < 10 || numeric > 1000)) {
    return 'hours_per_level debe estar entre 10 y 1000.';
  }

  return null;
}

export class ConfigService {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<ConfigItem[]> {
    await this.ensureDefaults();
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT clave, valor, descripcion FROM config_sistema ORDER BY clave',
    );
    return rows.map((row) => ({
      clave: String(row.clave),
      valor: String(row.valor),
      descripcion: row.descripcion ? String(row.descripcion) : null,
      editable: EDITABLE.has(String(row.clave)),
    }));
  }

  async getMap(): Promise<Record<string, string>> {
    const items = await this.list();
    return Object.fromEntries(items.map((item) => [item.clave, item.valor]));
  }

  async getNoteWeights(): Promise<{
    asistencia: number;
    puntualidad: number;
    horas: number;
  }> {
    const map = await this.getMap();
    return {
      asistencia: Number(
        map['nota.peso_asistencia'] ??
          map.nota_peso_asistencia ??
          NOTE_WEIGHTS.asistencia,
      ),
      puntualidad: Number(
        map['nota.peso_puntualidad'] ??
          map.nota_peso_puntualidad ??
          NOTE_WEIGHTS.puntualidad,
      ),
      horas: Number(
        map['nota.peso_horas'] ?? map.nota_peso_horas ?? NOTE_WEIGHTS.horas,
      ),
    };
  }

  async getAsistenciaFechaInicio(): Promise<string> {
    const map = await this.getMap();
    return map['asistencia.fecha_inicio'] ?? '2026-08-17';
  }

  async getContarDiaEnCurso(): Promise<boolean> {
    const map = await this.getMap();
    return (map['asistencia.contar_dia_en_curso'] ?? '0') === '1';
  }

  async getRankingConfig(): Promise<{
    diasMinimos: number;
    pctDiasMinimos: number;
    limiteDefault: number;
    mostrarMenciones: boolean;
    cacheSegundos: number;
  }> {
    const map = await this.getMap();
    return {
      diasMinimos: Number(map['ranking.dias_minimos'] ?? 3),
      pctDiasMinimos: Number(map['ranking.pct_dias_minimos'] ?? 0.4),
      limiteDefault: Number(map['ranking.limite_default'] ?? 10),
      mostrarMenciones: (map['ranking.mostrar_menciones'] ?? '0') === '1',
      cacheSegundos: Number(map['ranking.cache_segundos'] ?? 300),
    };
  }

  async getHoursPerLevel(): Promise<number> {
    const map = await this.getMap();
    const value = Number(map.hours_per_level);
    return Number.isFinite(value) && value > 0 ? value : HOURS_PER_LEVEL;
  }

  async update(
    variables: Record<string, string>,
  ): Promise<{ updated: ConfigItem[]; errors: string[] }> {
    const errors: string[] = [];
    const keys = Object.keys(variables);

    if (keys.length === 0) {
      return { updated: await this.list(), errors: ['No hay variables para actualizar.'] };
    }

    for (const clave of keys) {
      if (READONLY.has(clave)) {
        errors.push(`"${clave}" es de solo lectura.`);
        continue;
      }
      if (!EDITABLE.has(clave)) {
        errors.push(`"${clave}" no es una variable conocida.`);
        continue;
      }
      const message = validateValor(clave, variables[clave]);
      if (message) errors.push(message);
    }

    if (errors.length > 0) {
      return { updated: await this.list(), errors };
    }

    for (const clave of keys) {
      await this.pool.query(
        `INSERT INTO config_sistema (clave, valor)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [clave, String(variables[clave]).trim()],
      );
    }

    return { updated: await this.list(), errors: [] };
  }

  private async ensureDefaults(): Promise<void> {
    await this.pool.query(
      `INSERT INTO config_sistema (clave, valor, descripcion) VALUES
         ('hours_per_level', ?, 'Horas acumuladas para subir un nivel en /stats'),
         ('asistencia.fecha_inicio', '2026-08-17', 'Primera fecha con registro de asistencias'),
         ('asistencia.contar_dia_en_curso', '0', 'Si el día de hoy entra al denominador antes de cerrar su ventana'),
         ('nota.periodo_base', 'MES', 'Periodo sobre el que se calcula la nota oficial'),
         ('ranking.dias_minimos', '3', 'Días evaluados mínimos para calificar en /top'),
         ('ranking.pct_dias_minimos', '0.40', 'Porcentaje del periodo exigido para calificar'),
         ('ranking.limite_default', '10', 'Cantidad de posiciones por defecto en /top'),
         ('ranking.mostrar_menciones', '0', 'Si el top menciona con @ a los practicantes'),
         ('ranking.cache_segundos', '300', 'TTL del ranking en caché')
       ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)`,
      [String(HOURS_PER_LEVEL)],
    );
  }
}
