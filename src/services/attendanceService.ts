import { Pool } from 'mysql2/promise';
import { BUSINESS_RULES } from '../config/business';
import { ATTENDANCE_STATUS } from '../config/constants';
import { AppConfig } from '../config/env';
import {
  AttendanceStatus,
  AttendanceStatusResult,
} from '../interfaces/attendance.interface';
import { AttendanceError } from '../utils/errors';
import {
  formatDurationHoursWords,
  getCurrentTime,
  getCurrentWeekRange,
  getTodayDate,
  limaLocalToUtc,
} from '../utils/date';
import { logger } from '../utils/logger';
import { DashboardService } from './dashboardService';
import { calcularJornada } from './jornadaRules';
import { MysqlAttendanceStore } from './mysqlAttendanceStore';
import { ScheduleBlock, ScheduleService } from './scheduleService';
import { SheetsService } from './sheetsService';

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  horasAcumuladas: number;
  meta: number;
  diferencia: number;
}

function padTime(time: string): string {
  const parts = time.split(':');
  if (parts.length === 2) return `${time}:00`;
  return time;
}

function blockTimes(block: ScheduleBlock | null): {
  start: string | null;
  end: string | null;
} {
  return {
    start: block ? padTime(block.start) : null,
    end: block ? padTime(block.end) : null,
  };
}

function estadoEntradaToStatus(estado: string | null): AttendanceStatus {
  switch (estado) {
    case 'PUNTUAL':
      return ATTENDANCE_STATUS.PUNTUAL;
    case 'PUNTUAL_ANTICIPADO':
      return ATTENDANCE_STATUS.PUNTUAL_ANTICIPADO;
    case 'TARDANZA':
      return ATTENDANCE_STATUS.TARDANZA;
    case 'FUERA_DE_HORARIO':
      return ATTENDANCE_STATUS.FUERA_DE_HORARIO;
    case 'SIN_MARCA':
      return ATTENDANCE_STATUS.SIN_REGISTRO;
    default:
      return ATTENDANCE_STATUS.SIN_REGISTRO;
  }
}

export class AttendanceService {
  private store: MysqlAttendanceStore;
  private sheetsService: SheetsService | null;
  private dashboardService: DashboardService | null;
  private scheduleService: ScheduleService;
  private timezone: string;

  constructor(
    config: AppConfig,
    scheduleService: ScheduleService,
    pool: Pool,
    sheetsService: SheetsService | null = null,
  ) {
    this.store = new MysqlAttendanceStore(pool);
    this.sheetsService = sheetsService;
    this.dashboardService = config.dashboard
      ? new DashboardService(config.dashboard)
      : null;
    this.scheduleService = scheduleService;
    this.timezone = config.timezone;
  }

  async initialize(): Promise<void> {
    await this.store.ping();
    logger.info('MySQL: almacenamiento principal listo');

    if (this.sheetsService) {
      try {
        await this.sheetsService.ensureSheetExists();
        logger.info('Google Sheets: respaldo de emergencia habilitado');
      } catch (error) {
        logger.warn(
          'Google Sheets no disponible; el bot sigue con MySQL:',
          error,
        );
        this.sheetsService = null;
      }
    } else {
      logger.info('Google Sheets desactivado (respaldo de emergencia no configurado)');
    }

    if (this.dashboardService) {
      logger.info('Sync con dashboard habilitado');
    }
  }

