import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  RANKING_CRITERIOS,
  RANKING_DEFAULT_LIMIT,
  RankingCriterio,
  STATS_PERIODS,
  StatsPeriod,
} from '../config/constants';
import {
    addDays,
    eachDateInclusive,
    getCalendarMonthRange,
    getCurrentMinutes,
    getCurrentWeekRange,
    getPreviousCalendarMonthRange,
    getTodayDate,
    getWeekdayNumber,
    limaLocalToUtc,
} from '../utils/date';
import { logger } from '../utils/logger';
import { ConfigService } from './configService';
import {
  RankedRow,
  RankingCandidate,
  applyMovement,
  assignPositions,
  compareRanking,
  minDaysRequired,
  rankingDisplayName,
} from './rankingMath';
import {
  HorarioDiaStats,
  JornadaStatsRow,
  PeriodSummary,
  effectiveWindow,
  summarizePeriod,
} from './statsMath';

export interface RankingQuery {
  periodo: StatsPeriod;
  area?: string | null;
  criterio: RankingCriterio;
  limite: number;
  incluirCesados?: boolean;
  practicanteId?: number;
  discordId?: string;
  fechaReferencia?: string;
  persistSnapshot?: boolean;
}

export interface RankingResult {
  periodo: StatsPeriod;
  periodoLabel: string;
  criterio: RankingCriterio;
  area: string | null;
  nominalStart: string;
  nominalEnd: string;
  effectiveStart: string;
  effectiveEnd: string;
  totalPracticantes: number;
  totalCalificados: number;
  noCalificados: number;
  diasMinimos: number;
  emptyReason: 'none' | 'no_records' | 'no_area' | 'not_enough_days';
  rows: RankedRow[];
  qualifiedAll: RankedRow[];
  viewer: RankedRow | null;
  calculatedAt: Date;
  cacheTtlSeconds: number;
}

interface HorarioAsignado {
  dias: HorarioDiaStats[];
  refrigerioMin: number;
}

interface CacheEntry {
  value: RankingResult;
  expiresAt: number;
}

