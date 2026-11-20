/**
 * Mixed-script detection (PRD FR-A11): finds letters that don't belong to a language's script,
 * e.g. a Hebrew "מ" typed inside an English item ("A מeedle in a haystack").
 */

const SCRIPT_CODE = /^[A-Z][a-z]{3}$/;
const LETTER = /\p{L}/u;
const cache = new Map<string, RegExp>();

function scriptRegex(script: string): RegExp {
  let re = cache.get(script);
  if (!re) {
    if (!SCRIPT_CODE.test(script)) throw new Error(`Invalid ISO 15924 script code: ${script}`);
    re = new RegExp(`[\\p{Script=${script}}\\p{Script=Common}\\p{Script=Inherited}]`, 'u');
    cache.set(script, re);
  }
  return re;
}

/**
 * True when `script` is a 4-letter ISO 15924 code that Unicode regular expressions know (e.g.
 * 'Latn', 'Hebr', 'Arab', 'Cyrl'), so the mixed-script check can use it. Codes for mixtures such as
 * 'Jpan' or 'Kore' are not Unicode script properties and are refused (D-027).
 */
export function isSupportedScript(script: string): boolean {
  if (!SCRIPT_CODE.test(script)) return false;
  try {
    scriptRegex(script);
    return true;
  } catch {
    return false;
  }
}

/** Returns the distinct letters in `text` that are not in `script` (empty if none). */
export function foreignLetters(text: string, script: string): string[] {
  const allowed = scriptRegex(script);
  const found = new Set<string>();
  for (const ch of text) {
    if (LETTER.test(ch) && !allowed.test(ch)) found.add(ch);
  }
  return [...found];
}

export function hasForeignLetters(text: string, script: string): boolean {
  return foreignLetters(text, script).length > 0;
}
