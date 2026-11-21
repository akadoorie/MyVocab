import { describe, expect, it } from 'vitest';
import { itemIdentityKey } from '../item/identity';
import type { ItemContent } from '../item/types';
import { LANGS } from '../test-fixtures';
import { joinList, splitList, translationColumn, translationColumnOf } from './columns';
import { planImport, type ExistingItem, type PlanContext } from './merge-planner';
import { parseImportCsv } from './parse-rows';
import { CsvSyntaxError, parseCsv, serializeCsv } from './rfc4180';
import { csvHeader, serializeItemsCsv, type ExportItem } from './serialize-items';

const HEADER =
  'lang,text,type,multiple_meanings,topics,translation_he,translation_en,explanation,synonyms,hints,status';
const SWIFT =
  'en,Swift,word,true,,מהיר|סנונית,,"Moving or able to move very fast|A small bird that flies very fast",fast|quick|rapid,"He gave a swift reply.|A swift nested under the roof.",published';
const MAHIR =
  'he,מהיר,word,false,,,fast|quick,"שנע או פועל במהירות רבה",זריז,"הרכבת המהירה הגיעה בזמן.",published';
const opts = { languages: LANGS };

const emptyCtx = (over: Partial<PlanContext> = {}): PlanContext => ({
  languages: LANGS,
  existing: new Map(),
  knownTopics: new Set(['home', 'food']),
  createMissingTopics: false,
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
    expect(translationColumn('parallel', 'he')).toBe('translation_parallel_he');
    expect(translationColumnOf('translation_meaning_he')).toEqual({ kind: 'meaning', lang: 'he' });
    expect(translationColumnOf('translation_he')).toEqual({ kind: 'meaning', lang: 'he' }); // old name
    expect(translationColumnOf('literal_he')).toEqual({ kind: 'literal', lang: 'he' }); // old name
    expect(translationColumnOf('explanation')).toBeUndefined();
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
      topics: [],
      content: {
        lang: 'en',
        text: 'Swift',
        multipleMeanings: true,
        meaning: { he: ['מהיר', 'סנונית'] },
        synonyms: ['fast', 'quick', 'rapid'],
      },
    });
    expect(r.rows[1]?.content.meaning).toEqual({ en: ['fast', 'quick'] });
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
        message: `An item in "en" can't have a meaning in "en"; use explanation`,
      },
    ]);
    expect(r.rows).toEqual([]);
  });

  it('reads literal_<code> columns and rejects one in the row own language', () => {
    const header = 'lang,text,type,translation_he,literal_he,literal_en';
    const ok = parseImportCsv(
      `${header}
en,sample expression,expr,משמעות-1,מילולי-1,`,
      opts,
    );
    expect(ok.errors).toEqual([]);
    expect(ok.rows[0]?.content.literal).toEqual({ he: ['מילולי-1'] });
    const bad = parseImportCsv(
      `${header}
en,sample expression,expr,משמעות-1,,literal-1`,
      opts,
    );
    expect(bad.errors).toEqual([
      {
        row: 2,
        column: 'literal_en',
        message: `An item in "en" can't have a literal translation in "en"`,
      },
    ]);
  });

  it('reads the three translation columns by kind (D-024)', () => {
    const r = parseImportCsv(
      `lang,text,type,translation_parallel_he,translation_meaning_he,translation_literal_he
en,sample expression,expr,מקבילה-1,משמעות-1|משמעות-2,מילולי-1`,
      opts,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.content).toMatchObject({
      parallel: { he: ['מקבילה-1'] },
      meaning: { he: ['משמעות-1', 'משמעות-2'] },
      literal: { he: ['מילולי-1'] },
    });
  });

  it('treats an old and a new name for the same list as a duplicate column', () => {
    const r = parseImportCsv(
      'lang,text,type,translation_he,translation_meaning_he\nen,a,word,x,y',
      opts,
    );
    expect(r.errors).toEqual([
      {
        row: 1,
        column: 'translation_meaning_he',
        message: 'Duplicate column "translation_meaning_he"',
      },
    ]);
  });

  it('rejects a meaning in the row own language', () => {
    const r = parseImportCsv('lang,text,type,translation_meaning_en\nen,a,expr,x', opts);
    expect(r.errors).toEqual([
      {
        row: 2,
        column: 'translation_meaning_en',
        message: `An item in "en" can't have a meaning in "en"; use explanation`,
      },
    ]);
  });

  it('reports invalid cell values with row and column', () => {
    const r = parseImportCsv(
      `${HEADER}\nen,Swift,phrase,maybe,Bad Slug,מהיר,,,,,live\nfr,x,word,,,y,,,,,\n,,word,,,y,,,,,`,
      opts,
    );
    expect(r.errors.map((e) => `${e.row}:${e.column}`)).toEqual([
      '2:multiple_meanings',
      '2:status',
      '2:type',
      '2:topics',
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

  it('reads the old column name "categories" as "topics" (D-039)', () => {
    const r = parseImportCsv(
      'lang,text,type,categories,explanation\nen,a,word,home|nature,x',
      opts,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.topics).toEqual(['home', 'nature']);
    const both = parseImportCsv(
      'lang,text,type,categories,topics,explanation\nen,a,word,,,x',
      opts,
    );
    expect(both.errors).toEqual([
      { row: 1, column: 'topics', message: 'Duplicate column "topics"' },
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

function existingSwift(over: Partial<ItemContent> = {}, inSampleSet = false): ExistingItem {
  return {
    id: 7,
    topics: ['home'],
    inSampleSet,
    content: {
      lang: 'en',
      text: 'Swift',
      multipleMeanings: false,
      meaning: { he: ['מהיר'] },
      parallel: {},
      literal: {},
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
        topics: [],
        status: 'published',
        inSampleSet: false,
        rows: [2],
      },
    ]);
    expect(plan.totals).toMatchObject({ newItems: 1, mergedItems: 0, newExplanationEntries: 1 });
  });

  describe('no item type; topics that exclude each other (D-046)', () => {
    const ctx = (extra: Partial<PlanContext> = {}) =>
      emptyCtx({
        knownTopics: new Set(['home', 'idioms', 'expressions']),
        exclusions: new Map([
          ['idioms', 'expressions'],
          ['expressions', 'idioms'],
        ]),
        ...extra,
      });
    const plan = (csv: string) => planImport(parseImportCsv(csv, opts).rows, ctx());

    it('needs no type column; the same text is one item whatever an old file said', () => {
      const p = plan('lang,text,type,explanation\nen,Cat,word,A pet\nen,cat,expr,A small animal');
      expect(p.errors).toEqual([]);
      expect(p.creates).toHaveLength(1);
      expect(
        planImport(parseImportCsv('lang,text,explanation\nen,Cat,A pet', opts).rows, ctx()).creates,
      ).toHaveLength(1);
    });

    it('puts an old "expr" row in Expressions (except Idioms), unless it is an idiom', () => {
      expect(
        plan('lang,text,type,explanation\nen,Sample saying,expr,x').creates[0]?.topics,
      ).toEqual(['expressions']);
      expect(
        plan('lang,text,type,topics,explanation\nen,Sample idiom,expr,idioms,x').creates[0]?.topics,
      ).toEqual(['idioms']);
      expect(plan('lang,text,type,explanation\nen,Cat,word,x').creates[0]?.topics).toEqual([]);
    });

    it('refuses an item that would be in two topics that exclude each other', () => {
      const p = plan('lang,text,topics,explanation\nen,Sample saying,idioms|expressions,x');
      expect(p.errors).toEqual([
        {
          row: 2,
          column: 'topics',
          message: `An item can't be in both "expressions" and "idioms"`,
        },
      ]);
    });

    it('rejects a type cell other than word or expr', () => {
      expect(parseImportCsv('lang,text,type,explanation\nen,Cat,phrase,x', opts).errors).toEqual([
        {
          row: 2,
          column: 'type',
          message: 'Use word or expr, or leave the column out (items have no type any more)',
        },
      ]);
    });
  });

  describe('the sample column (D-038)', () => {
    const SAMPLE_HEADER = 'lang,text,type,explanation,sample';
    const plan = (rows: string, existing?: ExistingItem) =>
      planImport(
        parseImportCsv(`${SAMPLE_HEADER}\n${rows}`, opts).rows,
        emptyCtx(
          existing ? { existing: new Map([[itemIdentityKey('en', 'Swift'), existing]]) } : {},
        ),
      );
    const SAME = 'en,Swift,word,Moving or able to move very fast';

    it('puts a new item in the sample set only when the column says so', () => {
      expect(plan(`en,Cat,word,A small pet,true`).creates[0]?.inSampleSet).toBe(true);
      expect(plan(`en,Cat,word,A small pet,false`).creates[0]?.inSampleSet).toBe(false);
      expect(plan(`en,Cat,word,A small pet,`).creates[0]?.inSampleSet).toBe(false);
    });

    it('turns an existing item on or off, and counts the change', () => {
      const off = plan(`${SAME},false`, existingSwift({}, true));
      expect(off.updates[0]).toMatchObject({ changed: true, inSampleSet: false });
      expect(off.totals.sampleSetChanges).toBe(1);
      const on = plan(`${SAME},yes`, existingSwift({}, false));
      expect(on.updates[0]).toMatchObject({ changed: true, inSampleSet: true });
    });

    it('leaves an existing item alone when the cell is empty or already matches', () => {
      for (const p of [
        plan(`${SAME},`, existingSwift({}, true)),
        plan(`${SAME},true`, existingSwift({}, true)),
      ]) {
        expect(p.updates[0]?.changed).toBe(false);
        expect(p.updates[0]).not.toHaveProperty('inSampleSet');
        expect(p.totals.sampleSetChanges).toBe(0);
      }
    });

    it('rejects anything but true or false', () => {
      const r = parseImportCsv(`${SAMPLE_HEADER}\nen,Cat,word,A small pet,maybe`, opts);
      expect(r.errors).toEqual([{ row: 2, column: 'sample', message: 'Use true or false' }]);
    });
  });

  it('appends only new entries to an existing item and never removes anything', () => {
    const parsed = parseImportCsv(`${HEADER}\n${SWIFT}`, opts);
    const existing = new Map([[itemIdentityKey('en', 'swift'), existingSwift()]]);
    const plan = planImport(parsed.rows, emptyCtx({ existing }));
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0];
    expect(update?.content.meaning.he).toEqual(['מהיר', 'סנונית']);
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
      newMeaningEntries: 1,
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
      [itemIdentityKey('en', 'Swift'), existingSwift({ multipleMeanings: true })],
    ]);
    const plan = planImport(parsed.rows, emptyCtx({ existing }));
    expect(plan.updates[0]).toMatchObject({ changed: false, content: { multipleMeanings: true } });
  });

  it('appends literal meanings to an existing item and counts them', () => {
    const csv = `lang,text,type,translation_he,literal_he
en,Swift,word,,זריז`;
    const existing = new Map([[itemIdentityKey('en', 'swift'), existingSwift()]]);
    const rows = parseImportCsv(csv, opts).rows;
    const plan = planImport(rows, emptyCtx({ existing }));
    expect(plan.updates[0]?.content.literal).toEqual({ he: ['זריז'] });
    expect(plan.updates[0]?.changed).toBe(true);
    expect(plan.totals).toMatchObject({ newLiteralEntries: 1 });
  });

  it('merges rows of the same item within one file (first status wins)', () => {
    const csv = `lang,text,type,topics,translation_he,status\nen,Swift,word,home,מהיר,\nen,swift!,word,food,סנונית,draft\nen,SWIFT,word,,מהיר,published`;
    const plan = planImport(parseImportCsv(csv, opts).rows, emptyCtx());
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      content: { text: 'Swift', meaning: { he: ['מהיר', 'סנונית'] } },
      topics: ['home', 'food'],
      status: 'draft',
      rows: [2, 3, 4],
    });
    expect(plan.totals).toMatchObject({
      newItems: 1,
      newMeaningEntries: 2,
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
    const existing = new Map([[itemIdentityKey('en', 'Swift'), existingSwift()]]);
    expect(planImport(rows, emptyCtx({ existing })).errors).toEqual([]);
  });

  it('reports unknown topics, or plans them when "create missing" is ticked', () => {
    const rows = parseImportCsv(
      'lang,text,type,topics,explanation\nen,Cat,word,pets|home,x',
      opts,
    ).rows;
    expect(planImport(rows, emptyCtx()).errors).toEqual([
      {
        row: 2,
        column: 'topics',
        message: 'Unknown topic "pets" (tick "Create missing topics" to add it)',
      },
    ]);
    const plan = planImport(rows, emptyCtx({ createMissingTopics: true }));
    expect(plan.errors).toEqual([]);
    expect(plan.newTopics).toEqual(['pets']);
    expect(plan.totals.newTopics).toBe(1);
    expect(plan.creates[0]?.topics).toEqual(['pets', 'home']);
  });

  it('adds new topics to existing items', () => {
    const rows = parseImportCsv(
      'lang,text,type,topics,explanation\nen,Swift,word,food|home,x',
      opts,
    ).rows;
    const existing = new Map([[itemIdentityKey('en', 'Swift'), existingSwift()]]);
    expect(planImport(rows, emptyCtx({ existing })).updates[0]?.topicsToAdd).toEqual(['food']);
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
    expect(planImport(rows, emptyCtx()).errors[0]?.column).toBe('translation_meaning_he');
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
    expect(single.warnings.map((w) => w.column)).toEqual(['translation_meaning_he', 'text']);
  });
});

describe('serializeItemsCsv (round trip)', () => {
  const items: ExportItem[] = [
    {
      content: {
        lang: 'en',
        text: 'Swift',
        multipleMeanings: true,
        meaning: { he: ['מהיר', 'סנונית'] },
        parallel: {},
        literal: {},
        explanation: ['Moving or able to move very fast', 'A small bird, "swift" in flight'],
        synonyms: ['fast', 'quick'],
        hints: ['He gave a swift reply.'],
      },
      topics: ['nature', 'home'],
      status: 'published',
      inSampleSet: true,
    },
    {
      content: {
        lang: 'he',
        text: 'מהיר',
        multipleMeanings: false,
        parallel: { en: ['fast'] },
        meaning: { en: ['speedy'] },
        literal: { en: ['quick one'] },
        explanation: [],
        synonyms: [],
        hints: [],
      },
      topics: [],
      status: 'draft',
      inSampleSet: false,
    },
  ];

  it('writes a header with parallel, meaning and literal columns per language', () => {
    expect(csvHeader(['en', 'he'])).toEqual([
      'lang',
      'text',
      'multiple_meanings',
      'topics',
      'translation_meaning_en',
      'translation_meaning_he',
      'translation_parallel_en',
      'translation_parallel_he',
      'translation_literal_en',
      'translation_literal_he',
      'explanation',
      'synonyms',
      'hints',
      'status',
      'sample',
    ]);
  });

  it('adds languages that are present but not in the given order', () => {
    const out = serializeItemsCsv(items, ['en']);
    expect(parseCsv(out)[0]).toContain('translation_parallel_he');
  });

  it('re-imports into an empty database with identical content', () => {
    const csv = serializeItemsCsv(items, ['en', 'he']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const parsed = parseImportCsv(csv, opts);
    expect(parsed.errors).toEqual([]);
    const plan = planImport(
      parsed.rows,
      emptyCtx({ knownTopics: new Set(), createMissingTopics: true }),
    );
    expect(plan.errors).toEqual([]);
    expect(
      plan.creates.map((c) => ({
        content: c.content,
        topics: c.topics,
        status: c.status,
        inSampleSet: c.inSampleSet,
      })),
    ).toEqual(items.map((i) => ({ ...i, topics: [...i.topics] })));
  });
});