  async registerEntry(
    discordId: string,
    username: string,
  ): Promise<{
    date: string;
    entryTime: string;
    status: AttendanceStatus;
  }> {
    const practicante = await this.requirePracticante(discordId);
    const date = getTodayDate(this.timezone);
    const entryTime = getCurrentTime(this.timezone);

    const existing = await this.store.findTodayJornada(practicante.id, date);
    if (existing?.entradaReal) {
      throw new AttendanceError(
        'Entry already exists for today',
        'Ya registraste tu entrada hoy.',
      );
    }

    const schedule = this.scheduleService.getSchedule(discordId, date);
    const { start, end } = blockTimes(schedule);
    const tolerances = await this.store.getToleranceConfig(practicante.id);
    const calc = calcularJornada(entryTime, null, start, end, tolerances);
    const entradaUtc = limaLocalToUtc(date, padTime(entryTime));

    try {
      await this.store.insertMarcacion({
        practicanteId: practicante.id,
        tipo: 'ENTRADA',
        marcadoEnUtc: entradaUtc,
        idempotencyKey: `bot:entrada:${discordId}:${date}`,
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AttendanceError(
          'Entry already exists for today',
          'Ya registraste tu entrada hoy.',
        );
      }
      throw error;
    }

    await this.store.upsertJornada({
      practicanteId: practicante.id,
      fecha: date,
      horaEntradaProgramada: start,
      horaSalidaProgramada: end,
      entradaRealUtc: entradaUtc,
      salidaRealUtc: null,
      estadoEntrada: calc.estadoEntrada,
      estadoSalida: calc.estadoSalida,
      estadoJornada: calc.estadoJornada,
      horasComputadas: calc.horasComputadas,
      horasPorJustificar: calc.horasPorJustificar,
      minutosTardanza: calc.minutosTardanza,
    });

    const status = estadoEntradaToStatus(calc.estadoEntrada);
    await this.backupEntryToSheets(discordId, username, date, entryTime, status);
    await this.syncEntryToDashboard(
      discordId,
      username,
      date,
      entryTime,
      status,
    );

    return { date, entryTime, status };
  }

  async registerExit(discordId: string): Promise<{
    date: string;
    exitTime: string;
    horasTrabajadas: number;
    horasRestantes: string;
  }> {
    const practicante = await this.requirePracticante(discordId);
    const date = getTodayDate(this.timezone);
    const exitTime = getCurrentTime(this.timezone);
    const jornada = await this.store.findTodayJornada(practicante.id, date);

    if (!jornada?.entradaReal) {
      throw new AttendanceError(
        'No entry found for today',
        'No tienes una entrada registrada hoy. Marca tu entrada primero.',
      );
    }

    if (jornada.salidaReal) {
      throw new AttendanceError(
        'Exit already registered',
        'Ya registraste tu salida hoy.',
      );
    }

    const entryTime = getCurrentTime(this.timezone, jornada.entradaReal);
    const schedule = this.scheduleService.getSchedule(discordId, date);
    const { start, end } = blockTimes(schedule);
    const tolerances = await this.store.getToleranceConfig(practicante.id);
    const calc = calcularJornada(entryTime, exitTime, start, end, tolerances);
    const salidaUtc = limaLocalToUtc(date, padTime(exitTime));

    await this.store.insertMarcacion({
      practicanteId: practicante.id,
      tipo: 'SALIDA',
      marcadoEnUtc: salidaUtc,
      idempotencyKey: `bot:salida:${discordId}:${date}`,
    });

    await this.store.upsertJornada({
      practicanteId: practicante.id,
      fecha: date,
      horaEntradaProgramada: start ?? jornada.horaEntradaProgramada,
      horaSalidaProgramada: end ?? jornada.horaSalidaProgramada,
      entradaRealUtc: jornada.entradaReal,
      salidaRealUtc: salidaUtc,
      estadoEntrada: calc.estadoEntrada,
      estadoSalida: calc.estadoSalida,
      estadoJornada: calc.estadoJornada,
      horasComputadas: calc.horasComputadas,
      horasPorJustificar: calc.horasPorJustificar,
      minutosTardanza: calc.minutosTardanza,
    });

    const horasRestantes = formatDurationHoursWords(calc.horasPorJustificar);

    await this.backupExitToSheets(
      discordId,
      date,
      exitTime,
      calc.horasComputadas,
      horasRestantes,
      estadoEntradaToStatus(calc.estadoEntrada),
    );
    await this.syncExitToDashboard(discordId, date, exitTime);

    return {
      date,
      exitTime,
      horasTrabajadas: calc.horasComputadas,
      horasRestantes,
    };
  }

  async getTodayStatus(discordId: string): Promise<AttendanceStatusResult> {
    const date = getTodayDate(this.timezone);
    const practicante = await this.store.findPracticanteByDiscord(discordId);

    if (!practicante) {
      return {
        date,
        entryTime: null,
        exitTime: null,
        status: ATTENDANCE_STATUS.SIN_REGISTRO,
        horasTrabajadas: null,
        horasRestantes: null,
      };
    }

    const jornada = await this.store.findTodayJornada(practicante.id, date);
    if (!jornada) {
      return {
        date,
        entryTime: null,
        exitTime: null,
        status: ATTENDANCE_STATUS.SIN_REGISTRO,
        horasTrabajadas: null,
        horasRestantes: null,
      };
    }

    return {
      date: jornada.fecha,
      entryTime: jornada.entradaReal
        ? getCurrentTime(this.timezone, jornada.entradaReal)
        : null,
      exitTime: jornada.salidaReal
        ? getCurrentTime(this.timezone, jornada.salidaReal)
        : null,
      status: estadoEntradaToStatus(jornada.estadoEntrada),
      horasTrabajadas: jornada.entradaReal ? jornada.horasComputadas : null,
      horasRestantes: jornada.salidaReal
        ? formatDurationHoursWords(jornada.horasPorJustificar)
        : null,
    };
  }

  async getWeeklySummary(discordId: string): Promise<WeeklySummary> {
    const { startDate, endDate } = getCurrentWeekRange(this.timezone);
    const practicante = await this.store.findPracticanteByDiscord(discordId);
    const meta = practicante
      ? await this.store.getWeeklyGoalHours(practicante.id)
      : BUSINESS_RULES.weeklyGoalHours;
    const horasAcumuladas = practicante
      ? await this.store.sumHorasSemana(practicante.id, startDate, endDate)
      : 0;

    return {
      startDate,
      endDate,
      horasAcumuladas: Math.round(horasAcumuladas * 100) / 100,
      meta,
      diferencia: Math.round((horasAcumuladas - meta) * 100) / 100,
    };
  }

  async closeUnfinishedEntries(date?: string): Promise<number> {
    const targetDate = date ?? getTodayDate(this.timezone);
    const openRecords = await this.store.findOpenJornadasForDate(targetDate);

    for (const jornada of openRecords) {
      const entryTime = jornada.entradaReal
        ? getCurrentTime(this.timezone, jornada.entradaReal)
        : null;
      const tolerances = await this.store.getToleranceConfig(
        jornada.practicanteId,
      );
      const calc = calcularJornada(
        entryTime,
        null,
        jornada.horaEntradaProgramada,
        jornada.horaSalidaProgramada,
        tolerances,
      );

      await this.store.upsertJornada({
        practicanteId: jornada.practicanteId,
        fecha: targetDate,
        horaEntradaProgramada: jornada.horaEntradaProgramada,
        horaSalidaProgramada: jornada.horaSalidaProgramada,
        entradaRealUtc: jornada.entradaReal,
        salidaRealUtc: null,
        estadoEntrada: calc.estadoEntrada,
        estadoSalida: 'SIN_SALIDA',
        estadoJornada: 'CERRADA',
        horasComputadas: 0,
        horasPorJustificar: calc.horasPorJustificar,
        minutosTardanza: calc.minutosTardanza,
      });

      if (jornada.discordId) {
        await this.syncExitToDashboard(
          jornada.discordId,
          targetDate,
          BUSINESS_RULES.autoClose.fallbackExitTime,
        );
      }
    }

    if (openRecords.length > 0) {
      logger.info(
        `Cierre automático MySQL: ${openRecords.length} jornada(s) SIN_SALIDA (${targetDate})`,
      );
    }

    return openRecords.length;
  }

  private async requirePracticante(discordId: string) {
    const practicante = await this.store.findPracticanteByDiscord(discordId);
    if (!practicante) {
      throw new AttendanceError(
        'Unregistered discord user',
        'No estás registrado como practicante. Pide al encargado que vincule tu Discord.',
      );
    }
    return practicante;
  }

  private async backupEntryToSheets(
    discordId: string,
    username: string,
    date: string,
    entryTime: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (!this.sheetsService) return;
    try {
      const existing = await this.sheetsService.findTodayRecord(discordId, date);
      if (existing) return;
      await this.sheetsService.appendEntry(
        discordId,
        username,
        date,
        entryTime,
        status,
      );
    } catch (error) {
      logger.warn('Respaldo Sheets (entrada) falló; MySQL ya guardó:', error);
    }
  }

  private async backupExitToSheets(
    discordId: string,
    date: string,
    exitTime: string,
    horasTrabajadas: number,
    horasRestantes: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (!this.sheetsService) return;
    try {
      const record = await this.sheetsService.findTodayRecord(discordId, date);
      if (!record) return;
      await this.sheetsService.updateExit(
        record.rowIndex,
        exitTime,
        status,
        horasTrabajadas,
        horasRestantes,
      );
    } catch (error) {
      logger.warn('Respaldo Sheets (salida) falló; MySQL ya guardó:', error);
    }
  }

  private async syncEntryToDashboard(
    discordId: string,
    username: string,
    date: string,
    entryTime: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (!this.dashboardService) return;
    try {
      await this.dashboardService.registerEntry(
        discordId,
        username,
        date,
        entryTime,
        status,
      );
    } catch (error) {
      logger.error('Error al sincronizar entrada con el dashboard:', error);
    }
  }

  private async syncExitToDashboard(
    discordId: string,
    date: string,
    exitTime: string,
  ): Promise<void> {
    if (!this.dashboardService) return;
    try {
      await this.dashboardService.registerExit(discordId, date, exitTime);
    } catch (error) {
      logger.error('Error al sincronizar salida con el dashboard:', error);
    }
  }
}
