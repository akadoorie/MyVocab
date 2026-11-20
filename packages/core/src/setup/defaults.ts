import type { LangCode } from '../lang/languages';
import type { ItemType } from '../item/types';

/**
 * Start-card defaults (PRD FR-L2–FR-L4, §7.7): admin settings → the values a fresh visit starts
 * with. Guests always get the fixed guest amount.
 */

export type StartChoices = {
  sourceLang: LangCode;
  targetLang: LangCode;
  /** null = General (all items). */
  topicId: number | null;
  type: ItemType;
  size: number;
  /** Admins only: play the sample set guests get (D-038). Guests always get it. */
  sample?: boolean;
};

export type StartSettings = {
  defaults: {
    sourceLang: LangCode;
    targetLang: LangCode;
    topicId: number | null;
    type: ItemType;
  };
  sizeOptions: readonly number[];
  defaultSize: number;
  guestLoopSize: number;
};

export type StartContext = {
  settings: StartSettings;
  /** Active language codes, in display order. */
  activeLanguages: readonly LangCode[];
  activeTopicIds: readonly number[];
  isGuest: boolean;
};

export function resolveStartDefaults(ctx: StartContext): StartChoices {
  const { settings, activeLanguages, activeTopicIds, isGuest } = ctx;
  const first = activeLanguages[0];
  if (first === undefined) throw new Error('No active languages');
  const pick = (code: LangCode) => (activeLanguages.includes(code) ? code : first);
  const { topicId } = settings.defaults;
  return {
    sourceLang: pick(settings.defaults.sourceLang),
    targetLang: pick(settings.defaults.targetLang),
    topicId: topicId !== null && activeTopicIds.includes(topicId) ? topicId : null,
    type: settings.defaults.type,
    size: isGuest ? settings.guestLoopSize : resolveSize(settings),
  };
}

function resolveSize(settings: StartSettings): number {
  if (settings.sizeOptions.includes(settings.defaultSize)) return settings.defaultSize;
  const first = settings.sizeOptions[0];
  if (first === undefined) throw new Error('No loop size options');
  return first;
}

export type StartField = keyof StartChoices;

/** Fields still holding their default value (shown in the muted "default" style, FR-L3). */
export function defaultFields(choices: StartChoices, defaults: StartChoices): Set<StartField> {
  const fields = Object.keys(choices) as StartField[];
  return new Set(fields.filter((f) => choices[f] === defaults[f]));
}

/** Whether "Reset to defaults" should appear. */
export function differsFromDefaults(choices: StartChoices, defaults: StartChoices): boolean {
  return defaultFields(choices, defaults).size < Object.keys(choices).length;
}

/** Same language → the back shows the explanation (FR-L5). */
export function isSameLanguage(choices: Pick<StartChoices, 'sourceLang' | 'targetLang'>): boolean {
  return choices.sourceLang === choices.targetLang;
}
