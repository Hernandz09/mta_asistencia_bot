import { BUSINESS_RULES } from '../config/business';
import { AppConfig } from '../config/env';
import { ATTENDANCE_STATUS } from '../config/constants';
import {
  AttendanceStatus,
  AttendanceStatusResult,
} from '../interfaces/attendance.interface';
import { AttendanceError } from '../utils/errors';
import {
  computeHoursDifference,
  formatDurationHoursWords,
  getCurrentTime,
  getCurrentWeekRange,
  getTodayDate,
} from '../utils/date';
import { logger } from '../utils/logger';
import { DashboardService } from './dashboardService';
import { resolveAttendanceStatus, ScheduleService } from './scheduleService';
import { SheetsService } from './sheetsService';

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  horasAcumuladas: number;
  meta: number;
  diferencia: number;
}

export class AttendanceService {
  private sheetsService: SheetsService;
  private dashboardService: DashboardService | null;
  private scheduleService: ScheduleService;
  private timezone: string;

  constructor(config: AppConfig, scheduleService: ScheduleService) {
    this.sheetsService = new SheetsService(config.google);
    this.dashboardService = config.dashboard
      ? new DashboardService(config.dashboard)
      : null;
    this.scheduleService = scheduleService;
    this.timezone = config.timezone;
  }

  async initialize(): Promise<void> {
    await this.sheetsService.ensureSheetExists();

    if (this.dashboardService) {
      logger.info('Sync con dashboard habilitado');
    } else {
      logger.info(
        'Sync con dashboard desactivado (falta DASHBOARD_API_URL / ATTENDANCE_BOT_API_KEY)',
      );
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
    const date = getTodayDate(this.timezone);
    const entryTime = getCurrentTime(this.timezone);

    const existing = await this.sheetsService.findTodayRecord(discordId, date);

    if (existing) {
      throw new AttendanceError(
        'Entry already exists for today',
        'Ya registraste tu entrada hoy.',
      );
    }

    const schedule = this.scheduleService.getSchedule(discordId, date);
    const status = resolveAttendanceStatus(
      entryTime,
      schedule,
      BUSINESS_RULES.punctuality.toleranceMinutes,
    );

    await this.sheetsService.appendEntry(
      discordId,
      username,
      date,
      entryTime,
      status,
    );

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
    const date = getTodayDate(this.timezone);
    const exitTime = getCurrentTime(this.timezone);

    const record = await this.sheetsService.findTodayRecord(discordId, date);

    if (!record) {
      throw new AttendanceError(
        'No entry found for today',
        'No tienes una entrada registrada hoy. Marca tu entrada primero.',
      );
    }

    if (record.exitTime) {
      throw new AttendanceError(
        'Exit already registered',
        'Ya registraste tu salida hoy.',
      );
    }

    const schedule = this.scheduleService.getSchedule(discordId, record.date);
    const horasBloqueDelDia = schedule
      ? computeHoursDifference(schedule.start, schedule.end)
      : 0;
    const horasTrabajadas = computeHoursDifference(record.entryTime, exitTime);
    const horasRestantesNumero = Math.max(
      0,
      Math.round((horasBloqueDelDia - horasTrabajadas) * 100) / 100,
    );
    const horasRestantes = formatDurationHoursWords(horasRestantesNumero);

    await this.sheetsService.updateExit(
      record.rowIndex,
      exitTime,
      record.status,
      horasTrabajadas,
      horasRestantes,
    );

    await this.syncExitToDashboard(discordId, date, exitTime);

    return { date, exitTime, horasTrabajadas, horasRestantes };
  }

  async getTodayStatus(discordId: string): Promise<AttendanceStatusResult> {
    const date = getTodayDate(this.timezone);
    const record = await this.sheetsService.findTodayRecord(discordId, date);

    if (!record) {
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
      date: record.date,
      entryTime: record.entryTime || null,
      exitTime: record.exitTime || null,
      status: this.resolveStoredStatus(record.status),
      horasTrabajadas: record.horasTrabajadas,
      horasRestantes: record.horasRestantes,
    };
  }

  async getWeeklySummary(discordId: string): Promise<WeeklySummary> {
    const { startDate, endDate } = getCurrentWeekRange(this.timezone);
    const records = await this.sheetsService.findRecordsInRange(
      discordId,
      startDate,
      endDate,
    );

    const horasAcumuladas = records.reduce(
      (total, record) => total + (record.horasTrabajadas ?? 0),
      0,
    );
    const meta = BUSINESS_RULES.weeklyGoalHours;

    return {
      startDate,
      endDate,
      horasAcumuladas: Math.round(horasAcumuladas * 100) / 100,
      meta,
      diferencia: Math.round((horasAcumuladas - meta) * 100) / 100,
    };
  }

  /**
   * Cierra las entradas que quedaron abiertas al final del día (el
   * practicante marcó entrada pero nunca salida), usando la hora_fin de su
   * horario ese día como hora de salida. Pensado para correr una vez al día
   * desde un job (ver autoCloseJob).
   */
  async closeUnfinishedEntries(date?: string): Promise<number> {
    const targetDate = date ?? getTodayDate(this.timezone);
    const openRecords =
      await this.sheetsService.findOpenRecordsForDate(targetDate);

    for (const record of openRecords) {
      const schedule = this.scheduleService.getSchedule(
        record.discordId,
        targetDate,
      );
      const exitTime = schedule
        ? `${schedule.end}:00`
        : BUSINESS_RULES.autoClose.fallbackExitTime;
      const horasBloqueDelDia = schedule
        ? computeHoursDifference(schedule.start, schedule.end)
        : 0;
      const horasTrabajadas = computeHoursDifference(
        record.entryTime,
        exitTime,
      );
      const horasRestantesNumero = Math.max(
        0,
        Math.round((horasBloqueDelDia - horasTrabajadas) * 100) / 100,
      );
      const horasRestantes = formatDurationHoursWords(horasRestantesNumero);

      await this.sheetsService.updateExit(
        record.rowIndex,
        exitTime,
        ATTENDANCE_STATUS.INCOMPLETO,
        horasTrabajadas,
        horasRestantes,
      );

      await this.syncExitToDashboard(record.discordId, targetDate, exitTime);
    }

    if (openRecords.length > 0) {
      logger.info(
        `Cierre automático: ${openRecords.length} entrada(s) sin salida marcada(s) como Incompleto (${targetDate})`,
      );
    }

    return openRecords.length;
  }

  private async syncEntryToDashboard(
    discordId: string,
    username: string,
    date: string,
    entryTime: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (!this.dashboardService) {
      return;
    }

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
    if (!this.dashboardService) {
      return;
    }

    try {
      await this.dashboardService.registerExit(discordId, date, exitTime);
    } catch (error) {
      logger.error('Error al sincronizar salida con el dashboard:', error);
    }
  }

  private resolveStoredStatus(storedStatus: string): AttendanceStatus {
    const knownStatuses = Object.values(ATTENDANCE_STATUS) as string[];
    return knownStatuses.includes(storedStatus)
      ? (storedStatus as AttendanceStatus)
      : ATTENDANCE_STATUS.SIN_REGISTRO;
  }
}