interface SnapshotRow {
  id: number;
  tipoPeriodo: string;
  periodoInicio: string;
  periodoFin: string;
  area: string;
  criterio: string;
  practicanteId: number;
  posicion: number;
  calificado: boolean;
  generadoEn: Date;
  deletedAt: Date | null;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function asDateTime(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function asTimeString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');
    const seconds = String(value.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 8) : text;
}

function emptySummary(): PeriodSummary {
  return summarizePeriod([], [], [], 0);
}

export function isRankingCriterio(value: string): value is RankingCriterio {
  return (RANKING_CRITERIOS as readonly string[]).includes(value);
}

export function isStatsPeriod(value: string): value is StatsPeriod {
  return (STATS_PERIODS as readonly string[]).includes(value);
}

export class RankingService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly pool: Pool,
    private readonly timezone: string,
    private readonly configService: ConfigService,
  ) {}

  async getConfig() {
    return this.configService.getRankingConfig();
  }

  async getRanking(query: RankingQuery): Promise<RankingResult> {
    const limite = Math.max(1, query.limite);
    const cacheKey = [
      query.periodo,
      query.area ?? 'todas',
      query.criterio,
      String(limite),
      query.incluirCesados ? '1' : '0',
      query.fechaReferencia ?? '',
      String(query.practicanteId ?? query.discordId ?? ''),
    ].join(':');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const result = await this.buildRanking({ ...query, limite });
    const ttlMs = (result.cacheTtlSeconds || 300) * 1000;
    this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + ttlMs });

    if (query.persistSnapshot !== false && result.emptyReason === 'none') {
      this.persistSnapshot(result).catch((error) => {
        logger.warn('No se pudo guardar snapshot de ranking:', error);
      });
    }

    return result;
  }

  async getPositionFor(
    discordId: string,
    periodo: StatsPeriod,
    area: string,
  ): Promise<{ position: number; total: number }> {
    const result = await this.getRanking({
      periodo,
      area,
      criterio: 'nota',
      limite: 100,
      persistSnapshot: false,
      discordId,
    });
    if (result.viewer?.calificado) {
      return {
        position: result.viewer.posicion,
        total: Math.max(1, result.totalCalificados),
      };
    }
    return { position: 0, total: Math.max(1, result.totalCalificados) };
  }

  async listSnapshots(filters: {
    periodo?: string;
    desde?: string;
    hasta?: string;
    area?: string;
  }): Promise<SnapshotRow[]> {
    const where = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    if (filters.periodo) {
      where.push('tipo_periodo = ?');
      values.push(filters.periodo.toUpperCase());
    }
    if (filters.area) {
      where.push('area = ?');
      values.push(filters.area);
    }
    if (filters.desde) {
      where.push('periodo_inicio >= ?');
      values.push(filters.desde);
    }
    if (filters.hasta) {
      where.push('periodo_inicio <= ?');
      values.push(filters.hasta);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM ranking_snapshots
       WHERE ${where.join(' AND ')}
       ORDER BY periodo_inicio DESC, posicion ASC
       LIMIT 500`,
      values,
    );
    return rows.map((row) => this.mapSnapshot(row));
  }

  async getSnapshotById(id: number): Promise<SnapshotRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM ranking_snapshots WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ? this.mapSnapshot(rows[0]) : null;
  }

  async generateSnapshot(query: RankingQuery): Promise<RankingResult> {
    const result = await this.getRanking({ ...query, persistSnapshot: true });
    await this.persistSnapshot(result);
    return result;
  }

  async deleteSnapshot(id: number): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE ranking_snapshots SET deleted_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return result.affectedRows > 0;
  }

  async restoreSnapshot(id: number): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'UPDATE ranking_snapshots SET deleted_at = NULL WHERE id = ?',
      [id],
    );
    return result.affectedRows > 0;
  }

  async snapshotDuePeriods(): Promise<void> {
    const today = getTodayDate(this.timezone);
    const weekday = getWeekdayNumber(today);
    const month = getCalendarMonthRange(this.timezone);
    const jobs: Array<Promise<unknown>> = [];

    if (weekday === 7) {
      jobs.push(
        this.generateSnapshot({
          periodo: 'semana',
          criterio: 'asistencia',
          limite: 100,
          persistSnapshot: true,
        }),
      );
    }
    if (today === month.endDate) {
      jobs.push(
        this.generateSnapshot({
          periodo: 'mes',
          criterio: 'asistencia',
          limite: 100,
          persistSnapshot: true,
        }),
      );
    }
    await Promise.all(jobs);
  }

  private async buildRanking(query: RankingQuery): Promise<RankingResult> {
    const cfg = await this.configService.getRankingConfig();
    const todayActual = getTodayDate(this.timezone);
    const reference = query.fechaReferencia
      ? limaLocalToUtc(query.fechaReferencia, '12:00:00')
      : new Date();
    let today = getTodayDate(this.timezone, reference);
    if (today > todayActual) today = todayActual;

    const incluirCesados =
      query.incluirCesados ?? query.periodo === 'total';
    const globalStart = await this.configService.getAsistenciaFechaInicio();
    const nominal = this.nominalRange(query.periodo, today);
    const globalWindow = effectiveWindow({
      periodStart: nominal.startDate,
      periodEnd: nominal.endDate,
      globalStart,
      today,
    });

    const periodoLabel = this.periodoLabel(
      query.periodo,
      nominal.startDate,
      nominal.endDate,
      globalWindow?.start,
    );

    const base: Omit<RankingResult, 'emptyReason' | 'rows' | 'viewer'> & {
      emptyReason: RankingResult['emptyReason'];
      rows: RankedRow[];
      viewer: RankedRow | null;
    } = {
      periodo: query.periodo,
      periodoLabel,
      criterio: query.criterio,
      area: query.area ?? null,
      nominalStart: nominal.startDate,
      nominalEnd: nominal.endDate,
      effectiveStart: globalWindow?.start ?? nominal.startDate,
      effectiveEnd: globalWindow?.end ?? today,
      totalPracticantes: 0,
      totalCalificados: 0,
      noCalificados: 0,
      diasMinimos: cfg.diasMinimos,
      emptyReason: 'none',
      rows: [],
      qualifiedAll: [],
      viewer: null,
      calculatedAt: new Date(),
      cacheTtlSeconds: cfg.cacheSegundos,
    };

    if (!globalWindow) {
      return { ...base, emptyReason: 'no_records' };
    }

    const practicantes = await this.loadPracticantes(
      query.area ?? null,
      incluirCesados,
    );
    if (practicantes.length === 0) {
      return { ...base, emptyReason: query.area ? 'no_area' : 'not_enough_days' };
    }

    const ids = practicantes.map((row) => row.id);
    const [feriadoRows, jornadaRows, contarDiaEnCurso, weights] =
      await Promise.all([
        this.loadFeriadoRows(nominal.startDate, nominal.endDate),
        this.loadJornadas(ids, nominal.startDate, nominal.endDate),
        this.configService.getContarDiaEnCurso(),
        this.configService.getNoteWeights(),
      ]);

    const jornadasById = new Map<number, JornadaStatsRow[]>();
    for (const id of ids) jornadasById.set(id, []);
    for (const row of jornadaRows) {
      jornadasById.get(row.practicanteId)?.push(row.jornada);
    }

    const horarioById = new Map<number, HorarioAsignado>();
    for (const row of practicantes) {
      horarioById.set(row.id, await this.loadHorario(row.id));
    }

    const dates = eachDateInclusive(nominal.startDate, nominal.endDate);
    const nowMinutes = getCurrentMinutes(this.timezone);
    const defaultDias: HorarioDiaStats[] = [1, 2, 3, 4, 5].map((diaSemana) => ({
      diaSemana,
      horaEntrada: '09:00:00',
      horaSalida: '15:00:00',
      esLaborable: true,
    }));
    const periodBase = summarizePeriod(dates, [], defaultDias, 0, {
      today,
      nowMinutes,
      fromDate: globalWindow.start,
    });
    const diasMinimos = minDaysRequired(
      periodBase.diasLaborablesPeriodo,
      periodBase.programadas,
      cfg.diasMinimos,
      cfg.pctDiasMinimos,
    );
    base.diasMinimos = diasMinimos;

    const candidates: RankingCandidate[] = [];
    for (const row of practicantes) {
      const horario = horarioById.get(row.id) ?? { dias: [], refrigerioMin: 0 };
      const hasHorario = horario.dias.some((dia) => dia.esLaborable);
      if (!hasHorario) continue;

      const window = effectiveWindow({
        periodStart: nominal.startDate,
        periodEnd: nominal.endDate,
        globalStart,
        practicanteStart: row.fechaInicio,
        practicanteEnd: row.fechaFin,
        today,
      });
      const summary = window
        ? summarizePeriod(
            dates,
            jornadasById.get(row.id) ?? [],
            horario.dias,
            horario.refrigerioMin,
            {
              today,
              nowMinutes,
              fromDate: window.start,
              untilDate: row.fechaFin ?? undefined,
              feriados: this.feriadosFor(row, feriadoRows),
              contarDiaEnCurso,
              weights,
            },
          )
        : emptySummary();

      candidates.push({
        id: row.id,
        discordId: row.discordId,
        nombre: rankingDisplayName(row.nombres, row.apellidos),
        area: row.area,
        estado: row.estado,
        fechaInicio: row.fechaInicio,
        hasHorario: true,
        summary,
      });
    }

    base.totalPracticantes = candidates.length;
    if (candidates.length === 0) {
      return { ...base, emptyReason: query.area ? 'no_area' : 'not_enough_days' };
    }

    const qualified = candidates.filter(
      (row) => row.summary.programadas >= diasMinimos,
    );
    base.totalCalificados = qualified.length;
    base.noCalificados = candidates.length - qualified.length;

    if (qualified.length === 0) {
      const viewer = this.findViewer(candidates, query);
      return {
        ...base,
        emptyReason: 'not_enough_days',
        qualifiedAll: [],
        viewer: viewer
          ? {
              ...viewer,
              posicion: 0,
              calificado: false,
              posicionAnterior: null,
              movimiento: null,
            }
          : null,
      };
    }

    qualified.sort(
      (a, b) => compareRanking(a, b, query.criterio) || a.id - b.id,
    );
    let ranked = assignPositions(qualified, query.criterio);
    const previous = await this.loadPreviousPositions(query, nominal);
    ranked = applyMovement(ranked, previous);

    const viewerSource =
      this.findViewer(ranked, query) ?? this.findViewer(candidates, query);
    let viewer: RankedRow | null = null;
    if (viewerSource) {
      const inRanked = ranked.find((row) => row.id === viewerSource.id);
      viewer = inRanked ?? {
        ...viewerSource,
        posicion: 0,
        calificado: false,
        posicionAnterior: null,
        movimiento: null,
      };
    }

    return {
      ...base,
      emptyReason: 'none',
      rows: ranked.slice(0, query.limite),
      qualifiedAll: ranked,
      viewer,
    };
  }

  private findViewer(
    rows: Array<RankingCandidate | RankedRow>,
    query: RankingQuery,
  ): RankingCandidate | RankedRow | undefined {
    if (query.practicanteId) {
      return rows.find((row) => row.id === query.practicanteId);
    }
    if (query.discordId) {
      return rows.find((row) => row.discordId === query.discordId);
    }
    return undefined;
  }

  private nominalRange(
    periodo: StatsPeriod,
    today: string,
  ): { startDate: string; endDate: string } {
    const reference = limaLocalToUtc(today, '12:00:00');
    if (periodo === 'semana') {
      return getCurrentWeekRange(this.timezone, reference);
    }
    if (periodo === 'mes') {
      return getCalendarMonthRange(this.timezone, reference);
    }
    return { startDate: '2020-01-01', endDate: today };
  }

  private previousNominal(
    periodo: StatsPeriod,
    nominal: { startDate: string; endDate: string },
  ): { startDate: string; endDate: string } | null {
    if (periodo === 'semana') {
      return {
        startDate: addDays(nominal.startDate, -7),
        endDate: addDays(nominal.endDate, -7),
      };
    }
    if (periodo === 'mes') {
      return getPreviousCalendarMonthRange(nominal.startDate);
    }
    return null;
  }

  private periodoLabel(
    periodo: StatsPeriod,
    startDate: string,
    endDate: string,
    effectiveStart?: string,
  ): string {
    if (periodo === 'mes') {
      const [year, month] = endDate.split('-');
      const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];
      const base = `${meses[Number(month) - 1]} ${year}`;
      if (effectiveStart && effectiveStart > startDate) {
        return `${base} (desde el ${Number(effectiveStart.slice(8))})`;
      }
      return base;
    }
    if (periodo === 'semana') {
      const fmt = (iso: string) => {
        const [, m, d] = iso.split('-');
        return `${d}/${m}`;
      };
      return `Semana del ${fmt(startDate)} al ${fmt(endDate)}`;
    }
    return 'Histórico';
  }

  private async loadPracticantes(
    area: string | null,
    incluirCesados: boolean,
  ): Promise<
    Array<{
      id: number;
      discordId: string;
      nombres: string;
      apellidos: string;
      area: string;
      estado: RankingCandidate['estado'];
      fechaInicio: string | null;
      fechaFin: string | null;
    }>
  > {
    const where = incluirCesados
      ? "estado IN ('activo', 'cesado')"
      : "estado = 'activo'";
    const values: unknown[] = [];
    const areaFilter = area ? ' AND area = ?' : '';
    if (area) values.push(area);

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot AS discord_id, nombres, apellidos, area, estado,
              fecha_inicio, fecha_fin
       FROM practicantes
       WHERE ${where}${areaFilter}`,
      values,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      discordId: String(row.discord_id ?? ''),
      nombres: String(row.nombres ?? ''),
      apellidos: String(row.apellidos ?? ''),
      area: String(row.area),
      estado: row.estado as RankingCandidate['estado'],
      fechaInicio: row.fecha_inicio ? asDateString(row.fecha_inicio) : null,
      fechaFin: row.fecha_fin ? asDateString(row.fecha_fin) : null,
    }));
  }

  private async loadHorario(practicanteId: number): Promise<HorarioAsignado> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT hd.dia_semana, hd.hora_entrada, hd.hora_salida, hd.es_laborable,
              h.refrigerio_min
       FROM asignaciones_horario a
       JOIN horarios h ON h.id = a.horario_id
       JOIN horario_dias hd ON hd.horario_id = h.id
       WHERE a.practicante_id = ? AND a.vigente_hasta IS NULL`,
      [practicanteId],
    );
    return {
      dias: rows.map((row) => ({
        diaSemana: Number(row.dia_semana),
        horaEntrada: asTimeString(row.hora_entrada),
        horaSalida: asTimeString(row.hora_salida),
        esLaborable: Boolean(Number(row.es_laborable)),
      })),
      refrigerioMin: Number(rows[0]?.refrigerio_min ?? 0),
    };
  }

  private async loadJornadas(
    ids: number[],
    startDate: string,
    endDate: string,
  ): Promise<Array<{ practicanteId: number; jornada: JornadaStatsRow }>> {
    if (ids.length === 0) return [];
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT practicante_id, fecha, estado_entrada, estado_jornada,
              horas_computadas, horas_justificadas, horas_por_justificar
       FROM jornadas
       WHERE contexto = 'REGULAR'
         AND fecha BETWEEN ? AND ?
         AND practicante_id IN (${ids.map(() => '?').join(',')})`,
      [startDate, endDate, ...ids],
    );
    return rows.map((row) => ({
      practicanteId: Number(row.practicante_id),
      jornada: {
        fecha: asDateString(row.fecha),
        estadoEntrada: row.estado_entrada ? String(row.estado_entrada) : null,
        estadoJornada: String(row.estado_jornada),
        horasComputadas: Number(row.horas_computadas ?? 0),
        horasJustificadas: Number(row.horas_justificadas ?? 0),
        horasPorJustificar: Number(row.horas_por_justificar ?? 0),
      },
    }));
  }

  private async loadFeriadoRows(
    startDate: string,
    endDate: string,
  ): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT fecha, aplica_a, area, practicante_id
       FROM feriados WHERE fecha BETWEEN ? AND ?`,
      [startDate, endDate],
    );
    return rows;
  }

  private feriadosFor(
    practicante: { id: number; area: string },
    rows: RowDataPacket[],
  ): Set<string> {
    const dates = new Set<string>();
    for (const row of rows) {
      const aplica = String(row.aplica_a);
      if (aplica === 'todos') dates.add(asDateString(row.fecha));
      else if (aplica === 'area' && String(row.area ?? '') === practicante.area) {
        dates.add(asDateString(row.fecha));
      } else if (
        aplica === 'practicante' &&
        Number(row.practicante_id) === practicante.id
      ) {
        dates.add(asDateString(row.fecha));
      }
    }
    return dates;
  }

  private async loadPreviousPositions(
    query: RankingQuery,
    nominal: { startDate: string; endDate: string },
  ): Promise<Map<number, number>> {
    const previous = this.previousNominal(query.periodo, nominal);
    if (!previous) return new Map();
    try {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT practicante_id, posicion
         FROM ranking_snapshots
         WHERE deleted_at IS NULL
           AND tipo_periodo = ?
           AND periodo_inicio = ?
           AND criterio = ?
           AND area = ?
           AND calificado = 1`,
        [
          query.periodo.toUpperCase(),
          previous.startDate,
          query.criterio.toUpperCase(),
          query.area ?? 'todas',
        ],
      );
      return new Map(
        rows.map((row) => [Number(row.practicante_id), Number(row.posicion)]),
      );
    } catch (error) {
      logger.warn('No se pudieron leer snapshots de ranking:', error);
      return new Map();
    }
  }

  private async persistSnapshot(result: RankingResult): Promise<void> {
    if (result.qualifiedAll.length === 0) return;
    const tipo = result.periodo.toUpperCase();
    const criterio = result.criterio.toUpperCase();
    const area = result.area ?? 'todas';
    const values: unknown[] = [];
    const tuples = result.qualifiedAll.map((row) => {
      values.push(
        tipo,
        result.nominalStart,
        result.nominalEnd,
        area,
        criterio,
        row.id,
        row.posicion,
        row.summary.programadas,
        row.summary.asistidas,
        row.summary.puntuales,
        row.summary.tardanzas,
        row.summary.faltas,
        row.summary.pctAsistencia,
        row.summary.pctPuntualidad,
        row.summary.pctHoras,
        row.summary.horasAcumuladas,
        row.summary.nota,
        1,
      );
      return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    });

    try {
      await this.pool.query(
        `INSERT INTO ranking_snapshots (
           tipo_periodo, periodo_inicio, periodo_fin, area, criterio,
           practicante_id, posicion, dias_programados, dias_asistidos,
           dias_puntuales, tardanzas, faltas, pct_asistencia, pct_puntualidad,
           pct_horas, horas_acumuladas, nota, calificado
         ) VALUES ${tuples.join(',')}
         ON DUPLICATE KEY UPDATE
           posicion = VALUES(posicion),
           dias_programados = VALUES(dias_programados),
           dias_asistidos = VALUES(dias_asistidos),
           dias_puntuales = VALUES(dias_puntuales),
           tardanzas = VALUES(tardanzas),
           faltas = VALUES(faltas),
           pct_asistencia = VALUES(pct_asistencia),
           pct_puntualidad = VALUES(pct_puntualidad),
           pct_horas = VALUES(pct_horas),
           horas_acumuladas = VALUES(horas_acumuladas),
           nota = VALUES(nota),
           calificado = VALUES(calificado),
           generado_en = CURRENT_TIMESTAMP,
           deleted_at = NULL`,
        values,
      );
    } catch (error) {
      logger.warn('Snapshot de ranking no guardado:', error);
    }
  }

  private mapSnapshot(row: RowDataPacket): SnapshotRow {
    return {
      id: Number(row.id),
      tipoPeriodo: String(row.tipo_periodo),
      periodoInicio: asDateString(row.periodo_inicio),
      periodoFin: asDateString(row.periodo_fin),
      area: String(row.area),
      criterio: String(row.criterio),
      practicanteId: Number(row.practicante_id),
      posicion: Number(row.posicion),
      calificado: Boolean(Number(row.calificado)),
      generadoEn: asDateTime(row.generado_en),
      deletedAt: row.deleted_at ? asDateTime(row.deleted_at) : null,
    };
  }
}
