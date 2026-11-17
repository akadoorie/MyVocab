/**
 * Minimal RFC 4180 CSV parser and serializer (PRD §8.3). Zero dependencies so it can live in core.
 * - Accepts CRLF or LF line endings and an optional UTF-8 BOM.
 * - Quoted fields may contain commas, quotes ("") and line breaks.
 */

export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

const BOM = String.fromCharCode(0xfeff);

export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  let line = 1;
  let quoteLine = 1;

  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      quoteLine = line;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new CsvSyntaxError('Unclosed quote', quoteLine);
  if (fieldStarted || field.length > 0 || row.length > 0) endRow();
  return rows;
}

function quoteField(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes rows with CRLF line endings. `bom: true` prefixes a UTF-8 BOM for Excel. */
export function serializeCsv(
  rows: readonly (readonly string[])[],
  opts: { bom?: boolean } = {},
): string {
  const body = rows.map((r) => r.map(quoteField).join(',')).join('\r\n');
  return (opts.bom ? BOM : '') + body + (rows.length > 0 ? '\r\n' : '');
}
