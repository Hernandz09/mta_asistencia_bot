import { Pool, RowDataPacket } from 'mysql2/promise';
import { StatsPeriod } from '../config/constants';
import {
  eachDateInclusive,
  getCalendarMonthRange,
  getCurrentMinutes,
  getCurrentWeekRange,
  getTodayDate,
} from '../utils/date';
import { logger } from '../utils/logger';
import {
  HorarioDiaStats,
  JornadaStatsRow,
  PeriodSummary,
  buildPeriodDetalle,
  computeLevel,
  effectiveWindow,
  formatDateEs,
  monthLabelEs,
  sinceDaySuffix,
  summarizePeriod,
} from './statsMath';
import { ConfigService } from './configService';
import { RankingService } from './rankingService';

const CACHE_TTL_MS = 60_000;

export interface StatsPracticante {
  id: number;
  discordId: string;
  nombres: string;
  apellidos: string;
  displayName: string;
  area: string;
  estado: 'activo' | 'cesado' | 'suspendido';
  fechaInicio: string | null;
  fechaFin: string | null;
  creadoEn: string;
}

export interface StatsDayDetail {
  fecha: string;
  label: string;
  horas: number;
}

export interface StatsResumen {
  practicante: StatsPracticante;
  periodo: StatsPeriod;
  periodoLabel: string;
  startDate: string;
  endDate: string;
  nivel: number;
  allTimeHours: number;
  nextLevelHours: number;
  ranking: number;
  rankingTotal: number;
  summary: PeriodSummary;
  horasSemana: number;
  metaSemana: number;
  recupCumplidas: number;
  recupPendientes: number;
  pendientes: number;
  diasLaborablesPeriodo: number;
  effectiveStart: string;
  effectiveEnd: string;
  notaMes: number | null;
  detalle: StatsDayDetail[];
}

interface HorarioAsignado {
  dias: HorarioDiaStats[];
  refrigerioMin: number;
  limiteHorasSemana: number;
}

