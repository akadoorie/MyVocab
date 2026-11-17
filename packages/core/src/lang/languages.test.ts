import { describe, expect, it } from 'vitest';
import { isValidLangCode } from './languages';

describe('isValidLangCode', () => {
  it.each(['en', 'he', 'pt-br', 'zh-hant'])('accepts %s', (code) => {
    expect(isValidLangCode(code)).toBe(true);
  });

  it.each(['', 'EN', 'e', 'english', 'en_US', 'en-', '$.he', 'he"'])('rejects %j', (code) => {
    expect(isValidLangCode(code)).toBe(false);
  });
});
