import ExcelJS from 'exceljs';
import type { Response } from 'express';

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-');
}

/**
 * Escapes a CSV cell.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote so spreadsheet
 * software does not evaluate untrusted data as a formula.
 */
function toCsvCell(value: ExportRow[string]): string {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function sendCsv(res: Response, rows: ExportRow[], filename: string): void {
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  const lines = [
    headers.map(toCsvCell).join(','),
    ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(filename)}.csv"`);
  // Leading BOM so Excel opens the file as UTF-8. Written as an escape rather
  // than a literal character, which is invisible and easily stripped.
  res.send(`\uFEFF${lines.join('\r\n')}`);
}

export async function sendXlsx(
  res: Response,
  rows: ExportRow[],
  filename: string,
  sheetName = 'Export',
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduCore';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  sheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 4, 14), 40),
  }));

  for (const row of rows) {
    sheet.addRow(row);
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF1F5' } };
  headerRow.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  if (rows.length > 0 && headers.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(filename)}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

/** Dispatches to the requested format. */
export async function sendExport(
  res: Response,
  rows: ExportRow[],
  filename: string,
  format: 'csv' | 'xlsx',
  sheetName?: string,
): Promise<void> {
  if (format === 'csv') {
    sendCsv(res, rows, filename);
    return;
  }
  await sendXlsx(res, rows, filename, sheetName);
}
