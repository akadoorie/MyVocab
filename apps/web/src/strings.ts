/**
 * Every UI string lives here (PRD §9.8), so a future i18n library can replace this module
 * without touching components.
 */
export const strings = {
  app: {
    name: 'MyVocab',
    tagline: 'Learn words that stick: one loop at a time',
  },
  nav: {
    home: 'Home',
    signIn: 'Sign in with Google',
    privacy: 'Privacy',
    github: 'GitHub',
    skipToContent: 'Skip to content',
  },
  landing: {
    heroTitle: 'Learn words that stick: one loop at a time',
    heroBody:
      'Pick a set of words or expressions. Each round shows only the ones you still don’t know, until nothing is left.',
    howItWorks: 'How it works',
    steps: [
      'Pick languages and a topic, or just press Start',
      'Use Hints or Flip, then mark what you know',
      'Repeat until nothing is left',
    ],
    guestBanner: 'Sign in with Google to remember the words you know and choose bigger loops.',
  },
  setup: {
    title: 'Start a loop',
    source: 'From',
    target: 'To',
    category: 'Topic',
    general: 'General',
    type: 'Type',
    amount: 'Amount',
    defaultTag: 'Default',
    reset: 'Reset to defaults',
    start: 'Start',
    starting: 'Starting…',
    sameLanguageNote: 'Same language: the back shows an explanation',
    available: (n: number) => `${n} new ${n === 1 ? 'card' : 'cards'} available`,
    checking: 'Checking…',
    guestAmountLocked: 'Guests always get 5 cards',
    guestAmountToast: 'Please register in order to choose a larger amount of cards.',
    signInToStart: 'Sign in to start',
    emptyTitle: 'You know every card in this selection 🎉',
    emptyBody: 'Change the selection, or open My known words to bring some back.',
    emptyKnownLink: 'My known words',
    botCheck: 'Checking that you’re human…',
    botCheckFailed: 'The security check didn’t pass. Please try again.',
    genericError: 'Something went wrong. Please try again.',
  },
  types: { word: 'Words', expr: 'Expressions' } as Record<'word' | 'expr', string>,
  loop: {
    know: 'Know',
    dontKnow: 'Don’t know',
    hints: 'Hints',
    flip: 'Flip',
    next: 'Next',
    stop: 'Stop',
    continue: 'Continue',
    undo: 'Undo',
    progress: (cycle: number, card: number, size: number, known: number) =>
      `Cycle ${cycle} · Card ${card}/${size} · ${known} known`,
    cycleBreak: (cycle: number, left: number) =>
      `Cycle ${cycle} · ${left} ${left === 1 ? 'card' : 'cards'} left`,
    insufficient: (n: number, topic: string) =>
      `Only ${n} new ${n === 1 ? 'card' : 'cards'} in ${topic}, starting with ${n}`,
    shortcutsTitle: 'Keyboard shortcuts',
    shortcuts: 'K Know · D Don’t know · H Hints · Space/F Flip · Enter Next · Esc Stop',
  },
  card: {
    translation: 'Translation',
    explanation: 'Explanation',
    hints: 'Hints',
    synonyms: 'Synonyms:',
    noHints: 'Hint is not available',
    multipleMeanings: 'Multiple meanings',
    flipLabel: (text: string, side: 'front' | 'back') =>
      `Card: ${text}. Showing ${side === 'front' ? 'front' : 'answer'}. Press to flip.`,
    showingFront: 'Showing front',
    showingAnswer: 'Showing answer',
    hintsShown: 'Hints shown',
  },
  summary: {
    title: 'Loop complete',
    cards: 'Cards',
    cycles: 'Cycles',
    alreadyKnew: 'Already knew',
    learnedHere: 'Learned here',
    newLoop: 'New loop',
    home: 'Home',
    guestNote: 'Sign in to remember these words',
  },
  notFound: { title: 'Page not found', back: 'Back to the start' },
} as const;
