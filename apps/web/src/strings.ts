/**
 * Every UI string lives here (PRD §9.8), so a future i18n library can replace this module
 * without touching components.
 */
export const strings = {
  app: {
    name: 'MyVocab',
    tagline: 'Learn words until they stick',
  },
  nav: {
    version: 'Version',
    home: 'Home',
    signIn: 'Sign-in with Google',
    /** The link that starts a sentence in a toast (D-043). */
    signInLink: 'Sign-in',
    signOut: 'Sign out',
    accountMenu: 'Account menu',
    knownWords: 'My known words',
    account: 'Account',
    admin: 'Admin',
    privacy: 'Privacy',
    github: 'GitHub',
    skipToContent: 'Skip to content',
  },
  landing: {
    heroTitle: 'Learn words until they stick',
    heroBody:
      'Pick a set of words or expressions. Each round shows only the ones you still don’t know, until nothing is left.',
    howItWorks: 'How it works',
    steps: [
      'Pick languages and a topic, or just press Start',
      'Use Hints or Flip, then mark what you know',
      'Repeat until nothing is left',
    ],
    /** Under the slogan, for everyone (D-036). */
    registeredUsersLabel: 'Registered users:',
    /** The guest banner: the first words start sign-in (D-033). */
    guestBannerLink: 'Sign-in with Google',
    guestBannerRest:
      ' to remember the words you already know, choose different topics and bigger sessions.',
    /** The answer buttons, explained under "How it works" (D-030). */
    buttonsTitle: 'Buttons',
    buttonGuide: {
      know: "Don’t show it again. You can bring it back from 'My known words'.",
      /** For guests the green button is locked (D-042): the text, then "(Sign-in to enable)" with a
          "Sign-in" link (D-043). */
      knowGuest: "Don’t show it again. You can bring it back from 'My known words'.",
      toEnable: 'to enable',
      again: 'Don’t show again in this session; it shows up again in future sessions.',
      dontKnow: 'Repeat it later in this session, until you know it.',
    },
  },
  setup: {
    title: 'Configure your session',
    source: 'From',
    target: 'To',
    topic: 'Topic',
    /** No topic filter: every item (D-039; was "General"). */
    general: 'All topics',
    /** The items guests play (D-038); admins can pick it too, to check it. */
    sampleSet: 'Sample set',
    amount: 'Cards per session',
    swapLanguages: 'Switch From and To',
    defaultTag: 'Default',
    reset: 'Reset to defaults',
    start: 'Start',
    starting: 'Starting…',
    sameLanguageNote: 'Same language: the back shows an explanation',
    /** After the count, which is shown in yellow: "8 cards available". */
    availableSuffix: (n: number) => `${n === 1 ? 'card' : 'cards'} available`,
    checking: 'Checking…',
    guestAmountLocked: 'Guests always get 5 cards',
    /** After the "Sign-in" link (D-043): "Sign-in to choose more cards per session." */
    guestAmountToast: 'to choose more cards per session.',
    signInToStart: 'Sign-in to start',
    emptyTitle: 'You know every card in this selection 🎉',
    emptyBody: 'Change the selection, or open My known words to bring some back.',
    emptyKnownLink: 'My known words',
    emptyGuestTitle: 'No cards for this selection yet',
    emptyGuestBody: 'Try a different language or type.',
    botCheck: 'Checking that you’re human…',
    botCheckFailed: 'The security check didn’t pass. Please try again.',
    genericError: 'Something went wrong. Please refresh the page.',
    dailyCap: (remaining: number) =>
      remaining > 0
        ? `You’ve reached today’s card limit. You can still get ${remaining} ${remaining === 1 ? 'card' : 'cards'} today: choose a smaller amount.`
        : 'You’ve reached today’s card limit. Come back tomorrow!',
    sessionExpired: 'Your session has ended. Please sign-in again.',
  },
  auth: {
    signInFailed: 'Sign-in didn’t complete. Please try again.',
    signInRefused:
      'We couldn’t sign you in with this Google account. You can keep learning as a guest.',
    dismiss: 'Dismiss',
    signInRequiredTitle: 'Sign-in to continue',
    signInRequiredBody: 'Sign-in with Google to see the words you know and manage your account.',
  },
  known: {
    title: 'My known words',
    count: (n: number) => `${n} known ${n === 1 ? 'word' : 'words'}`,
    search: 'Search',
    searchPlaceholder: 'Word or translation',
    direction: 'Direction',
    directionOption: (from: string, to: string) => `${from} → ${to}`,
    directionExplanation: (name: string) => `${name} → ${name} (explanation)`,
    topic: 'Topic',
    sort: 'Sort',
    all: 'All',
    sortNewest: 'Newest first',
    sortOldest: 'Oldest first',
    sortAz: 'A → Z',
    alreadyKnew: 'Already knew',
    learnedHere: 'Learned here',
    multipleMeanings: 'Multiple meanings',
    knownOn: (date: string) => `Known ${date}`,
    noAnswer: '—',
    returnOne: 'Return to practice',
    returnSelected: (n: number) => `Return ${n} selected`,
    returnAllFiltered: (n: number) => `Return all ${n}`,
    selectRow: (text: string, direction: string) => `Select ${text} (${direction})`,
    clearSelection: 'Clear selection',
    confirmTitle: (n: number) => `Return ${n} ${n === 1 ? 'word' : 'words'} to practice?`,
    confirmBody: 'They will show up again in your future sessions, in the directions shown.',
    confirm: 'Return them',
    cancel: 'Cancel',
    returned: (n: number) => `${n} ${n === 1 ? 'word is' : 'words are'} back in practice`,
    returnFailed: 'Couldn’t return the words. Please try again.',
    loadMore: 'Load more',
    loading: 'Loading…',
    loadFailed: 'Couldn’t load your known words.',
    retry: 'Try again',
    emptyTitle: 'No known words yet',
    emptyBody:
      'When you press the green Know on a card, the word lands here and stops appearing in sessions in that direction (for example English → Hebrew). You can bring it back at any time.',
    noMatches: 'Nothing matches these filters.',
  },
  account: {
    title: 'Account',
    admin: 'Admin',
    owner: 'Owner',
    signOutTitle: 'Sign out',
    signOutBody: 'Your known words stay saved in your account.',
    deleteTitle: 'Delete my account',
    deleteBody:
      'This permanently deletes your account, your known words and your usage counters. It can’t be undone.',
    deleteConfirmLabel: 'Type DELETE to confirm',
    deleteButton: 'Delete my account',
    deleting: 'Deleting…',
    deleted: 'Your account was deleted.',
    deleteFailed: 'Couldn’t delete your account. Please try again.',
  },
  privacy: {
    title: 'Privacy',
    intro: 'MyVocab stores as little as it can. There are no ads and no tracking cookies.',
    storedTitle: 'What we store',
    stored: [
      'Your Google account id, email address, name and profile picture link, when you sign-in with Google.',
      'The words you marked as known (item, the direction you were learning, the round and the date).',
      'A daily counter of the cards you were served, to keep the service fair for everyone.',
      'For guests: an hourly counter of sessions per network address. The address itself is never stored, only a one-way keyed hash of it.',
      'A sign-in session cookie (HttpOnly). It holds no personal data.',
    ],
    whyTitle: 'Why',
    why: 'To remember which words you already know, to keep you signed in, and to protect the service from bulk copying and abuse.',
    notTitle: 'What we don’t store',
    not: 'Your Google password or Google tokens, your IP address, your browser details, or anything about what you do on other sites.',
    deleteTitle: 'Delete your data',
    delete:
      'Open Account and choose “Delete my account”. Your account, sessions, known words and counters are deleted at once. Hashed guest counters expire after 48 hours.',
  },
  loop: {
    /** The three answer buttons and the captions under them (FR-L27a, D-030). */
    know: 'I know it',
    dontKnow: 'I don’t know',
    knowCaption: 'Don’t show again',
    againCaption: 'Show again in future',
    dontKnowCaption: 'Show again soon',
    /** Their accessible names: exactly the visible label + caption (axe label-content-name-mismatch). */
    knowName: 'I know it Don’t show again',
    againName: 'I know it Show again in future',
    dontKnowName: 'I don’t know Show again soon',
    /** The green button is shown to guests, but locked: only a signed-in Know is kept (D-042). */
    signInToEnable: 'Sign-in to enable',
    knowNameGuest: 'I know it Don’t show again (sign-in to enable)',
    /** After the "Sign-in" link, over the locked green button for 1.5 seconds when tapped (D-043). */
    lockedTip: 'required',
    hints: 'Hints',
    flip: 'Flip',
    flipTitle: 'Flip the card (F or Space)',
    next: 'Next',
    stop: 'Stop',
    continue: 'Continue',
    back: 'Back',
    backToCard: 'Back to the last card',
    progress: (cycle: number, card: number, size: number, known: number) =>
      `Cycle ${cycle} · Card ${card}/${size} · ${known} known`,
    cycleBreak: (cycle: number, left: number) =>
      `Cycle ${cycle} · ${left} ${left === 1 ? 'card' : 'cards'} left`,
    insufficient: (n: number, topic: string) =>
      `Only ${n} new ${n === 1 ? 'card' : 'cards'} in ${topic}, starting with ${n}`,
    homeConfirmTitle: 'Back to Home?',
    stopConfirmTitle: 'Stop the session?',
    homeConfirmBody: 'This will stop the session. Are you sure?',
    yes: 'Yes',
    no: 'No',
    shortcutsTitle: 'Keyboard shortcuts',
    shortcuts: [
      ['K', 'I know it'],
      ['A', 'I know it, show again in future'],
      ['D', 'I don’t know'],
      ['H', 'Hints'],
      ['F / Space', 'Flip'],
      ['←', 'Back'],
      ['→', 'Next'],
      ['Enter', 'Next / Continue'],
      ['Esc', 'Stop'],
    ] as const,
  },
  card: {
    translation: 'Translation',
    /** The main answer of an expression card is its parallel (PRD §9.3, D-024). */
    parallel: 'Parallel',
    /** The parallel is also the word-for-word translation (D-026). */
    parallelAlsoLiteral: 'Parallel (also literally)',
    meaning: 'Meaning',
    explanation: 'Explanation',
    literal: 'Literally',
    hints: 'Hints',
    synonyms: 'Synonyms:',
    noHints: 'Hint is not available',
    multipleMeanings: 'Multiple meanings',
    showingFront: 'Showing front',
    showingAnswer: 'Showing answer',
    hintsShown: 'Hints shown',
    hintsHidden: 'Hints hidden',
    /** The live cover over the hints on the card front (D-047). */
    hideHints: 'Hide hints',
    tapForHints: 'Tap to see hints',
    /** What was clicked, on a card reached with Back (D-049). The orange one adds its caption for
        screen readers only: the two Knows look alike without their colour. */
    answeredKnow: 'Clicked: I know it',
    answeredKnowAgain: 'Clicked: I know it (show again in future)',
    answeredDontKnow: 'Clicked: I don’t know',
    /** The orange chip's visible text; the caption stays for screen readers. */
    answeredKnowAgainShort: 'Clicked: I know it',
    answeredKnowAgainExtra: ' (show again in future)',
    /** Announced when Back lands on a card (screen readers). */
    backTo: (card: number, size: number, answer: string | null) =>
      `Card ${card} of ${size}${answer ? `. ${answer}` : ''}`,
  },
  summary: {
    title: 'Session completed',
    cards: 'Cards',
    cycles: 'Cycles',
    alreadyKnew: 'Already knew',
    learnedHere: 'Learned here',
    newLoop: 'New session',
    nothingLeft: 'No new cards left for these choices. Go Home to pick others.',
    home: 'Home',
    guestNote: 'Sign-in to remember these words',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
  },
  notFound: { title: 'Page not found', back: 'Back to the start' },
} as const;
