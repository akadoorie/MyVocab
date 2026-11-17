import { describe, expect, it } from 'vitest';
import { itemIdentityKey } from '../item/identity';
import type { ItemContent } from '../item/types';
import { LANGS } from '../test-fixtures';
import { joinList, splitList, translationColumn } from './columns';
import { planImport, type ExistingItem, type PlanContext } from './merge-planner';
import { parseImportCsv } from './parse-rows';
import { CsvSyntaxError, parseCsv, serializeCsv } from './rfc4180';
import { csvHeader, serializeItemsCsv, type ExportItem } from './serialize-items';

const HEADER =
  'lang,text,type,multiple_meanings,categories,translation_he,translation_en,explanation,synonyms,hints,status';
const SWIFT =
  'en,Swift,word,true,,מהיר|סנונית,,"Moving or able to move very fast|A small bird that flies very fast",fast|quick|rapid,"He gave a swift reply.|A swift nested under the roof.",published';
const MAHIR =
  'he,מהיר,word,false,,,fast|quick,"שנע או פועל במהירות רבה",זריז,"הרכבת המהירה הגיעה בזמן.",published';
const opts = { languages: LANGS };

const emptyCtx = (over: Partial<PlanContext> = {}): PlanContext => ({
  languages: LANGS,
  existing: new Map(),
  knownCategories: new Set(['home', 'food']),
  createMissingCategories: false,
  ...over,
});

