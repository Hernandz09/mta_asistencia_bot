import { google, sheets_v4 } from 'googleapis';
import { GoogleConfig } from '../config/google';
import {
  CLASES_SHEET_NAME,
  GOOGLE_SHEETS_SCOPE,
  HORARIOS_SHEET_NAME,
  PRACTICANTES_SHEET_NAME,
} from '../config/constants';

const DAY_COLUMN_HEADERS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const TITLE_ROW = 1;
const HEADER_ROW = 2;
const FIRST_PRACTICANTE_ROW = 3;

const GREEN = { red: 0.788, green: 0.933, blue: 0.804 };
const GRAY = { red: 0.851, green: 0.851, blue: 0.851 };
const YELLOW = { red: 1, green: 0.925, blue: 0.702 };
const BLUE = { red: 0.792, green: 0.882, blue: 0.973 };
const HEADER_BLUE = { red: 0.204, green: 0.396, blue: 0.643 };

export class ClasesSheetsService {
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

  private async ensureSheetExists(): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    let sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === CLASES_SHEET_NAME,
    );

    if (!sheet) {
      const created = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: CLASES_SHEET_NAME } } }],
        },
      });
      const sheetId = created.data.replies?.[0]?.addSheet?.properties?.sheetId;
      if (sheetId === undefined || sheetId === null) {
        throw new Error(`No se pudo crear la hoja ${CLASES_SHEET_NAME}`);
      }
      return sheetId;
    }

    const sheetId = sheet.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      throw new Error(`No se encontró la hoja ${CLASES_SHEET_NAME}`);
    }
    return sheetId;
  }

  private dayColumnLetter(dayNumber: number): string {
    // día 1 (lunes) => columna D, ... día 6 (sábado) => columna I
    return String.fromCharCode('D'.charCodeAt(0) + (dayNumber - 1));
  }

  /**
   * En hojas con locale en español (y la mayoría de locales no-inglés),
   * Sheets usa ";" como separador de argumentos de fórmula en vez de ",",
   * porque la coma es el separador decimal. Sin esto, cualquier fórmula
   * escrita por código sale "#ERROR!" en un Sheet con locale es_ES.
   */
  private async getFormulaSeparator(): Promise<string> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const locale = spreadsheet.data.properties?.locale ?? 'en_US';
    return locale.toLowerCase().startsWith('en') ? ',' : ';';
  }

  private dayBlockFormula(
    practicanteRow: number,
    motivoRow: number,
    dayNumber: number,
    sep: string,
  ): string {
    const day = String(dayNumber);
    const motivoCell = `${this.dayColumnLetter(dayNumber)}${motivoRow}`;

    return (
      `=IFERROR(TEXT(TIMEVALUE(FILTER(${HORARIOS_SHEET_NAME}!$D:$D${sep}` +
      `${HORARIOS_SHEET_NAME}!$B:$B=$A${practicanteRow}${sep}${HORARIOS_SHEET_NAME}!$C:$C&""="${day}"))${sep}"h:mmam/pm")` +
      `&" - "&` +
      `TEXT(TIMEVALUE(FILTER(${HORARIOS_SHEET_NAME}!$E:$E${sep}` +
      `${HORARIOS_SHEET_NAME}!$B:$B=$A${practicanteRow}${sep}${HORARIOS_SHEET_NAME}!$C:$C&""="${day}"))${sep}"h:mmam/pm")${sep}` +
      `${motivoCell})`
    );
  }

  private totalHorasFormula(practicanteRow: number, sep: string): string {
    return (
      `=SUMPRODUCT((${HORARIOS_SHEET_NAME}!$B$2:$B$500=$A${practicanteRow})*` +
      `IFERROR(TIMEVALUE(${HORARIOS_SHEET_NAME}!$E$2:$E$500)-TIMEVALUE(${HORARIOS_SHEET_NAME}!$D$2:$D$500)${sep}0))*24`
    );
  }

  /**
   * (Re)construye por completo la hoja Clases a partir de la lista de
   * practicantes (en el orden que deben aparecer). Solo lectura para el
   * bot — nunca se lee desde código, es puramente para el humano. Seguro
   * de re-ejecutar: limpia y reescribe todo.
   */
  async build(nombres: string[]): Promise<void> {
    const sheetId = await this.ensureSheetExists();
    const sep = await this.getFormulaSeparator();
    const count = nombres.length;

    const lastPracticanteRow = FIRST_PRACTICANTE_ROW + count - 1;
    const motivoTitleRow = lastPracticanteRow + 2;
    const motivoHeaderRow = motivoTitleRow + 1;
    const firstMotivoRow = motivoHeaderRow + 1;
    const lastMotivoRow = firstMotivoRow + count - 1;
    const legendTitleRow = lastMotivoRow + 2;
    const notesStartRow = legendTitleRow + 5;
    const lastColumnLetter = 'J';

    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${CLASES_SHEET_NAME}!A1:${lastColumnLetter}${notesStartRow + 2}`,
    });

    const rows: (string | number)[][] = [];

    rows.push(['HORARIO DE PRACTICAS - 30 HORAS SEMANALES']);
    rows.push([
      'Practicante',
      'Carrera',
      'Ciclo',
      ...DAY_COLUMN_HEADERS,
      'Total horas',
    ]);

    nombres.forEach((nombre, i) => {
      const row = FIRST_PRACTICANTE_ROW + i;
      const motivoRow = firstMotivoRow + i;

      rows.push([
        nombre,
        `=IFERROR(VLOOKUP($A${row}${sep}${PRACTICANTES_SHEET_NAME}!$B:$D${sep}2${sep}FALSE)${sep}"")`,
        `=IFERROR(VLOOKUP($A${row}${sep}${PRACTICANTES_SHEET_NAME}!$B:$D${sep}3${sep}FALSE)${sep}"")`,
        ...[1, 2, 3, 4, 5, 6].map((day) =>
          this.dayBlockFormula(row, motivoRow, day, sep),
        ),
        this.totalHorasFormula(row, sep),
      ]);
    });

    rows.push([]);
    rows.push(['MOTIVO (días sin práctica)']);
    rows.push(['Practicante', '', '', ...DAY_COLUMN_HEADERS, '']);

    nombres.forEach((nombre) => {
      rows.push([nombre]);
    });

    rows.push([]);
    rows.push(['LEYENDA']);
    rows.push(['', 'Bloque de prácticas']);
    rows.push(['', 'Día bloqueado por clases']);
    rows.push(['', 'Día libre (ya completa sus 30 horas)']);
    rows.push(['', 'Total calculado automáticamente desde Horarios']);
    rows.push([]);
    rows.push([
      'Completá la grilla de Motivo de arriba para indicar por qué un practicante no tiene bloque de práctica ese día: "Clases" o "Libre".',
    ]);
    rows.push([
      'Esta hoja se genera automáticamente desde Horarios/Practicantes. Para agregar un practicante nuevo, corré "npm run setup:practicantes-clases" de nuevo.',
    ]);

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${CLASES_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    await this.applyFormatting(sheetId, {
      count,
      lastPracticanteRow,
      motivoTitleRow,
      motivoHeaderRow,
      firstMotivoRow,
      lastMotivoRow,
      legendTitleRow,
    });
  }

  private async applyFormatting(
    sheetId: number,
    layout: {
      count: number;
      lastPracticanteRow: number;
      motivoTitleRow: number;
      motivoHeaderRow: number;
      firstMotivoRow: number;
      lastMotivoRow: number;
      legendTitleRow: number;
    },
  ): Promise<void> {
    const {
      count,
      lastPracticanteRow,
      motivoTitleRow,
      motivoHeaderRow,
      firstMotivoRow,
      lastMotivoRow,
      legendTitleRow,
    } = layout;

    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const existingRuleCount =
      spreadsheet.data.sheets?.find((s) => s.properties?.sheetId === sheetId)
        ?.conditionalFormats?.length ?? 0;

    const boldHeaderRequest = (rowIndex: number, endColumnIndex: number) => ({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_BLUE,
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    const requests: sheets_v4.Schema$Request[] = [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 2 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: TITLE_ROW - 1,
            endRowIndex: TITLE_ROW,
            startColumnIndex: 0,
            endColumnIndex: 10,
          },
          mergeType: 'MERGE_ALL',
        },
      },
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: TITLE_ROW - 1,
            endRowIndex: TITLE_ROW,
            startColumnIndex: 0,
            endColumnIndex: 10,
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 14 },
            },
          },
          fields: 'userEnteredFormat.textFormat',
        },
      },
      boldHeaderRequest(HEADER_ROW - 1, 10),
      boldHeaderRequest(motivoTitleRow - 1, 10),
      boldHeaderRequest(motivoHeaderRow - 1, 10),
      boldHeaderRequest(legendTitleRow - 1, 10),
    ];

    // Swatches de la leyenda (columna A de cada fila de leyenda).
    [GREEN, GRAY, YELLOW, BLUE].forEach((color, i) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: legendTitleRow + i,
            endRowIndex: legendTitleRow + i + 1,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
          cell: { userEnteredFormat: { backgroundColor: color } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });
    });

    // Dropdown Clases/Libre en la grilla de Motivo.
    if (count > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: firstMotivoRow - 1,
            endRowIndex: lastMotivoRow,
            startColumnIndex: 3,
            endColumnIndex: 9,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Clases' },
                { userEnteredValue: 'Libre' },
              ],
            },
            showCustomUi: true,
            strict: true,
          },
        },
      });
    }

    // Reglas de formato condicional anteriores se borran antes de re-agregar.
    for (let i = 0; i < existingRuleCount; i++) {
      requests.push({ deleteConditionalFormatRule: { sheetId, index: 0 } });
    }

    const mainGridRange = {
      sheetId,
      startRowIndex: FIRST_PRACTICANTE_ROW - 1,
      endRowIndex: lastPracticanteRow,
      startColumnIndex: 3,
      endColumnIndex: 9,
    };
    const motivoGridRange = {
      sheetId,
      startRowIndex: firstMotivoRow - 1,
      endRowIndex: lastMotivoRow,
      startColumnIndex: 3,
      endColumnIndex: 9,
    };

    const conditionalRules: sheets_v4.Schema$ConditionalFormatRule[] = [
      {
        ranges: [mainGridRange],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '-' }] },
          format: { backgroundColor: GREEN },
        },
      },
      {
        ranges: [mainGridRange, motivoGridRange],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Clases' }] },
          format: { backgroundColor: GRAY },
        },
      },
      {
        ranges: [mainGridRange, motivoGridRange],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Libre' }] },
          format: { backgroundColor: YELLOW },
        },
      },
    ];

    for (const rule of conditionalRules) {
      requests.push({ addConditionalFormatRule: { rule, index: 0 } });
    }

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: FIRST_PRACTICANTE_ROW - 1,
          endRowIndex: lastPracticanteRow,
          startColumnIndex: 9,
          endColumnIndex: 10,
        },
        cell: { userEnteredFormat: { backgroundColor: BLUE } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    });

    requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 10 },
      },
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
  }
}
