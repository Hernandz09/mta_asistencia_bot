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
]);

const READONLY = new Set(['schema_spec']);

function validateValor(clave: string, valor: string): string | null {
  const trimmed = valor.trim();
  if (!trimmed) return 'El valor no puede estar vacío.';

  if (clave === 'timezone') {
    return trimmed.length > 64 ? 'timezone demasiado largo.' : null;
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
      asistencia: Number(map.nota_peso_asistencia ?? NOTE_WEIGHTS.asistencia),
      puntualidad: Number(
        map.nota_peso_puntualidad ?? NOTE_WEIGHTS.puntualidad,
      ),
      horas: Number(map.nota_peso_horas ?? NOTE_WEIGHTS.horas),
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
         ('hours_per_level', ?, 'Horas acumuladas para subir un nivel en /stats')
       ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)`,
      [String(HOURS_PER_LEVEL)],
    );
  }
}
