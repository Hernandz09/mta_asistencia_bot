import { google, sheets_v4 } from 'googleapis';
import { GoogleConfig } from '../config/google';
import {
  GOOGLE_SHEETS_SCOPE,
  PRACTICANTES_DATA_RANGE,
  PRACTICANTES_HEADER_RANGE,
  PRACTICANTES_HEADERS,
  PRACTICANTES_SHEET_NAME,
} from '../config/constants';

export class PracticantesSheetsService {
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
      (s) => s.properties?.title === PRACTICANTES_SHEET_NAME,
    );

    if (!sheet) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: PRACTICANTES_SHEET_NAME } } },
          ],
        },
      });
    }

    const headerResponse = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: PRACTICANTES_HEADER_RANGE,
    });

    const existingHeaders = headerResponse.data.values?.[0] ?? [];

    if (existingHeaders.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: PRACTICANTES_HEADER_RANGE,
        valueInputOption: 'RAW',
        requestBody: {
          values: [PRACTICANTES_HEADERS as unknown as string[]],
        },
      });
    }
  }

  /** Filas de datos (sin encabezado), tal cual vienen del Sheet. */
  async readAll(): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: PRACTICANTES_DATA_RANGE,
    });

    const rows = response.data.values ?? [];
    return rows.slice(1) as string[][];
  }

  /** Reemplaza todas las filas de datos por `rows`. Seguro de re-ejecutar. */
  async overwriteAll(rows: string[][]): Promise<void> {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: PRACTICANTES_DATA_RANGE,
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: PRACTICANTES_HEADER_RANGE,
      valueInputOption: 'RAW',
      requestBody: {
        values: [PRACTICANTES_HEADERS as unknown as string[]],
      },
    });

    if (rows.length === 0) {
      return;
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${PRACTICANTES_SHEET_NAME}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }

  async getSheetId(): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheetId = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === PRACTICANTES_SHEET_NAME,
    )?.properties?.sheetId;

    if (sheetId === undefined || sheetId === null) {
      throw new Error(`No se encontró la hoja ${PRACTICANTES_SHEET_NAME}`);
    }

    return sheetId;
  }

  /** Encabezado fijo y resaltado, columnas autoajustadas. Seguro de re-ejecutar. */
  async applyReadabilityFormatting(): Promise<void> {
    const sheetId = await this.getSheetId();
    const columnCount = PRACTICANTES_HEADERS.length;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
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
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: columnCount,
              },
            },
          },
        ],
      },
    });
  }
}
