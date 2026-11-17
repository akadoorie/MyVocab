/**
 * Every UI string lives here (PRD §9.8), so a future i18n library can replace this module
 * without touching components.
 */
export const strings = {
  app: {
    name: 'MyVocab',
    tagline: 'Learn words that stick: one loop at a time',
  },
  shell: {
    comingSoon: 'The learning loop is on its way.',
    apiStatus: 'API',
    apiOk: 'online',
    apiDown: 'offline',
  },
} as const;