describe('rfc4180', () => {
  it('parses quoted fields with commas, quotes and line breaks, CRLF and BOM', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(parseCsv(`${bom}a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",z`)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });

  it('keeps empty fields and handles a missing final newline or a trailing comma', () => {
    expect(parseCsv('a,,c\n1,2,')).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('reports an unclosed quote with its line', () => {
    expect(() => parseCsv('a\n"oops,b\nc')).toThrow(CsvSyntaxError);
    try {
      parseCsv('a\n"oops,b\nc');
    } catch (e) {
      expect((e as CsvSyntaxError).line).toBe(2);
    }
  });

  it('serializes with quoting only where needed, CRLF and an optional BOM', () => {
    const out = serializeCsv(
      [
        ['a', 'b,c', 'say "hi"', ' pad'],
        ['1', '', 'x\ny', 'z'],
      ],
      { bom: true },
    );
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('a,"b,c","say ""hi"""," pad"\r\n1,,"x\ny",z\r\n');
    expect(parseCsv(out)).toEqual([
      ['a', 'b,c', 'say "hi"', ' pad'],
      ['1', '', 'x\ny', 'z'],
    ]);
    expect(serializeCsv([])).toBe('');
  });
});

describe('columns', () => {
  it('splits and joins list cells', () => {
    expect(splitList(' a | b ||c ')).toEqual(['a', 'b', 'c']);
    expect(splitList('')).toEqual([]);
    expect(joinList(['a', 'b'])).toBe('a|b');
    expect(translationColumn('he')).toBe('translation_he');
  });
});

describe('parseImportCsv', () => {
  it('parses the PRD example rows', () => {
    const r = parseImportCsv(`${HEADER}\n${SWIFT}\n${MAHIR}\n`, opts);
    expect(r.errors).toEqual([]);
    expect(r.dataRowCount).toBe(2);
    expect(r.rows[0]).toMatchObject({
      row: 2,
      status: 'published',
      categories: [],
      content: {
        lang: 'en',
        text: 'Swift',
        type: 'word',
        multipleMeanings: true,
        translation: { he: ['מהיר', 'סנונית'] },
        synonyms: ['fast', 'quick', 'rapid'],
      },
    });
    expect(r.rows[1]?.content.translation).toEqual({ en: ['fast', 'quick'] });
  });

  it('accepts minimal columns in any order and skips blank lines', () => {
    const r = parseImportCsv(
      'TYPE,Text,lang,explanation\nexpr,Break the ice,en,Make people feel relaxed\n,,,\n',
      opts,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.status).toBeUndefined();
    expect(r.rows[0]?.content.multipleMeanings).toBe(false);
  });

  it('reports file errors: empty file, missing/unknown/duplicate columns, unknown language columns', () => {
    expect(parseImportCsv('', opts).errors[0]?.message).toMatch(/empty/);
    const r = parseImportCsv('lang,text,colour,translation_fr,text\n', opts);
    expect(r.errors.map((e) => e.message)).toEqual([
      'Unknown column "colour"',
      'Unknown language "fr" in column "translation_fr"',
      'Duplicate column "text"',
      'Missing required column "type"',
    ]);
  });

  it('reports an unclosed quote', () => {
    expect(parseImportCsv('lang,text,type\nen,"oops,word', opts).errors[0]?.message).toMatch(
      /unclosed/,
    );
  });

  it('enforces the row limit', () => {
    const rows = Array.from({ length: 3 }, (_, i) => `en,word${i},word,,,x,,`).join('\n');
    const r = parseImportCsv(`${HEADER}\n${rows}`, { ...opts, maxRows: 2 });
    expect(r.errors[0]?.message).toBe('Too many rows: 3 (the limit is 2)');
  });

  it('rejects a translation in the row own language with a clear message', () => {
    const r = parseImportCsv(`${HEADER}\nen,Swift,word,,,מהיר,fast,,,,`, opts);
    expect(r.errors).toEqual([
      {
        row: 2,
        column: 'translation_en',
        message: `An item in "en" can't have a translation into "en"; use explanation`,
      },
    ]);
    expect(r.rows).toEqual([]);
  });

  it('reports invalid cell values with row and column', () => {
    const r = parseImportCsv(
      `${HEADER}\nen,Swift,phrase,maybe,Bad Slug,מהיר,,,,,live\nfr,x,word,,,y,,,,,\n,,word,,,y,,,,,`,
      opts,
    );
    expect(r.errors.map((e) => `${e.row}:${e.column}`)).toEqual([
      '2:multiple_meanings',
      '2:status',
      '2:categories',
      '2:type',
      '3:lang',
      '4:lang',
      '4:text',
    ]);
  });

  it('maps entry-level validation errors to their column', () => {
    const r = parseImportCsv(`${HEADER}\nen,Swift,word,,,מהיר|מהיר,,,,,`, opts);
    expect(r.errors).toEqual([
      { row: 2, column: 'translation_he', message: 'Duplicate entry "מהיר"' },
    ]);
  });

  it('accepts yes/no and 1/0 for multiple_meanings', () => {
    const r = parseImportCsv(
      'lang,text,type,multiple_meanings,explanation\nen,a,word,YES,x\nen,b,word,0,y',
      opts,
    );
    expect(r.rows.map((x) => x.content.multipleMeanings)).toEqual([true, false]);
  });
});

function existingSwift(over: Partial<ItemContent> = {}): ExistingItem {
  return {
    id: 7,
    categories: ['home'],
    content: {
      lang: 'en',
      text: 'Swift',
      type: 'word',
      multipleMeanings: false,
      translation: { he: ['מהיר'] },
      explanation: ['Moving or able to move very fast'],
      synonyms: ['fast'],
      hints: [],
      ...over,
    },
  };
}

describe('planImport', () => {
  it('creates new items, with published as the default status', () => {
    const parsed = parseImportCsv(`lang,text,type,explanation\nen,Cat,word,A small pet`, opts);
    const plan = planImport(parsed.rows, emptyCtx());
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([
      {
        content: expect.objectContaining({ text: 'Cat', explanation: ['A small pet'] }),
        categories: [],
        status: 'published',
        rows: [2],
      },
    ]);
    expect(plan.totals).toMatchObject({ newItems: 1, mergedItems: 0, newExplanationEntries: 1 });
  });

  it('appends only new entries to an existing item and never removes anything', () => {
    const parsed = parseImportCsv(`${HEADER}\n${SWIFT}`, opts);
    const existing = new Map([[itemIdentityKey('en', 'swift', 'word'), existingSwift()]]);
    const plan = planImport(parsed.rows, emptyCtx({ existing }));
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0];
    expect(update?.content.translation.he).toEqual(['מהיר', 'סנונית']);
    expect(update?.content.explanation).toEqual([
      'Moving or able to move very fast',
      'A small bird that flies very fast',
    ]);
    expect(update?.content.synonyms).toEqual(['fast', 'quick', 'rapid']);
    expect(update?.content.multipleMeanings).toBe(true);
    expect(update?.changed).toBe(true);
    expect(plan.totals).toMatchObject({
      newItems: 0,
      mergedItems: 1,
      newTranslationEntries: 1,
      newExplanationEntries: 1,
      newSynonyms: 2,
      newHints: 2,
      skippedDuplicates: 3,
    });
  });

  it('never turns multiple meanings off and never changes the status of an existing item', () => {
    const parsed = parseImportCsv(
      `lang,text,type,multiple_meanings,explanation,status\nen,Swift,word,false,Moving or able to move very fast,draft`,
      opts,
    );
    const existing = new Map([
      [itemIdentityKey('en', 'Swift', 'word'), existingSwift({ multipleMeanings: true })],
    ]);
    const plan = planImport(parsed.rows, emptyCtx({ existing }));
    expect(plan.updates[0]).toMatchObject({ changed: false, content: { multipleMeanings: true } });
  });

  it('merges rows of the same item within one file (first status wins)', () => {
    const csv = `lang,text,type,categories,translation_he,status\nen,Swift,word,home,מהיר,\nen,swift!,word,food,סנונית,draft\nen,SWIFT,word,,מהיר,published`;
    const plan = planImport(parseImportCsv(csv, opts).rows, emptyCtx());
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      content: { text: 'Swift', translation: { he: ['מהיר', 'סנונית'] } },
      categories: ['home', 'food'],
      status: 'draft',
      rows: [2, 3, 4],
    });
    expect(plan.totals).toMatchObject({
      newItems: 1,
      newTranslationEntries: 2,
      skippedDuplicates: 1,
    });
  });

  it('requires a translation or an explanation on the merged item', () => {
    const rows = parseImportCsv(`${HEADER}\nen,Swift,word,,,,,,fast,,`, opts).rows;
    expect(planImport(rows, emptyCtx()).errors).toEqual([
      { row: 2, column: 'explanation', message: 'Add at least one translation or an explanation' },
    ]);
    const merged = parseImportCsv(
      `${HEADER}\nen,Swift,word,,,,,,fast,,\nen,Swift,word,,,מהיר,,,,,`,
      opts,
    );
    expect(planImport(merged.rows, emptyCtx()).errors).toEqual([]);
    const existing = new Map([[itemIdentityKey('en', 'Swift', 'word'), existingSwift()]]);
    expect(planImport(rows, emptyCtx({ existing })).errors).toEqual([]);
  });

  it('reports unknown categories, or plans them when "create missing" is ticked', () => {
    const rows = parseImportCsv(
      'lang,text,type,categories,explanation\nen,Cat,word,pets|home,x',
      opts,
    ).rows;
    expect(planImport(rows, emptyCtx()).errors).toEqual([
      {
        row: 2,
        column: 'categories',
        message: 'Unknown category "pets" (tick "Create missing categories" to add it)',
      },
    ]);
    const plan = planImport(rows, emptyCtx({ createMissingCategories: true }));
    expect(plan.errors).toEqual([]);
    expect(plan.newCategories).toEqual(['pets']);
    expect(plan.totals.newCategories).toBe(1);
    expect(plan.creates[0]?.categories).toEqual(['pets', 'home']);
  });

  it('adds new categories to existing items', () => {
    const rows = parseImportCsv(
      'lang,text,type,categories,explanation\nen,Swift,word,food|home,x',
      opts,
    ).rows;
    const existing = new Map([[itemIdentityKey('en', 'Swift', 'word'), existingSwift()]]);
    expect(planImport(rows, emptyCtx({ existing })).updates[0]?.categoriesToAdd).toEqual(['food']);
  });

  it('reports lists that become too long after merging', () => {
    const hints = Array.from({ length: 12 }, (_, i) => `hint ${i}`).join('|');
    const more = Array.from({ length: 12 }, (_, i) => `more ${i}`).join('|');
    const rows = parseImportCsv(
      `lang,text,type,explanation,hints\nen,Cat,word,x,"${hints}"\nen,Cat,word,,"${more}"`,
      opts,
    ).rows;
    expect(planImport(rows, emptyCtx()).errors).toEqual([
      { row: 3, column: 'hints', message: 'Too many entries after merging (24; the limit is 20)' },
    ]);
  });

  it('reports translation lists that become too long after merging', () => {
    const a = Array.from({ length: 6 }, (_, i) => `א${i}`).join('|');
    const b = Array.from({ length: 6 }, (_, i) => `ב${i}`).join('|');
    const rows = parseImportCsv(
      `lang,text,type,translation_he\nen,Cat,word,${a}\nen,Cat,word,${b}`,
      opts,
    ).rows;
    expect(planImport(rows, emptyCtx()).errors[0]?.column).toBe('translation_he');
  });

  it('computes warnings on the merged result', () => {
    const csv = `lang,text,type,multiple_meanings,translation_he\nen,Date,word,true,תאריך\nen,Date,word,,תמר`;
    const plan = planImport(parseImportCsv(csv, opts).rows, emptyCtx());
    expect(plan.warnings).toEqual([]); // two translations after merging: no warning
    const single = planImport(
      parseImportCsv(
        `lang,text,type,multiple_meanings,translation_he\nen,A מeedle,expr,true,מחט`,
        opts,
      ).rows,
      emptyCtx(),
    );
    expect(single.warnings.map((w) => w.column)).toEqual(['translation_he', 'text']);
  });
});

