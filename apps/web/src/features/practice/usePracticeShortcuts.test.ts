import { describe, expect, it } from 'vitest';
import { actionForKey } from './usePracticeShortcuts';

describe('actionForKey (PRD FR-L34)', () => {
  it('maps letters, arrows, Enter and Escape', () => {
    expect(actionForKey('k')).toBe('KNOW');
    expect(actionForKey('A')).toBe('KNOW_AGAIN');
    expect(actionForKey(' ')).toBe('FLIP');
    expect(actionForKey('ArrowLeft')).toBe('BACK');
    expect(actionForKey('ArrowRight')).toBe('NEXT');
    expect(actionForKey('Enter')).toBe('ENTER');
    expect(actionForKey('Escape')).toBe('STOP');
    expect(actionForKey('x')).toBeNull();
  });

  it('keeps ← for Back and → for Next in every language, like the buttons (D-096)', () => {
    // The Hebrew UI has the same button order as the English one.
    expect(actionForKey('ArrowLeft', { code: 'ArrowLeft' })).toBe('BACK');
    expect(actionForKey('ArrowRight', { code: 'ArrowRight' })).toBe('NEXT');
  });

  it('reads the physical key when a Hebrew layout types a Hebrew letter', () => {
    // On a Hebrew keyboard, K types "ל", D types "ג", F types "כ".
    expect(actionForKey('ל', { code: 'KeyK' })).toBe('KNOW');
    expect(actionForKey('ג', { code: 'KeyD' })).toBe('DONT_KNOW');
    expect(actionForKey('כ', { code: 'KeyF' })).toBe('FLIP');
    // A Latin key keeps its own meaning whatever the code says.
    expect(actionForKey('k', { code: 'KeyD' })).toBe('KNOW');
  });
});
