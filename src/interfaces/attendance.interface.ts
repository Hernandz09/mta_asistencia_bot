import { ATTENDANCE_STATUS } from '../config/constants';

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export interface AttendanceRecord {
  rowIndex: number;
  discordId: string;
  username: string;
  date: string;
  entryTime: string;
  exitTime: string;
  status: string;
  horasTrabajadas: number | null;
  /** Texto ya formateado ("3 horas 25 minutos"), no un número — ver sheetsService. */
  horasRestantes: string | null;
}

export interface AttendanceStatusResult {
  date: string;
  entryTime: string | null;
  exitTime: string | null;
  status: AttendanceStatus;
  horasTrabajadas: number | null;
  horasRestantes: string | null;
}
