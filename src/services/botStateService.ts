import {
  ActivityType,
  Client,
  PresenceStatusData,
} from 'discord.js';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { BOT_VERSION } from '../config/constants';
import { logger } from '../utils/logger';

export type BotEstadoNombre = 'ACTIVO' | 'MANTENIMIENTO' | 'DESACTIVADO';
export type BotEstadoOrigen = 'ERP' | 'BOT' | 'ADMIN' | 'JOB';

export interface BotEstadoHistorial {
  id: number;
  estadoAnterior: BotEstadoNombre | null;
  estadoNuevo: BotEstadoNombre;
  mensaje: string | null;
  programadoHasta: Date | null;
  origen: BotEstadoOrigen;
  usuarioId: number | null;
  usuarioNombre: string | null;
  notificadoCanal: boolean;
  creadoEn: Date;
}

export interface BotEstado {
  estado: BotEstadoNombre;
  mensaje: string | null;
  programadoHasta: Date | null;
  permitirAdmins: boolean;
  version: string;
  ultimaSincronizacion: Date | null;
  actualizadoPorNombre: string | null;
  actualizadoEn: Date;
}

const CACHE_TTL_MS = 30_000;
const POLL_MS = 30_000;

const DEFAULT_ESTADO: BotEstado = {
  estado: 'ACTIVO',
  mensaje: null,
  programadoHasta: null,
  permitirAdmins: true,
  version: BOT_VERSION,
  ultimaSincronizacion: null,
  actualizadoPorNombre: null,
  actualizadoEn: new Date(),
};

const PRESENCE: Record<
  BotEstadoNombre,
  { status: PresenceStatusData; activity: string }
> = {
  ACTIVO: { status: 'online', activity: 'Registrando asistencias' },
  MANTENIMIENTO: { status: 'idle', activity: 'En mantenimiento' },
  DESACTIVADO: { status: 'dnd', activity: 'Fuera de servicio' },
};

export class BotStateService {
  private cached: { value: BotEstado; expiresAt: number } | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastApplied: BotEstadoNombre | null = null;
  private client: Client | null = null;
  private tableMissing = false;

  constructor(private readonly pool: Pool) {}

  attachClient(client: Client): void {
    this.client = client;
  }

  startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.refreshPresence().catch((error) => {
        logger.error('Error al refrescar estado del bot:', error);
      });
    }, POLL_MS);
    this.pollTimer.unref();
  }

  async getEstado(force = false): Promise<BotEstado> {
    if (!force && this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }

    if (this.tableMissing) {
      return DEFAULT_ESTADO;
    }

    try {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT e.estado, e.mensaje, e.programado_hasta, e.permitir_admins,
                e.version, e.ultima_sincronizacion, e.actualizado_en,
                u.nombre AS actualizado_por_nombre
         FROM bot_estado e
         LEFT JOIN usuarios u ON u.id = e.actualizado_por
         WHERE e.id = 1
         LIMIT 1`,
      );
      const row = rows[0];
      const value = row ? this.mapRow(row) : { ...DEFAULT_ESTADO };
      this.cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ER_NO_SUCH_TABLE') {
        this.tableMissing = true;
        logger.warn(
          'Tabla bot_estado no existe. Ejecuta npm run db:schema. El bot arranca en ACTIVO.',
        );
        return DEFAULT_ESTADO;
      }
      logger.error('Error al leer bot_estado:', error);
      return this.cached?.value ?? DEFAULT_ESTADO;
    }
  }

  async pingDatabase(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async setEstado(params: {
    estado: BotEstadoNombre;
    mensaje?: string | null;
    programadoHasta?: Date | null;
    permitirAdmins?: boolean;
    origen?: BotEstadoOrigen;
    usuarioId?: number | null;
    notificarCanal?: boolean;
  }): Promise<BotEstado> {
    const actual = await this.getEstado(true);
    const mensaje =
      params.estado === 'ACTIVO' ? null : (params.mensaje ?? actual.mensaje);
    const permitirAdmins =
      params.permitirAdmins ??
      (params.estado === 'MANTENIMIENTO' ? actual.permitirAdmins : true);

    await this.pool.query(
      `INSERT INTO bot_estado
         (id, estado, mensaje, programado_hasta, permitir_admins, version, actualizado_por)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         estado = VALUES(estado),
         mensaje = VALUES(mensaje),
         programado_hasta = VALUES(programado_hasta),
         permitir_admins = VALUES(permitir_admins),
         version = VALUES(version),
         actualizado_por = VALUES(actualizado_por)`,
      [
        params.estado,
        mensaje,
        params.programadoHasta ?? null,
        permitirAdmins ? 1 : 0,
        BOT_VERSION,
        params.usuarioId ?? null,
      ],
    );

    await this.pool.query(
      `INSERT INTO bot_estado_historial
         (estado_anterior, estado_nuevo, mensaje, programado_hasta, origen,
          usuario_id, notificado_canal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actual.estado,
        params.estado,
        mensaje,
        params.programadoHasta ?? null,
        params.origen ?? 'ADMIN',
        params.usuarioId ?? null,
        params.notificarCanal === false ? 0 : 1,
      ],
    );

    this.cached = null;
    const updated = await this.getEstado(true);
    await this.applyPresence(updated.estado);
    return updated;
  }

  async touchSincronizacion(): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE bot_estado SET ultima_sincronizacion = UTC_TIMESTAMP() WHERE id = 1',
      );
      if (this.cached) {
        this.cached.value.ultimaSincronizacion = new Date();
      }
    } catch {
      // La tabla puede no existir en un arranque parcial.
    }
  }

  async listHistorial(params: {
    desde?: string;
    hasta?: string;
    estado?: string;
    usuarioId?: number;
    page?: number;
    perPage?: number;
  }): Promise<{ rows: BotEstadoHistorial[]; total: number; page: number; perPage: number }> {
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));
    const where: string[] = ['deleted_at IS NULL'];
    const values: Array<string | number> = [];

    if (params.desde) {
      where.push('creado_en >= ?');
      values.push(params.desde);
    }
    if (params.hasta) {
      where.push('creado_en <= ?');
      values.push(params.hasta);
    }
    if (params.estado) {
      where.push('estado_nuevo = ?');
      values.push(params.estado);
    }
    if (params.usuarioId) {
      where.push('usuario_id = ?');
      values.push(params.usuarioId);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM bot_estado_historial WHERE ${whereSql}`,
      values,
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.mensaje, h.programado_hasta,
              h.origen, h.usuario_id, u.nombre AS usuario_nombre, h.notificado_canal, h.creado_en
       FROM bot_estado_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE ${whereSql}
       ORDER BY h.creado_en DESC
       LIMIT ? OFFSET ?`,
      [...values, perPage, (page - 1) * perPage],
    );

    return {
      rows: rows.map((row) => this.mapHistorial(row)),
      total: Number(countRows[0]?.total ?? 0),
      page,
      perPage,
    };
  }

  async getHistorialById(id: number): Promise<BotEstadoHistorial | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.mensaje, h.programado_hasta,
              h.origen, h.usuario_id, u.nombre AS usuario_nombre, h.notificado_canal, h.creado_en
       FROM bot_estado_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.id = ? AND h.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return rows[0] ? this.mapHistorial(rows[0]) : null;
  }

  async findUsuarioIdByDiscord(discordId: string): Promise<number | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id FROM usuarios WHERE discord_id = ? LIMIT 1',
      [discordId],
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  async canRunCommand(
    commandName: string,
    isAdmin: boolean,
  ): Promise<{ allowed: boolean; estado: BotEstado }> {
    const estado = await this.getEstado();
    if (commandName === 'status') {
      return { allowed: true, estado };
    }
    if (estado.estado === 'ACTIVO') {
      return { allowed: true, estado };
    }
    if (estado.estado === 'DESACTIVADO') {
      return { allowed: false, estado };
    }
    if (isAdmin && estado.permitirAdmins) {
      return { allowed: true, estado };
    }
    const readCommands = new Set(['stats', 'estadisticas', 'asistencia', 'top']);
    return { allowed: readCommands.has(commandName), estado };
  }

  async canMark(isAdmin: boolean): Promise<{ allowed: boolean; estado: BotEstado }> {
    const estado = await this.getEstado();
    if (estado.estado === 'ACTIVO') {
      return { allowed: true, estado };
    }
    if (
      estado.estado === 'MANTENIMIENTO' &&
      isAdmin &&
      estado.permitirAdmins
    ) {
      return { allowed: true, estado };
    }
    return { allowed: false, estado };
  }

  async refreshPresence(): Promise<void> {
    const estado = await this.getEstado(true);
    await this.maybeAutoActivate(estado);
    await this.applyPresence(estado.estado);
  }

  private async maybeAutoActivate(estado: BotEstado): Promise<void> {
    if (
      estado.estado !== 'MANTENIMIENTO' ||
      !estado.programadoHasta ||
      estado.programadoHasta.getTime() > Date.now()
    ) {
      return;
    }
    logger.info('Mantenimiento vencido: el bot vuelve a ACTIVO.');
    await this.setEstado({
      estado: 'ACTIVO',
      mensaje: null,
      origen: 'JOB',
      notificarCanal: false,
    });
  }

  async applyPresence(estado: BotEstadoNombre): Promise<void> {
    if (!this.client?.user || this.lastApplied === estado) {
      return;
    }
    const presence = PRESENCE[estado];
    await this.client.user.setPresence({
      status: presence.status,
      activities: [{ name: presence.activity, type: ActivityType.Watching }],
    });
    this.lastApplied = estado;
    logger.info(`Presencia Discord: ${estado} — ${presence.activity}`);
  }

  private mapRow(row: RowDataPacket): BotEstado {
    return {
      estado: row.estado as BotEstadoNombre,
      mensaje: row.mensaje ? String(row.mensaje) : null,
      programadoHasta: row.programado_hasta
        ? new Date(row.programado_hasta)
        : null,
      permitirAdmins: Boolean(row.permitir_admins),
      version: String(row.version ?? BOT_VERSION),
      ultimaSincronizacion: row.ultima_sincronizacion
        ? new Date(row.ultima_sincronizacion)
        : null,
      actualizadoPorNombre: row.actualizado_por_nombre
        ? String(row.actualizado_por_nombre)
        : null,
      actualizadoEn: row.actualizado_en
        ? new Date(row.actualizado_en)
        : new Date(),
    };
  }

  private mapHistorial(row: RowDataPacket): BotEstadoHistorial {
    return {
      id: Number(row.id),
      estadoAnterior: row.estado_anterior
        ? (row.estado_anterior as BotEstadoNombre)
        : null,
      estadoNuevo: row.estado_nuevo as BotEstadoNombre,
      mensaje: row.mensaje ? String(row.mensaje) : null,
      programadoHasta: row.programado_hasta
        ? new Date(row.programado_hasta)
        : null,
      origen: (row.origen as BotEstadoOrigen) ?? 'BOT',
      usuarioId: row.usuario_id ? Number(row.usuario_id) : null,
      usuarioNombre: row.usuario_nombre ? String(row.usuario_nombre) : null,
      notificadoCanal: Boolean(row.notificado_canal),
      creadoEn: row.creado_en ? new Date(row.creado_en) : new Date(),
    };
  }
}
