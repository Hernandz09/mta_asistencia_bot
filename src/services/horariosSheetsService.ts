import { google, sheets_v4 } from 'googleapis';
import { GoogleConfig } from '../config/google';
import {
  GOOGLE_SHEETS_SCOPE,
  HORARIOS_DATA_RANGE,
  HORARIOS_HEADER_RANGE,
  HORARIOS_HEADERS,
  HORARIOS_SHEET_NAME,
} from '../config/constants';

export class HorariosSheetsService {
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
      (s) => s.properties?.title === HORARIOS_SHEET_NAME,
    );

    if (!sheet) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: { properties: { title: HORARIOS_SHEET_NAME } },
            },
          ],
        },
      });
    }

    const headerResponse = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: HORARIOS_HEADER_RANGE,
    });

    const existingHeaders = headerResponse.data.values?.[0] ?? [];

    if (existingHeaders.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: HORARIOS_HEADER_RANGE,
        valueInputOption: 'RAW',
        requestBody: {
          values: [HORARIOS_HEADERS as unknown as string[]],
        },
      });
    }
  }

  /** Filas de datos (sin encabezado), tal cual vienen del Sheet. */
  async readAll(): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: HORARIOS_DATA_RANGE,
    });

    const rows = response.data.values ?? [];
    return rows.slice(1) as string[][];
  }

  /**
   * Reemplaza todas las filas de datos por `rows`. Usado por el script de
   * seed para que sea seguro re-ejecutarlo sin duplicar filas.
   */
  async overwriteAll(rows: string[][]): Promise<void> {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: HORARIOS_DATA_RANGE,
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: HORARIOS_HEADER_RANGE,
      valueInputOption: 'RAW',
      requestBody: {
        values: [HORARIOS_HEADERS as unknown as string[]],
      },
    });

    if (rows.length === 0) {
      return;
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${HORARIOS_SHEET_NAME}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }
}
