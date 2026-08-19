import { google, sheets_v4 } from 'googleapis';
import { GoogleConfig } from '../config/google';
import {
  ATTENDANCE_STATUS,
  GOOGLE_SHEETS_SCOPE,
  SHEET_DATA_RANGE,
  SHEET_HEADER_RANGE,
  SHEET_HEADERS,
  SHEET_NAME,
} from '../config/constants';
import { AttendanceRecord } from '../interfaces/attendance.interface';

const STATUS_COLORS: Record<string, { red: number; green: number; blue: number }> = {
  [ATTENDANCE_STATUS.PUNTUAL]: { red: 0.851, green: 0.918, blue: 0.827 },
  [ATTENDANCE_STATUS.TARDANZA]: { red: 1, green: 0.949, blue: 0.8 },
  [ATTENDANCE_STATUS.FUERA_DE_HORARIO]: { red: 0.988, green: 0.851, blue: 0.788 },
  [ATTENDANCE_STATUS.INCOMPLETO]: { red: 0.851, green: 0.851, blue: 0.851 },
};

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function rowToRecord(row: unknown[], rowIndex: number): AttendanceRecord {
  const [
    rowDiscordId,
    username,
    rowDate,
    entryTime,
    exitTime,
    status,
    horasTrabajadas,
    horasRestantes,
  ] = row as string[];

  return {
    rowIndex,
    discordId: rowDiscordId,
    username: username ?? '',
    date: rowDate,
    entryTime: entryTime ?? '',
    exitTime: exitTime ?? '',
    status: status ?? '',
    horasTrabajadas: toNullableNumber(horasTrabajadas),
    horasRestantes: horasRestantes || null,
  };
}

export class SheetsService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(config: GoogleConfig) {
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: [GOOGLE_SHEETS_SCOPE],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = config.sheetsId;
  }

  async ensureSheetExists(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME,
    );

    if (!sheet) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: SHEET_NAME },
              },
            },
          ],
        },
      });
    }

    // Se reescribe siempre (no solo si está vacío) para que un rename de
    // columna en el código (ej. horas_esperadas -> horas_restantes) se
    // refleje solo con reiniciar el bot, sin tocar el Sheet a mano.
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: SHEET_HEADER_RANGE,
      valueInputOption: 'RAW',
      requestBody: {
        values: [SHEET_HEADERS as unknown as string[]],
      },
    });
  }

  async findTodayRecord(
    discordId: string,
    date: string,
  ): Promise<AttendanceRecord | null> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: SHEET_DATA_RANGE,
    });

    const rows = response.data.values ?? [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (row[0] === discordId && row[2] === date) {
        return rowToRecord(row, i + 1);
      }
    }

    return null;
  }

  /** Filas con entrada marcada pero sin salida, para una fecha dada. */
  async findOpenRecordsForDate(date: string): Promise<AttendanceRecord[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: SHEET_DATA_RANGE,
    });

    const rows = response.data.values ?? [];
    const openRecords: AttendanceRecord[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const hasEntry = Boolean(row[3]);
      const hasExit = Boolean(row[4]);

      if (row[2] === date && hasEntry && !hasExit) {
        openRecords.push(rowToRecord(row, i + 1));
      }
    }

    return openRecords;
  }

  /** Registros de un practicante entre dos fechas YYYY-MM-DD, inclusive. */
  async findRecordsInRange(
    discordId: string,
    startDate: string,
    endDate: string,
  ): Promise<AttendanceRecord[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: SHEET_DATA_RANGE,
    });

    const rows = response.data.values ?? [];
    const records: AttendanceRecord[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (
        row[0] === discordId &&
        row[2] >= startDate &&
        row[2] <= endDate
      ) {
        records.push(rowToRecord(row, i + 1));
      }
    }

    return records;
  }

  async appendEntry(
    discordId: string,
    username: string,
    date: string,
    entryTime: string,
    status: string,
  ): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: SHEET_DATA_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[discordId, username, date, entryTime, '', status, '', '']],
      },
    });
  }

  async updateExit(
    rowIndex: number,
    exitTime: string,
    status: string,
    horasTrabajadas: number,
    horasRestantes: string,
  ): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!E${rowIndex}:H${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[exitTime, status, horasTrabajadas, horasRestantes]],
      },
    });
  }

  private async getSheetInfo(): Promise<{
    sheetId: number;
    conditionalFormatCount: number;
  }> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME,
    );

    if (sheet?.properties?.sheetId === undefined || sheet.properties.sheetId === null) {
      throw new Error(`No se encontró la hoja ${SHEET_NAME}`);
    }

    return {
      sheetId: sheet.properties.sheetId,
      conditionalFormatCount: sheet.conditionalFormats?.length ?? 0,
    };
  }

  /**
   * Encabezado fijo y resaltado, columnas autoajustadas, y color por estado
   * (Puntual/Tardanza/Fuera de horario/Incompleto) en la columna "estado".
   * Solo formato, no toca datos; seguro de re-ejecutar.
   */
  async applyReadabilityFormatting(): Promise<void> {
    const { sheetId, conditionalFormatCount } = await this.getSheetInfo();
    const columnCount = SHEET_HEADERS.length;
    const statusColumnIndex = SHEET_HEADERS.indexOf('estado');

    const requests: sheets_v4.Schema$Request[] = [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.204, green: 0.396, blue: 0.643 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields:
            'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
    ];

    // Reglas de formato condicional previas se borran antes de re-agregarlas,
    // para que el script sea seguro de re-ejecutar sin duplicarlas.
    for (let i = 0; i < conditionalFormatCount; i++) {
      requests.push({ deleteConditionalFormatRule: { sheetId, index: 0 } });
    }

    for (const [status, color] of Object.entries(STATUS_COLORS)) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                startColumnIndex: statusColumnIndex,
                endColumnIndex: statusColumnIndex + 1,
              },
            ],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: status }],
              },
              format: { backgroundColor: color },
            },
          },
          index: 0,
        },
      });
    }

    const hoursColumnStart = SHEET_HEADERS.indexOf('horas_trabajadas');

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: hoursColumnStart,
          endColumnIndex: hoursColumnStart + 1, // solo horas_trabajadas; horas_restantes ya es texto formateado
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'NUMBER', pattern: '0.##" h"' },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    });

    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: columnCount,
        },
      },
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
  }
}