interface CacheEntry {
  value: StatsResumen;
  expiresAt: number;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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

function asDateTimeString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export class StatsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly pool: Pool,
    private readonly timezone: string,
    private readonly configService?: ConfigService,
    private readonly rankingService?: RankingService,
  ) {}

  async findPracticanteByDiscord(
    discordId: string,
  ): Promise<StatsPracticante | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot AS discord_id, nombres, apellidos, area, estado,
              fecha_inicio, fecha_fin, creado_en
       FROM practicantes
       WHERE id_externo_bot = ?
       LIMIT 1`,
      [discordId],
    );
    const row = rows[0];
    return row ? this.mapPracticante(row) : null;
  }

  async findPracticanteById(id: number): Promise<StatsPracticante | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, id_externo_bot AS discord_id, nombres, apellidos, area, estado,
              fecha_inicio, fecha_fin, creado_en
       FROM practicantes
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? this.mapPracticante(row) : null;
  }

  async getResumen(
    discordId: string,
    periodo: StatsPeriod,
  ): Promise<StatsResumen | null> {
    const practicante = await this.findPracticanteByDiscord(discordId);
    if (!practicante) {
      return null;
    }
    return this.getResumenForPracticante(practicante, periodo);
  }

  async getResumenByPracticanteId(
    id: number,
    periodo: StatsPeriod,
  ): Promise<StatsResumen | null> {
    const practicante = await this.findPracticanteById(id);
    if (!practicante) {
      return null;
    }
    return this.getResumenForPracticante(practicante, periodo);
  }

  private async getResumenForPracticante(
    practicante: StatsPracticante,
    periodo: StatsPeriod,
  ): Promise<StatsResumen> {
    const cacheKey = `${practicante.id}:${periodo}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const resumen = await this.buildResumen(practicante, periodo);
    this.cache.set(cacheKey, {
      value: resumen,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return resumen;
  }

  invalidate(discordId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${discordId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  private async buildResumen(
    practicante: StatsPracticante,
    periodo: StatsPeriod,
  ): Promise<StatsResumen> {
    const today = getTodayDate(this.timezone);
    const nominal = await this.resolveRange(practicante.id, periodo, today);
    const globalStart = this.configService
      ? await this.configService.getAsistenciaFechaInicio()
      : '2026-08-17';
    const window = effectiveWindow({
      periodStart: nominal.startDate,
      periodEnd: nominal.endDate,
      globalStart,
      practicanteStart: practicante.fechaInicio,
      practicanteEnd: practicante.fechaFin,
      today,
    });

    const loadStart = window?.start ?? nominal.startDate;
    const loadEnd = nominal.endDate;
    const [horario, jornadas, allTimeHours, recup, horasSemana, feriados, weights, hoursPerLevel, contarDiaEnCurso] =
      await Promise.all([
        this.loadHorario(practicante.id),
        this.loadJornadas(practicante.id, loadStart, loadEnd),
        this.loadAllTimeHours(practicante.id),
        this.loadRecuperaciones(practicante.id),
        this.loadHorasSemana(practicante.id),
        this.loadFeriados(practicante, loadStart, loadEnd),
        this.configService?.getNoteWeights() ?? Promise.resolve(undefined),
        this.configService?.getHoursPerLevel() ?? Promise.resolve(undefined),
        this.configService?.getContarDiaEnCurso() ?? Promise.resolve(false),
      ]);

    const summarizeDates = window
      ? eachDateInclusive(nominal.startDate, nominal.endDate)
      : [];
    const ctx = {
      today,
      nowMinutes: getCurrentMinutes(this.timezone),
      fromDate: window?.start,
      untilDate: practicante.fechaFin ?? undefined,
      feriados,
      contarDiaEnCurso,
      weights,
    };
    const summary = summarizePeriod(
      summarizeDates,
      jornadas,
      horario.dias,
      horario.refrigerioMin,
      ctx,
    );
    const { nivel, nextLevelHours } = computeLevel(
      allTimeHours,
      hoursPerLevel,
    );
    const ranking = this.rankingService
      ? await this.rankingService.getPositionFor(
          practicante.discordId,
          periodo,
          practicante.area,
        )
      : await this.computeRanking(practicante, nominal, {
          globalStart,
          today,
          nowMinutes: ctx.nowMinutes,
          contarDiaEnCurso,
          weights,
        });

    let notaMes: number | null = null;
    if (periodo === 'semana' && window) {
      const monthNominal = getCalendarMonthRange(this.timezone);
      const monthWindow = effectiveWindow({
        periodStart: monthNominal.startDate,
        periodEnd: monthNominal.endDate,
        globalStart,
        practicanteStart: practicante.fechaInicio,
        practicanteEnd: practicante.fechaFin,
        today,
      });
      if (monthWindow) {
        const monthJornadas = await this.loadJornadas(
          practicante.id,
          monthNominal.startDate,
          monthNominal.endDate,
        );
        const monthFeriados = await this.loadFeriados(
          practicante,
          monthNominal.startDate,
          monthNominal.endDate,
        );
        const monthSummary = summarizePeriod(
          eachDateInclusive(monthNominal.startDate, monthNominal.endDate),
          monthJornadas,
          horario.dias,
          horario.refrigerioMin,
          {
            ...ctx,
            fromDate: monthWindow.start,
            feriados: monthFeriados,
          },
        );
        notaMes = monthSummary.sinRegistros ? null : monthSummary.nota;
      }
    }

    const detalle = window
      ? buildPeriodDetalle(
          summarizeDates,
          jornadas,
          horario.dias,
          horario.refrigerioMin,
          ctx,
        )
      : [];

    return {
      practicante,
      periodo,
      periodoLabel: this.periodoLabel(
        periodo,
        nominal.startDate,
        nominal.endDate,
        window?.start,
      ),
      startDate: window?.start ?? nominal.startDate,
      endDate: window?.end ?? nominal.endDate,
      nivel,
      allTimeHours,
      nextLevelHours,
      ranking: ranking.position,
      rankingTotal: ranking.total,
      summary: window ? summary : { ...summary, sinRegistros: true, nota: 0 },
      horasSemana,
      metaSemana: horario.limiteHorasSemana,
      recupCumplidas: recup.cumplidas,
      recupPendientes: recup.pendientes,
      pendientes: summary.pendientes,
      diasLaborablesPeriodo: summary.diasLaborablesPeriodo,
      effectiveStart: window?.start ?? nominal.startDate,
      effectiveEnd: window?.end ?? nominal.endDate,
      notaMes,
      detalle,
    };
  }

  private periodoLabel(
    periodo: StatsPeriod,
    startDate: string,
    endDate: string,
    effectiveStart?: string,
  ): string {
    if (periodo === 'mes') {
      const suffix = effectiveStart
        ? sinceDaySuffix(startDate, effectiveStart)
        : '';
      return `${monthLabelEs(endDate)}${suffix}`;
    }
    if (periodo === 'semana') {
      return `Semana del ${formatDateEs(startDate)} al ${formatDateEs(endDate)}`;
    }
    return 'Histórico';
  }

  private async resolveRange(
    practicanteId: number,
    periodo: StatsPeriod,
    today: string,
  ): Promise<{ startDate: string; endDate: string }> {
    if (periodo === 'semana') {
      return getCurrentWeekRange(this.timezone);
    }
    if (periodo === 'mes') {
      return getCalendarMonthRange(this.timezone);
    }

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT LEAST(
         COALESCE((SELECT MIN(fecha) FROM jornadas WHERE practicante_id = ?), ?),
         COALESCE((SELECT fecha_inicio FROM practicantes WHERE id = ?), ?)
       ) AS inicio`,
      [practicanteId, today, practicanteId, today],
    );
    return { startDate: asDateString(rows[0]?.inicio ?? today), endDate: today };
  }

  private async loadFeriados(
    practicante: StatsPracticante,
    startDate: string,
    endDate: string,
  ): Promise<Set<string>> {
    const rows = await this.loadFeriadoRows(startDate, endDate);
    return this.feriadosFor(practicante, rows);
  }

  private async loadFeriadoRows(
    startDate: string,
    endDate: string,
  ): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT fecha, aplica_a, area, practicante_id
       FROM feriados
       WHERE fecha BETWEEN ? AND ?`,
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
      if (aplica === 'todos') {
        dates.add(asDateString(row.fecha));
        continue;
      }
      if (aplica === 'area' && String(row.area ?? '') === practicante.area) {
        dates.add(asDateString(row.fecha));
        continue;
      }
      if (
        aplica === 'practicante' &&
        Number(row.practicante_id) === practicante.id
      ) {
        dates.add(asDateString(row.fecha));
      }
    }
    return dates;
  }

  private async loadHorario(practicanteId: number): Promise<HorarioAsignado> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT hd.dia_semana, hd.hora_entrada, hd.hora_salida, hd.es_laborable,
              h.refrigerio_min, h.limite_horas_semana
       FROM asignaciones_horario a
       JOIN horarios h ON h.id = a.horario_id
       JOIN horario_dias hd ON hd.horario_id = h.id
       WHERE a.practicante_id = ? AND a.vigente_hasta IS NULL`,
      [practicanteId],
    );

    const dias: HorarioDiaStats[] = rows.map((row) => ({
      diaSemana: Number(row.dia_semana),
      horaEntrada: asTimeString(row.hora_entrada),
      horaSalida: asTimeString(row.hora_salida),
      esLaborable: Boolean(Number(row.es_laborable)),
    }));

    return {
      dias,
      refrigerioMin: Number(rows[0]?.refrigerio_min ?? 0),
      limiteHorasSemana: Number(rows[0]?.limite_horas_semana ?? 30),
    };
  }

  private async loadJornadas(
    practicanteId: number,
    startDate: string,
    endDate: string,
  ): Promise<JornadaStatsRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT fecha, estado_entrada, estado_jornada,
              horas_computadas, horas_justificadas, horas_por_justificar
       FROM jornadas
       WHERE practicante_id = ?
         AND contexto = 'REGULAR'
         AND fecha BETWEEN ? AND ?`,
      [practicanteId, startDate, endDate],
    );
    return rows.map((row) => this.mapJornada(row));
  }

  private async loadAllTimeHours(practicanteId: number): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ROUND(COALESCE(SUM(horas_computadas + horas_justificadas), 0), 1) AS total
       FROM jornadas
       WHERE practicante_id = ? AND contexto = 'REGULAR'`,
      [practicanteId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async loadHorasSemana(practicanteId: number): Promise<number> {
    const week = getCurrentWeekRange(this.timezone);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ROUND(COALESCE(SUM(horas_computadas + horas_justificadas), 0), 1) AS total
       FROM jornadas
       WHERE practicante_id = ?
         AND contexto = 'REGULAR'
         AND fecha BETWEEN ? AND ?
         AND estado_jornada NOT IN ('NO_LABORABLE', 'VACACIONES', 'LICENCIA')`,
      [practicanteId, week.startDate, week.endDate],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async loadRecuperaciones(
    practicanteId: number,
  ): Promise<{ cumplidas: number; pendientes: number }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         SUM(estado = 'cumplida') AS cumplidas,
         SUM(estado IN ('programada', 'en_curso')) AS pendientes
       FROM recuperaciones
       WHERE practicante_id = ?`,
      [practicanteId],
    );
    return {
      cumplidas: Number(rows[0]?.cumplidas ?? 0),
      pendientes: Number(rows[0]?.pendientes ?? 0),
    };
  }

  private async computeRanking(
    practicante: StatsPracticante,
    nominal: { startDate: string; endDate: string },
    ctx: {
      globalStart: string;
      today: string;
      nowMinutes: number;
      contarDiaEnCurso: boolean;
      weights?: { asistencia: number; puntualidad: number; horas: number };
    },
  ): Promise<{ position: number; total: number }> {
    try {
      const [peers] = await this.pool.query<RowDataPacket[]>(
        `SELECT id, area, fecha_inicio, fecha_fin FROM practicantes
         WHERE area = ? AND (estado = 'activo' OR id = ?)`,
        [practicante.area, practicante.id],
      );
      if (peers.length === 0) {
        return { position: 1, total: 1 };
      }

      const peerIds = peers.map((row) => Number(row.id));
      const feriadoRows = await this.loadFeriadoRows(
        nominal.startDate,
        nominal.endDate,
      );

      const [jornadaRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT practicante_id, fecha, estado_entrada, estado_jornada,
                horas_computadas, horas_justificadas, horas_por_justificar
         FROM jornadas
         WHERE contexto = 'REGULAR'
           AND fecha BETWEEN ? AND ?
           AND practicante_id IN (${peerIds.map(() => '?').join(',')})`,
        [nominal.startDate, nominal.endDate, ...peerIds],
      );

      const byPracticante = new Map<number, JornadaStatsRow[]>();
      for (const id of peerIds) {
        byPracticante.set(id, []);
      }
      for (const row of jornadaRows) {
        const id = Number(row.practicante_id);
        byPracticante.get(id)?.push(this.mapJornada(row));
      }

      const horarioByPeer = new Map<number, HorarioAsignado>();
      for (const id of peerIds) {
        horarioByPeer.set(id, await this.loadHorario(id));
      }

      const dates = eachDateInclusive(nominal.startDate, nominal.endDate);
      const scores = peers.map((row) => {
        const id = Number(row.id);
        const fechaInicio = row.fecha_inicio
          ? asDateString(row.fecha_inicio)
          : null;
        const fechaFin = row.fecha_fin ? asDateString(row.fecha_fin) : null;
        const window = effectiveWindow({
          periodStart: nominal.startDate,
          periodEnd: nominal.endDate,
          globalStart: ctx.globalStart,
          practicanteStart: fechaInicio,
          practicanteEnd: fechaFin,
          today: ctx.today,
        });
        const horario = horarioByPeer.get(id) ?? {
          dias: [],
          refrigerioMin: 0,
          limiteHorasSemana: 30,
        };
        if (!window) {
          return { id, nota: 0 };
        }
        const summary = summarizePeriod(
          dates,
          byPracticante.get(id) ?? [],
          horario.dias,
          horario.refrigerioMin,
          {
            today: ctx.today,
            nowMinutes: ctx.nowMinutes,
            fromDate: window.start,
            untilDate: fechaFin ?? undefined,
            feriados: this.feriadosFor(
              { id, area: String(row.area) },
              feriadoRows,
            ),
            contarDiaEnCurso: ctx.contarDiaEnCurso,
            weights: ctx.weights,
          },
        );
        return { id, nota: summary.nota };
      });

      scores.sort((a, b) => b.nota - a.nota || a.id - b.id);
      const position = scores.findIndex((item) => item.id === practicante.id) + 1;
      return { position: position || 1, total: scores.length };
    } catch (error) {
      logger.error('Error al calcular ranking de stats:', error);
      return { position: 1, total: 1 };
    }
  }

  private mapPracticante(row: RowDataPacket): StatsPracticante {
    const nombres = String(row.nombres ?? '').trim();
    const apellidos = String(row.apellidos ?? '')
      .replace(/—/g, '')
      .trim();
    return {
      id: Number(row.id),
      discordId: String(row.discord_id ?? ''),
      nombres,
      apellidos,
      displayName: `${nombres} ${apellidos}`.trim(),
      area: String(row.area),
      estado: row.estado as StatsPracticante['estado'],
      fechaInicio: row.fecha_inicio ? asDateString(row.fecha_inicio) : null,
      fechaFin: row.fecha_fin ? asDateString(row.fecha_fin) : null,
      creadoEn: asDateTimeString(row.creado_en),
    };
  }

  private mapJornada(row: RowDataPacket): JornadaStatsRow {
    return {
      fecha: asDateString(row.fecha),
      estadoEntrada: row.estado_entrada ? String(row.estado_entrada) : null,
      estadoJornada: String(row.estado_jornada),
      horasComputadas: Number(row.horas_computadas ?? 0),
      horasJustificadas: Number(row.horas_justificadas ?? 0),
      horasPorJustificar: Number(row.horas_por_justificar ?? 0),
    };
  }
}
