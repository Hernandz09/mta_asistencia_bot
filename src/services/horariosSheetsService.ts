import { google, sheets_v4 } from 'googleapis';
import { GoogleConfig } from '../config/google';
import {
  GOOGLE_SHEETS_SCOPE,
  HORARIOS_DATA_RANGE,
  HORARIOS_HEADER_RANGE,
  HORARIOS_HEADERS,
  HORARIOS_SHEET_NAME,
  PRACTICANTES_SHEET_NAME,
} from '../config/constants';

// Filas pre-cableadas con dropdown + fórmula, para que una fila nueva
// tipeada a mano ya venga con el autocompletado listo sin correr el script.
const LINKED_ROW_COUNT = 200;

const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

// La leyenda vive dos columnas a la derecha de los datos (deja una columna
// de separación libre), para que quede visible sin interferir con A:E.
const LEGEND_START_COLUMN_INDEX = HORARIOS_HEADERS.length + 1;

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

  /**
   * En hojas con locale en español (y la mayoría de locales no-inglés),
   * Sheets usa ";" como separador de argumentos de fórmula en vez de ",",
   * porque la coma es el separador decimal. Sin esto, cualquier fórmula
   * escrita por código sale "#ERROR!" en un Sheet con locale es_ES.
   */
  protected async getFormulaSeparator(): Promise<string> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const locale = spreadsheet.data.properties?.locale ?? 'en_US';
    return locale.toLowerCase().startsWith('en') ? ',' : ';';
  }

  private async getSheetId(): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheetId = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === HORARIOS_SHEET_NAME,
    )?.properties?.sheetId;

    if (sheetId === undefined || sheetId === null) {
      throw new Error(`No se encontró la hoja ${HORARIOS_SHEET_NAME}`);
    }

    return sheetId;
  }

  private letterForColumn(index: number): string {
    return String.fromCharCode('A'.charCodeAt(0) + index);
  }

  /** Tabla de referencia "1 = Lunes" … "6 = Sábado" junto a los datos. */
  private async writeDayLegend(): Promise<void> {
    const startColumn = this.letterForColumn(LEGEND_START_COLUMN_INDEX);
    const endColumn = this.letterForColumn(LEGEND_START_COLUMN_INDEX + 1);

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${HORARIOS_SHEET_NAME}!${startColumn}1:${endColumn}${DAY_NAMES.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['dia', 'día de la semana'],
          ...DAY_NAMES.map((name, index) => [String(index + 1), name]),
        ],
      },
    });
  }

  /**
   * Conecta esta hoja con `Practicantes`: dropdown de "nombre" que sugiere
   * los nombres ya cargados en `Practicantes`, y la columna `discord_id` pasa
   * a ser una fórmula que se autocompleta según el nombre elegido — así ya
   * no hace falta (ni conviene) pegar el ID a mano fila por fila. Se aplica
   * a `LINKED_ROW_COUNT` filas para que las filas nuevas ya vengan listas.
   * Seguro de re-ejecutar.
   */
  async linkToPracticantes(): Promise<void> {
    const sheetId = await this.getSheetId();
    const sep = await this.getFormulaSeparator();

    const discordIdFormulas: string[][] = [];
    for (let row = 2; row <= LINKED_ROW_COUNT + 1; row++) {
      discordIdFormulas.push([
        `=IFERROR(INDEX(${PRACTICANTES_SHEET_NAME}!$A:$A${sep}MATCH(B${row}${sep}${PRACTICANTES_SHEET_NAME}!$B:$B${sep}0))${sep}"")`,
      ]);
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${HORARIOS_SHEET_NAME}!A2:A${LINKED_ROW_COUNT + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: discordIdFormulas },
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            setDataValidation: {
              range: {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 1 + LINKED_ROW_COUNT,
                startColumnIndex: 1,
                endColumnIndex: 2,
              },
              rule: {
                condition: {
                  type: 'ONE_OF_RANGE',
                  values: [
                    {
                      userEnteredValue: `=${PRACTICANTES_SHEET_NAME}!$B$2:$B$${LINKED_ROW_COUNT + 1}`,
                    },
                  ],
                },
                showCustomUi: true,
                strict: false,
              },
            },
          },
        ],
      },
    });
  }

  /**
   * Encabezado fijo y resaltado, dropdown 1-6 en "dia", bandas de color
   * alternadas por practicante, leyenda de días y columnas autoajustadas.
   * Solo formato, no toca datos; seguro de re-ejecutar cada vez que se
   * agregan practicantes.
   */
  async applyReadabilityFormatting(rows: string[][]): Promise<void> {
    const sheetId = await this.getSheetId();
    const columnCount = HORARIOS_HEADERS.length;

    await this.writeDayLegend();

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
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: LEGEND_START_COLUMN_INDEX,
            endColumnIndex: LEGEND_START_COLUMN_INDEX + 2,
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

    if (rows.length > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: 1 + rows.length,
            startColumnIndex: 2,
            endColumnIndex: 3,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: ['1', '2', '3', '4', '5', '6'].map((value) => ({
                userEnteredValue: value,
              })),
            },
            showCustomUi: true,
            strict: true,
          },
        },
      });

      const bandColors = [
        { red: 1, green: 1, blue: 1 },
        { red: 0.925, green: 0.945, blue: 0.976 },
      ];
      let colorIndex = 0;
      let groupStartIndex = 0;

      for (let i = 1; i <= rows.length; i++) {
        const isBoundary =
          i === rows.length || rows[i][1] !== rows[groupStartIndex][1];

        if (isBoundary) {
          requests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: groupStartIndex + 1,
                endRowIndex: i + 1,
                startColumnIndex: 0,
                endColumnIndex: columnCount,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: bandColors[colorIndex % bandColors.length],
                },
              },
              fields: 'userEnteredFormat.backgroundColor',
            },
          });
          colorIndex++;
          groupStartIndex = i;
        }
      }
    }

    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: LEGEND_START_COLUMN_INDEX + 2,
        },
      },
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
  }
}
