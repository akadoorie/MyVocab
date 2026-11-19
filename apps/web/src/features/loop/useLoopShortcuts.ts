import type { LoopActionType } from '@myvocab/core';
import { useEffect } from 'react';

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Maps a key to a loop action (PRD FR-L34). Enter means Next or Continue. */
export function actionForKey(key: string): LoopActionType | 'ENTER' | null {
  switch (key.toLowerCase()) {
    case 'k':
      return 'KNOW';
    case 'd':
      return 'DONT_KNOW';
    case 'h':
      return 'TOGGLE_HINTS';
    case 'f':
    case ' ':
      return 'FLIP';
    case 'arrowleft':
      return 'BACK';
    case 'arrowright':
      return 'NEXT';
    case 'enter':
      return 'ENTER';
    case 'escape':
      return 'STOP';
    default:
      return null;
  }
}

/**
 * Desktop keyboard shortcuts. Letter keys are ignored in form fields; Space and Enter are left to
 * a focused button or link so they keep their native meaning there.
 */
export function useLoopShortcuts(handle: (action: LoopActionType | 'ENTER') => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (FORM_TAGS.has(target.tagName) || target.isContentEditable)) return;
      const action = actionForKey(e.key);
      if (!action) return;
      const onControl = target?.tagName === 'BUTTON' || target?.tagName === 'A';
      if ((e.key === ' ' || e.key === 'Enter') && onControl) return;
      e.preventDefault();
      handle(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handle]);
}
