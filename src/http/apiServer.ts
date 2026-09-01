import { timingSafeEqual } from 'node:crypto';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { Client } from 'discord.js';
import {
  BOT_VERSION,
  PRACTICANTE_AREAS,
  RANKING_API_MAX_LIMIT,
  RANKING_MIN_LIMIT,
  StatsPeriod,
} from '../config/constants';
import {
  BotEstado,
  BotEstadoHistorial,
  BotEstadoNombre,
  BotStateService,
} from '../services/botStateService';
import { ConfigService } from '../services/configService';
import { ErpReadService } from '../services/erpReadService';
import {
  RankingResult,
  RankingService,
  isRankingCriterio,
  isStatsPeriod,
} from '../services/rankingService';
import { StatsResumen, StatsService } from '../services/statsService';
import { logger } from '../utils/logger';

const ESTADOS: BotEstadoNombre[] = ['ACTIVO', 'MANTENIMIENTO', 'DESACTIVADO'];

export interface BotApiServerOptions {
  port: number;
  apiKey?: string;
  client: Client;
  botStateService: BotStateService;
  statsService: StatsService;
  rankingService: RankingService;
  configService: ConfigService;
  erpReadService: ErpReadService;
  startedAt: number;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-api-key, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function extractApiKey(req: IncomingMessage): string | undefined {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function keysMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function estadoPayload(
  estado: BotEstado,
  extra: {
    uptimeSegundos: number;
    latenciaMs: number;
    dbOk: boolean;
    discordOk: boolean;
  },
) {
  return {
    data: {
      estado: estado.estado,
      mensaje: estado.mensaje,
      programado_hasta: toIso(estado.programadoHasta),
      version: estado.version || BOT_VERSION,
      uptime_segundos: Math.floor(extra.uptimeSegundos),
      latencia_ms: extra.latenciaMs,
      conexiones: {
        base_datos: extra.dbOk ? 'OK' : 'ERROR',
        api_erp: 'OK',
        discord: extra.discordOk ? 'OK' : 'ERROR',
      },
      ultima_sincronizacion: toIso(estado.ultimaSincronizacion),
      actualizado_en: toIso(estado.actualizadoEn),
      actualizado_por: estado.actualizadoPorNombre
        ? { nombre: estado.actualizadoPorNombre }
        : null,
    },
  };
}

function historialPayload(row: BotEstadoHistorial) {
  return {
    id: row.id,
    estado_anterior: row.estadoAnterior,
    estado_nuevo: row.estadoNuevo,
    mensaje: row.mensaje,
    programado_hasta: toIso(row.programadoHasta),
    origen: row.origen,
    usuario_id: row.usuarioId,
    usuario: row.usuarioNombre ? { nombre: row.usuarioNombre } : null,
    notificado_canal: row.notificadoCanal,
    creado_en: toIso(row.creadoEn),
  };
}

function resumenPayload(resumen: StatsResumen) {
  return {
    data: {
      practicante: {
        id: resumen.practicante.id,
        discord_id: resumen.practicante.discordId || null,
        nombre: resumen.practicante.displayName,
        area: resumen.practicante.area,
        estado: resumen.practicante.estado,
        fecha_inicio: resumen.practicante.fechaInicio,
        fecha_fin: resumen.practicante.fechaFin,
      },
      periodo: resumen.periodo,
      periodo_label: resumen.periodoLabel,
      desde: resumen.startDate,
      hasta: resumen.endDate,
      nivel: resumen.nivel,
      horas_historicas: resumen.allTimeHours,
      ranking: { posicion: resumen.ranking, total: resumen.rankingTotal },
      asistencia: {
        puntuales: resumen.summary.puntuales,
        tardanzas: resumen.summary.tardanzas,
        faltas: resumen.summary.faltas,
        programadas: resumen.summary.programadas,
        asistidas: resumen.summary.asistidas,
        pendientes: resumen.summary.pendientes,
      },
      horas: {
        acumuladas: resumen.summary.horasAcumuladas,
        semana: resumen.horasSemana,
        meta_semana: resumen.metaSemana,
        por_justificar: resumen.summary.horasPorJustificar,
      },
      indicadores: {
        pct_asistencia: resumen.summary.pctAsistencia,
        pct_puntualidad: resumen.summary.pctPuntualidad,
        pct_horas: resumen.summary.pctHoras,
        nota:
          resumen.periodo === 'semana'
            ? resumen.notaMes
            : resumen.summary.nota,
        nota_mes: resumen.notaMes,
      },
      recuperaciones: {
        cumplidas: resumen.recupCumplidas,
        pendientes: resumen.recupPendientes,
      },
    },
  };
}

function rankingPayload(result: RankingResult) {
  return {
    data: {
      periodo: {
        tipo: result.periodo,
        nominal_inicio: result.nominalStart,
        nominal_fin: result.nominalEnd,
        efectivo_inicio: result.effectiveStart,
        efectivo_fin: result.effectiveEnd,
      },
      criterio: result.criterio,
      area: result.area,
      total_practicantes: result.totalPracticantes,
      total_calificados: result.totalCalificados,
      no_calificados: result.noCalificados,
      dias_minimos_exigidos: result.diasMinimos,
      ranking: result.rows.map((row) => ({
        posicion: row.posicion,
        practicante_id: row.id,
        nombre: row.nombre,
        discord_id: row.discordId || null,
        area: row.area,
        estado: row.estado,
        dias_programados: row.summary.programadas,
        dias_asistidos: row.summary.asistidas,
        dias_puntuales: row.summary.puntuales,
        tardanzas: row.summary.tardanzas,
        faltas: row.summary.faltas,
        pct_asistencia: row.summary.pctAsistencia,
        pct_puntualidad: row.summary.pctPuntualidad,
        pct_horas: row.summary.pctHoras,
        horas_acumuladas: row.summary.horasAcumuladas,
        nota: row.summary.nota,
        posicion_anterior: row.posicionAnterior,
        movimiento: row.movimiento,
      })),
      posicion_solicitada: result.viewer
        ? {
            practicante_id: result.viewer.id,
            posicion: result.viewer.posicion,
            de: result.totalCalificados,
            calificado: result.viewer.calificado,
          }
        : null,
    },
    meta: {
      calculado_en: result.calculatedAt.toISOString(),
      cache_ttl_segundos: result.cacheTtlSeconds,
    },
  };
}

async function parseEstadoBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

export function startBotApiServer(options: BotApiServerOptions): Server {
  const {
    port,
    apiKey,
    client,
    botStateService,
    statsService,
    rankingService,
    configService,
    erpReadService,
    startedAt,
  } = options;

  const server = createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        sendJson(res, 400, { error: { code: 400, message: 'Petición inválida' } });
        return;
      }

      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = req.method.toUpperCase();

      if (method === 'GET' && (path === '/favicon.ico' || path === '/')) {
        if (path === '/') {
          sendJson(res, 200, {
            data: {
              servicio: 'Bot de Asistencias MTA',
              health: '/api/v1/bot/health',
              api: '/api/v1',
            },
          });
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (
        (method === 'GET' && path === '/health') ||
        (method === 'GET' && path === '/api/v1/bot/health')
      ) {
        const dbOk = await botStateService.pingDatabase();
        const discordOk = client.isReady();
        const ok = dbOk && discordOk;
        sendJson(res, ok ? 200 : 503, {
          data: {
            status: ok ? 'ok' : 'degraded',
            discord: discordOk ? 'OK' : 'ERROR',
            base_datos: dbOk ? 'OK' : 'ERROR',
            version: BOT_VERSION,
            uptime_segundos: Math.floor((Date.now() - startedAt) / 1000),
          },
        });
        return;
      }

      if (!apiKey) {
        sendJson(res, 503, {
          error: {
            code: 503,
            message: 'API del bot no configurada: define BOT_API_KEY.',
          },
        });
        return;
      }

      if (!keysMatch(extractApiKey(req), apiKey)) {
        sendJson(res, 401, {
          error: { code: 401, message: 'API Key ausente o inválida.' },
        });
        return;
      }

      if (method === 'GET' && path === '/api/v1/bot/estado') {
        const [estado, dbOk] = await Promise.all([
          botStateService.getEstado(true),
          botStateService.pingDatabase(),
        ]);
        await botStateService.touchSincronizacion();
        sendJson(
          res,
          200,
          estadoPayload(estado, {
            uptimeSegundos: (Date.now() - startedAt) / 1000,
            latenciaMs: Math.max(0, Math.round(client.ws.ping)),
            dbOk,
            discordOk: client.isReady(),
          }),
        );
        return;
      }

      const applyEstado = async (body: Record<string, unknown>) => {
        const estadoRaw = String(body.estado ?? '');
        if (!ESTADOS.includes(estadoRaw as BotEstadoNombre)) {
          sendJson(res, 400, {
            error: { code: 400, message: 'estado inválido.' },
          });
          return;
        }
        const estadoNombre = estadoRaw as BotEstadoNombre;
        const mensaje =
          typeof body.mensaje === 'string' ? body.mensaje.slice(0, 255) : null;
        if (estadoNombre !== 'ACTIVO' && !mensaje) {
          sendJson(res, 400, {
            error: {
              code: 400,
              message: 'mensaje es obligatorio si el estado no es ACTIVO.',
            },
          });
          return;
        }

        let programadoHasta: Date | null = null;
        if (typeof body.programado_hasta === 'string' && body.programado_hasta) {
          programadoHasta = new Date(body.programado_hasta);
          if (Number.isNaN(programadoHasta.getTime())) {
            sendJson(res, 400, {
              error: { code: 400, message: 'programado_hasta inválido.' },
            });
            return;
          }
          if (programadoHasta.getTime() <= Date.now()) {
            sendJson(res, 422, {
              error: {
                code: 422,
                message: 'programado_hasta debe ser una fecha futura.',
              },
            });
            return;
          }
        }

        const actual = await botStateService.getEstado(true);
        const nextMensaje = estadoNombre === 'ACTIVO' ? null : mensaje;
        if (
          actual.estado === estadoNombre &&
          (actual.mensaje ?? null) === (nextMensaje ?? null)
        ) {
          sendJson(res, 409, {
            error: {
              code: 409,
              message: 'El bot ya está en ese estado con el mismo mensaje.',
            },
          });
          return;
        }

        const updated = await botStateService.setEstado({
          estado: estadoNombre,
          mensaje: nextMensaje,
          programadoHasta,
          permitirAdmins:
            typeof body.permitir_admins === 'boolean'
              ? body.permitir_admins
              : undefined,
          origen: 'ERP',
          notificarCanal: body.notificar_canal !== false,
        });
        const dbOk = await botStateService.pingDatabase();
        sendJson(
          res,
          200,
          estadoPayload(updated, {
            uptimeSegundos: (Date.now() - startedAt) / 1000,
            latenciaMs: Math.max(0, Math.round(client.ws.ping)),
            dbOk,
            discordOk: client.isReady(),
          }),
        );
      };

      if (method === 'PUT' && path === '/api/v1/bot/estado') {
        await applyEstado(await parseEstadoBody(req));
        return;
      }

      if (method === 'POST' && path === '/api/v1/bot/estado/activar') {
        await applyEstado({ estado: 'ACTIVO', notificar_canal: true });
        return;
      }
      if (method === 'POST' && path === '/api/v1/bot/estado/mantenimiento') {
        const body = (await parseEstadoBody(req).catch(
          () => ({}),
        )) as Record<string, unknown>;
        await applyEstado({
          estado: 'MANTENIMIENTO',
          mensaje:
            (body.mensaje as string) ?? 'El bot está en mantenimiento.',
          programado_hasta: body.programado_hasta,
          notificar_canal: body.notificar_canal ?? true,
        });
        return;
      }
      if (method === 'POST' && path === '/api/v1/bot/estado/desactivar') {
        const body = (await parseEstadoBody(req).catch(
          () => ({}),
        )) as Record<string, unknown>;
        await applyEstado({
          estado: 'DESACTIVADO',
          mensaje: (body.mensaje as string) ?? 'Fuera de servicio',
          notificar_canal: body.notificar_canal ?? true,
        });
        return;
      }

      const historialMatch = path.match(
        /^\/api\/v1\/bot\/estado\/historial(?:\/(\d+))?$/,
      );
      if (method === 'GET' && historialMatch) {
        if (historialMatch[1]) {
          const row = await botStateService.getHistorialById(
            Number(historialMatch[1]),
          );
          if (!row) {
            sendJson(res, 404, {
              error: { code: 404, message: 'Registro no encontrado.' },
            });
            return;
          }
          sendJson(res, 200, { data: historialPayload(row) });
          return;
        }

        const usuarioId = url.searchParams.get('usuario_id');
        const result = await botStateService.listHistorial({
          desde: url.searchParams.get('desde') ?? undefined,
          hasta: url.searchParams.get('hasta') ?? undefined,
          estado: url.searchParams.get('estado') ?? undefined,
          usuarioId: usuarioId ? Number(usuarioId) : undefined,
          page: Number(url.searchParams.get('page') ?? 1),
          perPage: Number(url.searchParams.get('per_page') ?? 20),
        });
        sendJson(res, 200, {
          data: result.rows.map(historialPayload),
          meta: {
            page: result.page,
            per_page: result.perPage,
            total: result.total,
          },
        });
        return;
      }

      if (method === 'GET' && (path === '/api/v1' || path === '/api')) {
        sendJson(res, 200, {
          data: {
            nombre: 'Bot de Asistencias MTA',
            version: BOT_VERSION,
            modelo: 'El bot es independiente. El ERP solo consume esta API.',
            endpoints: {
              health: 'GET /api/v1/bot/health',
              estado: 'GET|PUT /api/v1/bot/estado',
              config: 'GET|PUT /api/v1/config',
              practicantes: 'GET /api/v1/practicantes',
              resumen: 'GET /api/v1/practicantes/{id}/resumen?periodo=mes',
              ranking: 'GET /api/v1/reportes/ranking',
              jornadas: 'GET /api/v1/jornadas?practicante_id&desde&hasta',
            },
          },
        });
        return;
      }

      if (method === 'GET' && path === '/api/v1/config') {
        sendJson(res, 200, { data: await configService.list() });
        return;
      }

      if (method === 'PUT' && path === '/api/v1/config') {
        const body = await parseEstadoBody(req);
        const raw =
          body.variables && typeof body.variables === 'object'
            ? (body.variables as Record<string, unknown>)
            : body;
        const variables: Record<string, string> = {};
        for (const [clave, valor] of Object.entries(raw)) {
          if (clave === 'variables') continue;
          variables[clave] = String(valor);
        }
        const result = await configService.update(variables);
        if (result.errors.length > 0) {
          sendJson(res, 422, {
            error: { code: 422, message: result.errors.join(' ') },
            data: result.updated,
          });
          return;
        }
        sendJson(res, 200, { data: result.updated });
        return;
      }

      if (method === 'GET' && path === '/api/v1/practicantes') {
        const list = await erpReadService.listPracticantes({
          estado: url.searchParams.get('estado') ?? undefined,
          area: url.searchParams.get('area') ?? undefined,
        });
        sendJson(res, 200, { data: list });
        return;
      }

      if (method === 'GET' && path === '/api/v1/jornadas') {
        const practicanteId = url.searchParams.get('practicante_id');
        const result = await erpReadService.listJornadas({
          practicanteId: practicanteId ? Number(practicanteId) : undefined,
          desde: url.searchParams.get('desde') ?? undefined,
          hasta: url.searchParams.get('hasta') ?? undefined,
          page: Number(url.searchParams.get('page') ?? 1),
          perPage: Number(url.searchParams.get('per_page') ?? 50),
        });
        sendJson(res, 200, {
          data: result.rows,
          meta: {
            page: result.page,
            per_page: result.perPage,
            total: result.total,
          },
        });
        return;
      }

      const resumenMatch = path.match(
        /^\/api\/v1\/practicantes\/(\d+)\/resumen$/,
      );
      if (method === 'GET' && resumenMatch) {
        const periodoParam = (url.searchParams.get('periodo') ??
          'mes') as StatsPeriod;
        const periodo: StatsPeriod =
          periodoParam === 'semana' ||
          periodoParam === 'mes' ||
          periodoParam === 'total'
            ? periodoParam
            : 'mes';
        const resumen = await statsService.getResumenByPracticanteId(
          Number(resumenMatch[1]),
          periodo,
        );
        if (!resumen) {
          sendJson(res, 404, {
            error: { code: 404, message: 'Practicante no encontrado.' },
          });
          return;
        }
        sendJson(res, 200, resumenPayload(resumen));
        return;
      }

      if (method === 'GET' && path === '/api/v1/reportes/ranking') {
        const periodoRaw = url.searchParams.get('periodo') ?? 'mes';
        const criterioRaw = url.searchParams.get('criterio') ?? 'asistencia';
        if (!isStatsPeriod(periodoRaw) || !isRankingCriterio(criterioRaw)) {
          sendJson(res, 400, {
            error: { code: 400, message: 'periodo o criterio inválido.' },
          });
          return;
        }
        const areaRaw = url.searchParams.get('area');
        if (areaRaw && !(PRACTICANTE_AREAS as readonly string[]).includes(areaRaw)) {
          sendJson(res, 404, {
            error: {
              code: 404,
              message: `Área inexistente: ${areaRaw}.`,
            },
          });
          return;
        }
        if (url.searchParams.get('area_id') && !areaRaw) {
          sendJson(res, 400, {
            error: {
              code: 400,
              message: 'Usa el parámetro area (software, video, admin, marketing, fotografia, diseno).',
            },
          });
          return;
        }
        const limite = Number(url.searchParams.get('limite') ?? 10);
        if (
          !Number.isInteger(limite) ||
          limite < RANKING_MIN_LIMIT ||
          limite > RANKING_API_MAX_LIMIT
        ) {
          sendJson(res, 400, {
            error: { code: 400, message: 'limite debe estar entre 3 y 100.' },
          });
          return;
        }
        const practicanteId = url.searchParams.get('practicante_id');
        const incluir =
          url.searchParams.get('incluir_cesados') === '1' ||
          url.searchParams.get('incluir_cesados') === 'true';
        const result = await rankingService.getRanking({
          periodo: periodoRaw,
          area: areaRaw ?? null,
          criterio: criterioRaw,
          limite,
          incluirCesados: incluir || undefined,
          practicanteId: practicanteId ? Number(practicanteId) : undefined,
          fechaReferencia: url.searchParams.get('fecha_referencia') ?? undefined,
        });
        sendJson(res, 200, rankingPayload(result));
        return;
      }

      if (method === 'GET' && path === '/api/v1/reportes/ranking/snapshots') {
        const rows = await rankingService.listSnapshots({
          periodo: url.searchParams.get('periodo') ?? undefined,
          desde: url.searchParams.get('desde') ?? undefined,
          hasta: url.searchParams.get('hasta') ?? undefined,
          area: url.searchParams.get('area') ?? undefined,
        });
        sendJson(res, 200, { data: rows });
        return;
      }

      const snapshotMatch = path.match(
        /^\/api\/v1\/reportes\/ranking\/snapshots(?:\/(\d+))?$/,
      );
      if (snapshotMatch) {
        const snapshotId = snapshotMatch[1]
          ? Number(snapshotMatch[1])
          : null;
        if (method === 'GET' && snapshotId) {
          const row = await rankingService.getSnapshotById(snapshotId);
          if (!row) {
            sendJson(res, 404, {
              error: { code: 404, message: 'Snapshot no encontrado.' },
            });
            return;
          }
          sendJson(res, 200, { data: row });
          return;
        }
        if (method === 'POST' && !snapshotId) {
          const body = (await parseEstadoBody(req).catch(
            () => ({}),
          )) as Record<string, unknown>;
          const periodoRaw = String(body.periodo ?? 'mes');
          const criterioRaw = String(body.criterio ?? 'asistencia');
          if (!isStatsPeriod(periodoRaw) || !isRankingCriterio(criterioRaw)) {
            sendJson(res, 400, {
              error: { code: 400, message: 'periodo o criterio inválido.' },
            });
            return;
          }
          const generated = await rankingService.generateSnapshot({
            periodo: periodoRaw,
            area: typeof body.area === 'string' ? body.area : null,
            criterio: criterioRaw,
            limite: RANKING_API_MAX_LIMIT,
            persistSnapshot: true,
          });
          sendJson(res, 200, rankingPayload(generated));
          return;
        }
        if (snapshotId && (method === 'PATCH' || method === 'DELETE')) {
          if (method === 'DELETE') {
            const ok = await rankingService.deleteSnapshot(snapshotId);
            if (!ok) {
              sendJson(res, 404, {
                error: { code: 404, message: 'Snapshot no encontrado.' },
              });
              return;
            }
            sendJson(res, 200, { data: { id: snapshotId, anulado: true } });
            return;
          }
          const body = (await parseEstadoBody(req).catch(
            () => ({}),
          )) as Record<string, unknown>;
          if (body.anulado === false || body.deleted_at === null) {
            const ok = await rankingService.restoreSnapshot(snapshotId);
            if (!ok) {
              sendJson(res, 404, {
                error: { code: 404, message: 'Snapshot no encontrado.' },
              });
              return;
            }
            sendJson(res, 200, { data: { id: snapshotId, anulado: false } });
            return;
          }
          sendJson(res, 400, {
            error: { code: 400, message: 'Nada que actualizar.' },
          });
          return;
        }
      }

      sendJson(res, 404, {
        error: { code: 404, message: 'Ruta no encontrada.' },
      });
    } catch (error) {
      logger.error('Error en API HTTP del bot:', error);
      sendJson(res, 500, {
        error: { code: 500, message: 'Error interno del bot.' },
      });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`API HTTP del bot escuchando en 0.0.0.0:${port}`);
  });

  return server;
}
