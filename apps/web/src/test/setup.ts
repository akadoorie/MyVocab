import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { activateLocale } from '../strings';

afterEach(() => {
  cleanup();
  // Tests run in English unless they pick Hebrew (D-080); undo any switch for the next test.
  activateLocale('en');
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  try {
    window.localStorage.removeItem('myvocab.locale');
  } catch {
    // no storage
  }
});
