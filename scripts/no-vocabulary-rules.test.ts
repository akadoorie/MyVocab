import { describe, expect, it } from 'vitest';
import { countCsvDataRows, findViolations, MAX_ALLOWED_CSV_ROWS } from './no-vocabulary-rules';

const csv = (rows: number) =>
  ['lang,text,type', ...Array.from({ length: rows }, (_, i) => `en,sample-word-${i},word`)].join(
    '\n',
  );

describe('countCsvDataRows', () => {
  it('excludes the header and blank lines', () => {
    expect(countCsvDataRows('a,b\n1,2\n\n3,4\n')).toBe(2);
  });

  it('counts a quoted multi-line cell as one row and handles CRLF and BOM', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(countCsvDataRows(`${bom}a,b\r\n"line1\nline2",x\r\n5,6`)).toBe(2);
  });

  it('returns 0 for an empty file', () => {
    expect(countCsvDataRows('')).toBe(0);
  });
});

describe('findViolations', () => {
  it('passes ordinary source files', () => {
    expect(findViolations([{ path: 'apps/web/src/App.tsx' }, { path: 'README.md' }])).toEqual([]);
  });

  it.each([
    'starter.csv',
    'seed/starter.csv',
    'apps/api/data.sql',
    'dump.sqlite',
    'local.db',
    'words.xlsx',
    'exports/myvocab-export-2026-11-16-1430/README.md',
    'vocab.export.json',
    'content/words.json',
    'backup.zip',
  ])('blocks %s', (path) => {
    expect(findViolations([{ path, content: 'x' }])).toHaveLength(1);
  });

  it('allows schema migrations and the synthetic sample', () => {
    expect(
      findViolations([
        { path: 'apps/api/migrations/0000_init.sql' },
        { path: 'seed/sample.csv', content: csv(10) },
        { path: 'apps/api/test/fixtures/import-errors.csv', content: csv(3) },
      ]),
    ).toEqual([]);
  });

  it('normalizes Windows paths', () => {
    expect(findViolations([{ path: 'seed\\starter.csv' }])).toHaveLength(1);
  });

  it(`blocks an allow-listed CSV with more than ${MAX_ALLOWED_CSV_ROWS} rows`, () => {
    const result = findViolations([{ path: 'seed/sample.csv', content: csv(21) }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.reason).toMatch(/21 data rows/);
  });

  it('allows exactly the maximum number of rows', () => {
    expect(findViolations([{ path: 'seed/sample.csv', content: csv(20) }])).toEqual([]);
  });
});