describe('serializeItemsCsv (round trip)', () => {
  const items: ExportItem[] = [
    {
      content: {
        lang: 'en',
        text: 'Swift',
        type: 'word',
        multipleMeanings: true,
        translation: { he: ['מהיר', 'סנונית'] },
        explanation: ['Moving or able to move very fast', 'A small bird, "swift" in flight'],
        synonyms: ['fast', 'quick'],
        hints: ['He gave a swift reply.'],
      },
      categories: ['nature', 'home'],
      status: 'published',
    },
    {
      content: {
        lang: 'he',
        text: 'מהיר',
        type: 'word',
        multipleMeanings: false,
        translation: { en: ['fast'] },
        explanation: [],
        synonyms: [],
        hints: [],
      },
      categories: [],
      status: 'draft',
    },
  ];

  it('writes a header with a translation column per language', () => {
    expect(csvHeader(['en', 'he'])).toEqual([
      'lang',
      'text',
      'type',
      'multiple_meanings',
      'categories',
      'translation_en',
      'translation_he',
      'explanation',
      'synonyms',
      'hints',
      'status',
    ]);
  });

  it('adds languages that are present but not in the given order', () => {
    const out = serializeItemsCsv(items, ['en']);
    expect(parseCsv(out)[0]).toContain('translation_he');
  });

  it('re-imports into an empty database with identical content', () => {
    const csv = serializeItemsCsv(items, ['en', 'he']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const parsed = parseImportCsv(csv, opts);
    expect(parsed.errors).toEqual([]);
    const plan = planImport(
      parsed.rows,
      emptyCtx({ knownCategories: new Set(), createMissingCategories: true }),
    );
    expect(plan.errors).toEqual([]);
    expect(
      plan.creates.map((c) => ({ content: c.content, categories: c.categories, status: c.status })),
    ).toEqual(items.map((i) => ({ ...i, categories: [...i.categories] })));
  });
});
