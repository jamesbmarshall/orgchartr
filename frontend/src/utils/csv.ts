/**
 * Minimal RFC4180-style CSV parser: handles quoted fields, embedded commas,
 * embedded newlines within quotes, and "" as an escaped quote.
 */
const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeSpreadsheetFormula(value: string): string {
  if (/^'[=+\-@\t\r]/.test(value)) return `'${value}`;
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function restoreSpreadsheetFormulaEscape(value: string): string {
  if (/^''[=+\-@\t\r]/.test(value)) return value.slice(1);
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Flush the final field/row if the file doesn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
