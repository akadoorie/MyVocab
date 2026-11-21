# MyVocab — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | MyVocab: learn words and expressions in a shrinking loop |
| **Version** | 1.1 (v1 scope) |
| **Date** | 2026-11-17 |
| **Status** | Approved design. Implementation starts only after the owner says **"Go"** |
| **Implementation prompt** | `AGENT_PROMPT.md` (local only: git-ignored, never committed to the public repo) |

---

## Table of contents
1. [Overview](#1-overview)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Personas](#3-personas)
4. [Glossary](#4-glossary)
5. [Decisions summary](#5-decisions-summary)
6. [Functional requirements: Learner](#6-functional-requirements-learner)
7. [Functional requirements: Admin (Superuser)](#7-functional-requirements-admin-superuser)
8. [Content: model, CSV, private content repo, export](#8-content-model-csv-private-content-repo-export)
9. [UX and visual design](#9-ux-and-visual-design)
10. [Architecture](#10-architecture)
11. [Data model](#11-data-model)
12. [API specification](#12-api-specification)
13. [Authentication and roles](#13-authentication-and-roles)
14. [Security and vocabulary privacy](#14-security-and-vocabulary-privacy)
15. [Non-functional requirements](#15-non-functional-requirements)
16. [Hosting, deployment and operations](#16-hosting-deployment-and-operations)
17. [Testing strategy](#17-testing-strategy)
18. [Milestones](#18-milestones)
19. [Owner (human) action items](#19-owner-human-action-items)
20. [Future roadmap](#20-future-roadmap)

---

## 1. Overview
MyVocab is a modern web application for learning new words and expressions/idioms, from any language to any
language. v1 supports **English** and **Hebrew**.

**The core idea: a shrinking loop.**
The learner picks a closed group of items, which are shown one by one as **flip cards** in a loop. In each cycle the
learner marks the items they already know. When a cycle ends, a new cycle begins with **only the items they didn't
know**, in a new random order. The loop ends when a cycle has no "Don't know" items left (all were marked "Know"),
or when the learner presses **Stop**.

**Example (English → Hebrew).** The group: Calculator (מחשבון), TV (טלויזיה), Phone (טלפון), Bed (מיטה),
Cupboard (ארון).
- Cycle 1 shows all 5. The learner marks "Know" for *Calculator* and *Bed*, and "Don't know" for the other 3.
- Cycle 2 shows *TV*, *Phone*, *Cupboard* in a new random order.
- The loop continues until a cycle ends with every shown item marked "Know", or the learner presses Stop.

**Translation or explanation.** The front of the card always shows the item's text. If the learner chose two
different languages (EN → HE), the back shows the **translation**. If they chose the same language (EN → EN), the back
shows the **explanation**. A translation has up to three kinds (D-024): the **meaning** (what it means; required,
D-025), the **parallel** (an equivalent expression, optional) and the **literal translation** (word for word,
optional). The parallel, when there is one, is the main answer with the meaning and the literal translation under it;
otherwise the meaning is the main answer. Hints and synonyms can be revealed on the front and
always appear on the back.

**Known items memory.** For signed-in learners, every item they mark "Know" is remembered and not shown again in future
loops **in the direction it was marked in** (e.g. English → Hebrew; D-028). A "My known words" page lists those items
and lets the learner return any of them to future loops.

**Private vocabulary.** The vocabulary is the product's asset. It lives only in the app's private database and in a
private content repository. It never appears in the public code repo or any public/third-party service (§14.2).

---

## 2. Goals and non-goals

### 2.1 Goals (v1)
- A simple, clean, fast, dark-themed site that works well on desktop and mobile, reachable from anywhere.
- A frictionless start: every start option has a sensible default, so anyone can press **Start** immediately. Guests
  can run short (5-card) loops right from the landing page.
- Google sign-in for learners who want larger loops and their known words remembered.
- An admin panel for content (items with their translations, explanations, synonyms and hints; topics), users and
  settings, plus CSV bulk import.
- A full database export so the data can move to another database easily.
- Vocabulary privacy, with protection against bulk scraping.
- A secure-by-default design: two locks on the admin area, least privilege, auditability, recoverability.
- Runs on free tiers (Cloudflare Workers + D1 + Turnstile + Access, GitHub), with a database layout tuned to the D1
  free-tier limits (§11.2).
- A codebase that is easy to extend (SOLID, data-driven languages, a pluggable back-of-card strategy, clear seams for
  monetization and AI).

### 2.2 Non-goals (v1)
- Payments or subscriptions (seam only).
- AI-generated content (seam only).
- Languages beyond English and Hebrew (supported by the data model, but not shipped).
- A localized UI (the UI is English only; Hebrew *content* is fully supported, including RTL).
- Session history, per-word statistics, spaced repetition.
- Offline/PWA mode, native mobile apps, light theme.

---

## 3. Personas
| Persona | Description | Volume |
|---|---|---|
| **Guest** | Anonymous visitor. Can run **5-card** loops; nothing is remembered. | Many |
| **Learner (User)** | Signed in with Google. Chooses 10–50 cards; known items are remembered and excluded from future loops. | Many |
| **Admin (Superuser)** | Manages content, users and settings behind the scenes. | A few |
| **Owner** | An admin whose email is in the `ADMIN_EMAILS` secret. Can't be demoted from the UI. Runs exports. | 1–2 |

---

## 4. Glossary
| Term | Definition |
|---|---|
| **Item** | The basic content unit: one word or expression in its **language** (e.g. English "Swift"). It holds the multiple-meanings flag, topics, translations, explanation, synonyms and hints (§8.1). Its `text` is always what the front of the card shows. |
| **Type** | *Removed (D-046).* Items have no type: a word, an expression or anything else, classified by its **topics** (e.g. "Idioms", "Expressions (except Idioms)"). |
| **Translation** | For each **other** language, up to three ordered lists (D-024, D-025): the **meaning** (`translation_meaning`, required to play into that language: what it means, e.g. "The truth came out"; for a plain word, simply its translation, e.g. `he: ["מהיר", "סנונית"]`), the **parallel** (`translation_parallel`, optional: an equivalent expression, e.g. "The cat is out of the bag") and the **literal translation** (`translation_literal`, optional: word for word, e.g. "The awl came out of the sack"). A plain word keeps only the meaning. An item never has a translation of any kind into its own language. |
| **Explanation** | An ordered list of explanations **in the item's own language**, one entry per meaning. |
| **Synonym** | An alternative word or expression in the item's language. Synonyms have their own list and are shown in a "Synonyms" section next to the hints. |
| **Hint** | A usage example or sentence in the item's language. 0..N per item. |
| **Multiple meanings** | A flag (`multipleMeanings`) the admin sets when the item has two or more meanings (e.g. "Date": a day / a fruit). The learner sees a badge on the front. It can't be computed from list lengths: "Happy" → ["שמח", "מאושר"] has two translations but one meaning. |
| **Card** | What the learner sees in a loop: one item + the target language chosen on the start card. **Not stored** in the database. On screen it is a **flip card**: the item on the **front**; the translation or explanation, hints and synonyms on the **back**. |
| **Direction** | Source language → target language, e.g. EN→HE. The source is always the item's language. |
| **Hints (button)** | Reveals the hints and synonyms on the front of the card. |
| **Flip** | Turning the on-screen card over (front ↔ back). It can be done any number of times and **has no effect on grading**. |
| **Amount** | The number of cards in a loop (learners: 10/20/30/40/50; guests: always 5). |
| **Loop** | One learning session over a group of cards. **In the UI it is called a "Session"** ("Configure your session", "Session completed", "New session"); "loop" stays the technical term in this spec and in the code (D-018). |
| **Cycle** | One pass over the loop's remaining cards. |
| **Known item** | An item a signed-in learner marked "Know" in one direction (e.g. EN → HE). It is excluded from their future loops **in that direction only** until returned (D-028); the explanation direction (EN → EN) is a direction of its own. |
| **Topic** | A topic (Home, Nature, …). An item can have many, or none. **All topics** (formerly "General") is virtual: every item, including items without a topic (D-039). |
| **Content repo** | The **private** GitHub repo `MyVocab-Content` that holds vocabulary files (starter set, import batches, snapshots). |

**How the back of the card is chosen** (illustrative items):
| Start card | Front | Back (answer) | Back (below the answer) |
|---|---|---|---|
| EN → HE | Swift ◆ | מהיר / סנונית | Hints + Synonyms |
| EN → EN | Swift ◆ | 1. Moving or able to move very fast · 2. A small bird that flies very fast | Hints + Synonyms |
| EN → HE | A needle in a haystack | מחט בערימת שחת | Hints |
| EN → HE | *an idiom* | **Parallel:** *its Hebrew parallel* | **Meaning:** *what it means, in Hebrew*; **Literally:** *word for word* (muted); then Hints |
| EN → HE | *an idiom with no Hebrew parallel* | **Meaning:** *its meaning in Hebrew* | **Literally** (muted), then Hints |
| EN → EN | A needle in a haystack | Something very hard to find among many other things | Hints |

◆ = the "Multiple meanings" badge.

---

## 5. Decisions summary
| Area | Decision |
|---|---|
| Language | TypeScript end-to-end (pnpm monorepo, shared Zod contracts) |
| Frontend | React 19 + Vite + Tailwind CSS v4 + React Router (SPA mode) + TanStack Query |
| Backend | Hono on Cloudflare Workers, Drizzle ORM, Cloudflare D1 (SQLite) |
| Hosting | One Cloudflare Worker serves both the SPA assets and `/api/*` (same origin, so no CORS). Free tier; commercial use allowed |
| Code repo | **Public** GitHub repo `MyVocab` (code only, **no vocabulary**) + GitHub Actions. Deploys and migrations run only after the owner's manual **Approve** click |
| Content repo | **Private** GitHub repo `MyVocab-Content` (sibling folder): starter set, import CSVs, vocabulary snapshots |
| Data flow | Content repo file → (owner's computer) → admin CSV upload **or** `pnpm db:seed` → D1. D1 is the live copy; the content repo is the archive |
| Export | `pnpm db:export`, run locally by an owner: SQL dump + JSON per table + import-ready vocabulary CSV + schema README. `--content-only` = vocabulary CSV only (for snapshots). Clear README instructions |
| Backups | D1 Time Travel (free; 7-day point-in-time restore) + vocabulary snapshots committed to the private content repo |
| Deleting content | 1-day restorable **Trash**, then auto-purge. A full snapshot is kept permanently in the audit log |
| Auth | Better Auth, **Google sign-in only**. `role` = `user` or `admin` |
| Admin protection | Server-side role check **+ mandatory Cloudflare Access** (emailed one-time code) on `/admin*` and `/api/admin/*` |
| Start defaults | Source **English**, Target **Hebrew**, Topic **All topics**, Amount **10**, shown in a muted "default" style |
| Amount | Learners: **10 / 20 / 30 / 40 / 50** (default 10). Guests: **always 5**, locked, with a "sign-in" toast |
| Guests | Can run 5-card loops after an invisible **Turnstile** bot check. Their Know marks are **not** remembered |
| Anti-scraping | Turnstile for guests + strict limits (guests ~10 loops/hour per IP; learners ~500 cards/day) + `noindex` + no third-party content exposure |
| Content model | One **item** per word, expression or anything else (no type, D-046), in its own language. The three kinds of translation (parallel, meaning, literal; per other language), explanation, synonyms and hints are **ordered lists** stored inside the item row (§11) |
| Types | None (D-046): topics classify items; "Expressions (except Idioms)" and "Idioms" can't be combined on one item |
| Back of card | Different languages → the **parallel** (or the **meaning** when there is no parallel), then **Meaning** and **Literally** (muted) when present, each under its own headline; same language → **explanation**. Hints + synonyms always below |
| Multiple meanings | Admin-set flag. Shown as a "◆ Multiple meanings" badge on the front |
| Card UI | A glassy, violet-glowing **flip card** with a 3D flip animation and a round **Flip** button on both sides |
| Hints | A **Hints** toggle button shows or hides hints + synonyms on the front. Flipping always shows them on the back |
| Flip | The round **Flip** button on the card (front and back), or Space/F; a tap elsewhere on the card does nothing (D-047). It toggles front ↔ back any number of times and never affects grading |
| Known memory | **Any** green "I know it" (any cycle) is remembered per **item and direction** and hides the item in that direction (D-028). The orange "I know it · Show again in future" (signed-in learners) is not remembered: the word stays in the pool (FR-L27a) |
| Known list | "My known words": search/filter/sort; return items to loops (single, selected, all filtered) |
| Know tap | Advances immediately; Back (or swipe right) returns to the card, and its answer can be changed (FR-L29a) |
| Topics | Many-to-many. "All topics" = all items |
| Content sources | Agent-written starter set (in the private content repo) → then admins add manually or by CSV bulk upload |
| UI language | English only (strings centralized for future i18n). Hebrew content renders RTL |
| Look | Dark only. Near-black + violet palette. "Pressable ledge" 3D buttons |
| DB tuning | Built for the D1 free tier: one row per item, only the indexes queries need, no writes from blocked requests, no per-request writes (§11.2) |

---

## 6. Functional requirements: Learner

### 6.1 Landing page and start card
- **FR-L1** The landing page (`/`) shows the slogan, with **"Registered users: N"** in small muted text under it (the number in yellow, like the version) for
  everyone (fetched once when the page opens; hidden if it fails to load, D-036) (when the page loads or is refreshed on Home, the first words
  fade in and "stick" drops in, bounces off twice and sticks on the third try with a soft squash and a faint shine, about
  3s; not when coming back to Home inside the app; a short fade with reduced motion, D-034, D-037), the app version (a small yellow "v1.N" next to the name, D-032), a short hero, a 3-step "How it works" section with a **"Buttons"** guide
  (a small copy of each answer button, in its colour, and what it does; for guests the green one is dark, with a
  small yellow lock, and its line ends "(Sign-in to enable)", D-030, D-042), and the **Start card**.
  Desktop: hero and start card side by side. Mobile: stacked, with the **Start** button right under the hero text
  (and the guest sign-in note), above the start card's fields, so it can be pressed without scrolling (D-021).
- **FR-L2** Start card fields and **defaults** (the defaults come from admin settings, §7.7):

| Field | Options | Default |
|---|---|---|
| Source language | Active languages | **English** |
| Target language | Active languages | **Hebrew** |
| Topic | "All topics", then the active topics (by `sort_order`) under a **"Topics"** heading (D-040) | **All topics** |
| Amount (signed-in) | **10 / 20 / 30 / 40 / 50** (segmented control) | **10** |
| Amount (guest) | **5**, fixed and locked | **5** |

- **FR-L3 Default styling**: a default value must still read as **chosen**: same background and bright `--text`
  value as a selected one (the selected option of a segmented control is filled the same way), with a subtle solid
  `--border` outline and a small violet **"Default"** tag. As soon as the user changes it, the field gets a solid
  `--accent` outline and the tag disappears (owner feedback, 2026-11-18: the muted look made defaults seem unset).
  When any field differs from its default, a **"Reset to defaults"** link appears. The user can press **Start**
  immediately without touching anything.
- **FR-L4** "New session" from the summary starts the next session with the same selection right away (FR-L32,
  D-029). A fresh visit to `/`, including **Home** from the summary, always starts from the defaults (nothing is
  remembered between visits).
- **FR-L5 Same language**: choosing source = target is allowed. The back of the card then shows the item's
  **explanation** instead of a translation. While the two languages are the same, a short muted note under the
  fields says "Same language: the back shows an explanation".
- **FR-L6 Guest amount**: guests see the Amount field fixed at **5** with a lock icon. It cannot be changed. A
  **temporary toast** says: **"Sign-in to choose more cards per session."**, where **"Sign-in"** is a link that
  starts sign-in (D-043), and auto-dismisses after 2 s (D-045). On desktop it appears inside the Amount field, on its
  right side (the lock and the 5 stay visible), instead of the toast corner (D-044). It appears:
  - once automatically, the first time a guest sees the start card in a browser session, and
  - every time the guest taps/clicks the locked Amount field.
  The server **enforces** 5 for guests regardless of the request (§12.1).
- **FR-L6a Guest topic: the Sample set** (D-038): guests play only items marked **"Include in Sample set"**, across
  every topic. Their Topic dropdown shows **"Sample set"** selected, with "All topics" and every topic listed below it
  **greyed out and unselectable**, a lock icon on the field, and the note "Sign-in to choose any topic." They still
  choose the languages, and the "N new cards available" count only counts the sample set. The server
  **enforces** it for guests whatever the request says (both the count and starting a session). Signed-in learners
  never see a "Sample set" option; **admins** do, so they can play exactly what guests get.
- **FR-L7** The start card shows **"N new cards available"** for the current selection (debounced 300 ms; counts only
  playable items (FR-L40); excludes known items for signed-in users).
- **FR-L8** If fewer cards are available than the amount, the loop starts with all available cards and shows a notice
  ("Only 7 new cards in Home, starting with 7"). If 0 are available: an empty state ("You know every card in this
  selection 🎉") with links to change the selection or open "My known words".
- **FR-L9** Guests see a subtle banner: "Sign-in with Google to remember the words you know and choose bigger sessions."
  "Sign-in with Google" is a link that starts sign-in. A soft violet light runs round the banner's frame three times
  (about 7s a lap), then the frame keeps a steady faint glow; with reduced motion, only the glow (D-033).
- **FR-L10** Guests pass an **invisible Cloudflare Turnstile** check when they press Start (§14.3). In the rare case
  Turnstile shows an interactive challenge, it appears inline in the start card.
- **FR-L11** When `guests.enabled` = false, guests see "Sign-in to start" instead of the Start button.
- **FR-L12** When `maintenance.enabled` = true, every page shows `maintenance.message`, and starting loops is disabled
  for non-admins.

### 6.2 The loop
- **FR-L20** `POST /api/loops` returns the selected cards (fully composed for display). The loop then runs **entirely
  in the browser** (no network round-trip per tap).
- **FR-L21** Cycle 1 = all selected cards, shuffled with Fisher–Yates. Each later cycle = the previous cycle's
  "Don't know" cards, re-shuffled. **If a cycle has more than one card, its order must differ from the previous
  cycle's relative order** (re-shuffle, up to 10 attempts; then rotate by one).
- **FR-L22 The flip card.** Each card is shown on a raised card with a soft shadow (§9.3).
  - **Front**: a small label with the direction (e.g. "EN → HE"); the item **text**, large and
    centered, with `dir`/`lang` from its language (`rtl` for Hebrew); a **"◆ Multiple meanings"** badge under the text
    when the item has multiple meanings. Under the text, the **Hints** section (FR-L25): the hints in order, then a
    **Synonyms:** line (if there are synonyms), in smaller muted text with the item language's `dir`, always there but
    under a **live cover** until tapped (D-047). If the item has no hints and no synonyms, the section shows "Hint is
    not available", with no cover.
  - **Back**: for a translation, labelled sections (D-024, D-025): the main answer in large text under a small
    headline ("Parallel" when the item has one, otherwise "Meaning"); under a parallel, a **"Meaning"** section in a
    medium size; then a **"Literally"** section, small and muted. When the literal is marked as the same as the
    parallel (D-026), the headline reads **"Parallel (also literally)"** and there is no Literally section. Each section is in the answer language's `dir`; two
    or more entries in a section are numbered; a kind with no entries isn't shown. For the same language: the
    "Explanation" chip and the explanation lines; a thin divider; then the Hints section and the Synonyms line, **always** (whether or not
    Hints was pressed), or "Hint is not available".
  - Every card starts **front side up, with hints hidden**.
- **FR-L23** Header progress: `Cycle 2 · Card 1/3 · 2 known` (known = total known in this loop).
- **FR-L24** Buttons and phases:

| Phase | Know | Hints (cover) | Flip | Don't know | Back | Next | Stop |
|---|---|---|---|---|---|---|---|
| **Deciding**, card not answered yet | enabled | enabled\* | enabled | enabled | enabled\*\* | **disabled** | enabled |
| **Deciding**, card answered earlier (reached with Back) | enabled | enabled\* | enabled | enabled | enabled\*\* | **enabled** | enabled |
| **Revealed** (after Don't know) | disabled | enabled\* | enabled | disabled | enabled\*\* | **enabled + focused** | enabled |

\* Hints: the live cover on the card front (D-047), usable whenever the **front** is showing (a toggle).
\*\* Back is disabled on the first card of a cycle (FR-L29a).
**Know · ask again** (signed-in learners, FR-L27a) is enabled and disabled exactly like Know.

- **FR-L25 Hints** (D-047): on the **front**, the hints and synonyms sit under a **live cover**: a cloud of tiny
  shimmering dots over the blurred text, with a small "Tap to see hints" label, so it is clear it can be tapped.
  Tapping the cover (or pressing **H**) reveals them (the dots scatter and fade, the text sharpens); tapping again
  covers them. The cover is a real button ("Tap to see hints" / "Hide hints", `aria-expanded`); the hidden text is not
  read out until revealed; it is at least 4.5rem tall, so a one-line hint is still easy to tap; with reduced motion
  the dots stand still. There is **no Hints button**. The state survives flipping back and forth and is remembered per card
  within the cycle: a new card starts covered, a card reached again with Back or Next shows it as it was left, and
  a new cycle starts every card covered again (D-048). The back shows the hints uncovered, always. **Hints have no effect on grading** and are not
  recorded.
- **FR-L26 Flip**: turns the card over (front ↔ back) with a 3D flip animation (§9.4). It can be triggered by the
  round **Flip** button in the card's corner (shown on **both** faces, never covered) or by the **Space**/**F** keys.
  A tap or click anywhere else on the card does nothing, so a near-miss on the hints cover never flips it (D-047). The learner can flip back and forth
  **any number of times**, in both phases. **Flipping has no effect on grading** and is not recorded.
- **FR-L27 Know** (available on either side while Deciding): removes the card from the loop (it won't appear in the
  next cycle), records it as known in this cycle, and **immediately** shows the next card (front side up). A Know made
  by mistake is fixed with **Back** and then **Don't know** (FR-L29a). The earlier **Undo bar** (with its countdown)
  was removed on 2026-11-19 at the owner's request (D-019): Back covers it and works for any card of the cycle.
- **FR-L27a Know · ask again** (signed-in learners; owner request, 2026-11-19, D-023): a second, **amber** Know
  button between Know and Don't know. Inside the session it is exactly Know: the card leaves the loop, counts in
  "N known" and in the summary, plays the Know animation, and the next card shows. The difference: it is **not
  recorded** in the learner's known items (FR-L50), so the word stays in the pool and may be drawn again in any later
  session, at random (no schedule or waiting time).
  **Labels (D-030):** green **"I know it"** with the caption **"Don't show again"**; amber **"I know it"** with
  **"Show again in future"**; red **"I don't know"** with **"Show again soon"**. Guests see all three, with the same
  labels and captions (D-042): nothing is ever stored for them (FR-L55), so the amber one does for them exactly what
  it says and is their "I know it", while the green **"Don't show again"** is shown **locked**: a darker green, a
  yellow padlock on its top-left edge, off, titled "Sign-in to enable". Tapping it (or pressing K) marks nothing
  and shows **"Sign-in required"** over that button for 1.5 seconds, "Sign-in" being a link that starts sign-in
  (D-043); it is `aria-disabled` rather than `disabled`, so it can still be tapped and focused.
- **FR-L28 Don't know** (available on either side while Deciding): adds the card to the next cycle. If the card is
  showing its front, it **flips automatically** to the back (answer + hints + synonyms). The phase becomes
  **Revealed**: the three answer pills stay in place but disable, **Next** enables and receives focus, and Flip
  stays available (Hints works only while the front shows). The layout does not change: the round **Next turns
  violet and pumps** (a gentle grow-and-shrink with a soft ring) until it is pressed, so the way on is clear; with
  reduced motion it shows a steady ring instead (D-031).
- **FR-L29 Next**: moves to the next card (enabled in the Revealed phase, and on a card answered earlier that was
  reached with Back). The next card enters front side up with a short rise-in (no reverse-flip animation).
- **FR-L29a Back and changing an answer** (owner request, 2026-11-19): the round **Back** button (or **←**) shows the
  previous card of the current cycle, card by card, down to the first card of the cycle (earlier cycles are out of
  reach). On the cycle break and the summary, **"← Back to the last card"** returns to the cycle's last card. A card
  reached with Back (or Next) **always shows its front**, even if it was showing its back when left, with its hints
  cover **as it was left**: open if the learner had revealed the hints and not covered them again (D-048).
  - A card that already has an answer shows a short chip on the same line as the direction label, on phones too
    (D-049): **"Clicked: I know it ✓"** (green), **"Clicked: I know it ✓"** (amber; screen readers also hear "(show
    again in future)") or **"Clicked: I don't know ✗"** (red), and **Next** steps forward without answering again,
    up to the first unanswered card.
  - **The answer can be changed.** **Know** on a Don't know card takes it out of the next cycle, records it as known
    and moves on. **Don't know** on a Know card removes the Know, adds the card to the next cycle (never twice) and
    reveals the answer as in FR-L28. Switching between the two Knows only changes whether the word is recorded
    (FR-L53). Choosing the same answer again changes nothing. A change on the last card can
    turn the summary into a cycle break, or the reverse.
  - Answers are derived from the loop state (`known` for this cycle, with an "ask again" flag, and `nextCycle`), so
    there is no separate store.
- **FR-L29b Swipe** (phones, touch only; owner request, 2026-11-19): **swipe left = Next**, **swipe right = Back**,
  only when that action is allowed. The card follows the finger with a slight tilt; past about 70 px (or a quick flick)
  it slides out and the action runs, otherwise it springs back. When the action isn't allowed it moves only a little,
  with resistance. A mostly vertical drag is ignored, a tap does nothing, and with "reduce motion" there is no movement
  (the action just happens). There is no on-screen hint; the buttons stay.
- **FR-L30 Stop**: the **Stop** button (or Esc) first asks **"Stop the session? This will stop the session. Are you
  sure?"** with **Yes** / **No**, the same question as Home (FR-L30a; owner request, 2026-11-18). **Yes** ends the
  loop and returns to `/`; already-made Know marks are kept (and flushed, §6.4). **No** continues where it was.
- **FR-L30a Home from the loop**: the loop header has a **"← Home"** link like the other pages. Because it leaves the
  loop, it first asks **"Back to Home? This will stop the session. Are you sure?"** with **Yes** / **No**. **Yes** = Stop (FR-L30);
  **No** closes the question and the loop continues where it was. While the question is open, loop shortcuts are
  ignored and Esc means No (owner request, 2026-11-18).
- **FR-L31 Cycle break**: when a cycle ends and "Don't know" cards remain, an interstitial shows
  "Cycle 3 · 2 cards left" with a **Continue** button (Enter also continues).
- **FR-L32 End of loop**: when a cycle ends with no "Don't know" cards, a summary shows the total cards, the number of
  cycles, **Already knew** (known in cycle 1) vs **Learned here** (known in cycle ≥ 2), and buttons **New session**
  and **Home**. **New session** starts the next session at once with the same selection (languages, topic,
  amount), without the start card (D-029): the button reads "Starting…" (guests: the security check) meanwhile, and a
  problem (no new cards left, the daily limit, a failed check) is shown under the buttons, where Home stays available.
  It waits while the start settings load, and if they can't load it falls back to the start card, pre-filled.
  **Home** goes to the start card with the defaults. Guests also see "Sign-in to remember these words".
- **FR-L32a Celebration** (owner request, 2026-11-19): when the summary appears, a burst of **confetti** in the app's
  colours shoots up from the bottom corners and flutters down for about 3 seconds (a canvas drawn by the app, no
  library; none with "reduce motion"), and a short **applause** plays (`/sounds/applause.wav`, 2.3 s, mono, about
  150 KB, loaded only then). A **🔊 Sound on / 🔇 Sound off** switch on the summary turns it off; the choice is
  remembered on the device (`localStorage`), and sound is on by default. If the browser refuses to play, only the
  confetti shows.
  - **Once per session**: after "← Back to the last card", reaching the summary again shows no confetti and plays no
    sound. The flag is kept with the saved session, so a refresh doesn't repeat it either. **Exception**: if the
    learner went back, changed a card to Don't know and **continued into a new cycle**, completing that cycle is a
    new completion, so the celebration and the crown's flight happen again.
  - **The crown**: as the last confetti falls (about 2.4 s), a yellow crown flies in slowly (about 2 s) along one
    smooth arc (no pause on the way) from the top-left of
    the screen and lands, tilted, on the **upper-left corner** of the summary card with a small bounce. It stays there,
    and on later visits to the summary in the same session it is already in place (no flight). With "reduce motion"
    it is simply there from the start.
- **FR-L33** The loop state (including the current card's side and whether its hints are shown) is saved in
  `sessionStorage`, so a page refresh resumes the same loop. Stop or finishing clears it.
- **FR-L34** Desktop keyboard shortcuts (listed in a "Keyboard shortcuts" popover in the loop header): **K** Know, **A** Know · ask again (signed-in learners), **D** Don't know, **H** Hints,
  **Space/F** Flip, **←** Back, **→** Next, **Enter** Next or Continue, **Esc** Stop (asks first, FR-L30). Shortcuts respect the enabled/disabled state.

### 6.3 What the back of the card shows
The front always shows the item text. The back depends only on whether the two languages are the **same or
different**:

| Languages | Answer (large) | Below the divider |
|---|---|---|
| different (e.g. EN → HE) | the item's **parallel** in the target language, or its **meaning** when it has no parallel: each entry on its own line; then "Meaning" (under a parallel) and "Literal translation" (smaller, muted) when the item has them in the target language (D-024) | Hints + Synonyms (item language) |
| same (e.g. EN → EN) | the item's **explanation**: each entry on its own line, **numbered** ("1.", "2.") when there are two or more | Hints + Synonyms (item language) |

- **FR-L40 Playability**: an item can be used for a direction only if it is `published`, not in Trash, its
  language is the source language, and:
  - different languages: it has **≥ 1 meaning** entry in the target language (D-025: the meaning is the required
    translation; a parallel or literal translation alone never makes an item playable);
  - same language: it has **≥ 1 explanation** entry.
- **FR-L41** The server composes each card (front, answer lines and what they are, meaning, literal translation, hints, synonyms, languages and text directions)
  before sending it (§12.1). The browser only renders it and never applies these rules itself.
- **FR-L42** Hints and synonyms are always in the item's language and are shown with its `dir`.
- **FR-L43** The parallel and the literal translation never make an item playable on their own (FR-L40 needs a
  meaning). The meaning and the literal translation are never revealed by **Hints** (they would give the answer away).
  "My known words" shows the main answer only (the parallel, else the meaning).

### 6.4 Known items (signed-in learners only)
- **FR-L50** Every Know (in any cycle) is recorded as `{itemId, target, cycle}` in a client-side **pending queue**.
  `itemId` + `target` identify the mark: the item in that direction (D-028). **Know · ask again** (FR-L27a) is never queued or sent.
- **FR-L51** An entry becomes **final** when its short waiting period expires (`undo.windowSeconds`, default 5, so a
  quick change of answer costs no request) or a newer Know happens. Final entries are sent in batches
  (`POST /api/me/known`, debounced ~2 s). On `pagehide`/`visibilitychange=hidden`, **all** entries (including ones
  still waiting) are flushed with `fetch(..., {keepalive: true})`.
- **FR-L52** The queue is mirrored to `localStorage` (keyed by user id; item ids and target codes only, never item
  text; a newer mark replaces only an older one of the same item **and** direction) so unsent
  entries survive a closed tab and are sent on the next app load. Sends retry with exponential backoff. The server
  upsert is **idempotent** (it keeps the earliest `known_at`).
- **FR-L53** Changing a Know to Don't know or to Know · ask again (FR-L29a) removes the entry from the queue. If it
  was already sent, the client calls `DELETE /api/me/known/:itemId?target=<code>` (that direction only). Changing
  Don't know or Know · ask again to Know
  queues a new entry.
- **FR-L54** `POST /api/loops` (and the available count) for a signed-in user **excludes** the items they know **in
  that loop's direction** (D-028). Knowing "Swift" in EN → HE hides it from EN → HE only: it still appears in
  EN → EN (the explanation direction) and in EN → AR. Separate items are not affected either: the Hebrew item "מהיר"
  still appears in HE → EN loops.
- **FR-L55** Guests: nothing is queued or stored.
- **FR-L56 Failed sign-in** (owner request, 2026-11-18): the server rewrites Better Auth's error redirect to one of two
  neutral addresses, never carrying the error code or its description: `/?signin=refused` when the account may not
  sign in (a banned account) and `/?signin=error` for anything else. Better Auth's banned text is replaced by a
  neutral one, so **"banned" never appears** in the address bar or the page. The start page then shows a notice that
  **stays until dismissed** (✕), above the hero:
  - refused: "We couldn't sign you in with this Google account. You can keep learning as a guest.";
  - error: "Sign-in didn't complete. Please try again."
  The automatic guest "sign-in" toast (FR-L6) is held back on that visit, so the two never contradict each
  other. The address is cleaned at once, so a refresh doesn't repeat the notice. A ban with an end date simply stops
  refusing once it ends.

### 6.5 "My known words" page (`/known`, signed-in only)
- **FR-L60** A paginated list (cursor, 50 per page) of the learner's known items, **one row per item and direction**
  (an item known in EN → HE and EN → EN is listed twice, D-028): item text (with `dir`), language,
  the "◆" badge if it has multiple meanings, the answer in the direction where it was marked (e.g.
  "EN → HE: תאריך, תמר"), topic chips, date known, and a badge **Already knew** (cycle 1) / **Learned here**
  (cycle ≥ 2).
- **FR-L61** Search (item text and translations, case-insensitive), filters (**direction**, e.g. "English → Hebrew" or
  "English → English (explanation)", from the active languages; topic), and sort
  (newest first by default; oldest first; A→Z).
- **FR-L62** **Return to loops**: per row; for selected rows (checkboxes); or "Return all N filtered" (with a confirm
  dialog). A row returns the item in its direction only; returned items immediately become available to future loops
  in that direction.
- **FR-L63** Items in Trash are hidden from this list, and reappear if restored.
- **FR-L64** An empty state explains how items get here.

### 6.6 Account
- **FR-L70** Sign in / sign out with Google (header button; avatar menu when signed in).
- **FR-L71** **Delete my account** (in the avatar menu → Account page; typed confirmation). Deletes the user, sessions,
  accounts, known items and usage counters (cascade). Owners can't delete themselves while they are the last admin.
- **FR-L72** A minimal **Privacy** page: what is stored (Google id, email, name, avatar, known items, daily usage
  counters, hashed IPs for rate limiting), why, and how to delete it.

---

## 7. Functional requirements: Admin (Superuser)
The admin panel lives at `/admin` and is reachable only through **both** locks (§13). The admin bundle is lazy-loaded
so learners never download it. All admin pages work on mobile (tables collapse into cards).

### 7.1 Dashboard (`/admin`)
- **FR-A1** Counts: items (by language), items missing a translation (per language), items without an
  explanation, items with no hints, items with multiple meanings, items in the Sample set, users, admins, items in
  Trash, rate-limit/scraping events in the last 24 h. Quick links. A **"What guests can play (Sample set)"** section
  lists the published Sample-set items with an answer for each direction (fewer than 5 is shown in red,
  D-038).

### 7.2 Items (`/admin/items`, `/admin/items/new`, `/admin/items/:id`)
- **FR-A10** List: search (text and translations), filters (language, topic, status, Sample set (in / not
  in), multiple meanings,
  "missing translation into X", "missing explanation", "no hints", "not playable"), sort, pagination (50 per page).
  Columns: text, language, ◆, a "Sample" badge, topics, translation badges per language, explanation ✓, hint
  count, status, updated.
- **FR-A11** **Item editor**:
  - **Header**: language, text, **Multiple meanings** (toggle), **Include in Sample set** (toggle,
    off for new items, D-038), status (draft/published),
    topics (multi-select chips). The **language is chosen at creation and then fixed** (to change it, create a new
    item); this keeps an existing translation from becoming a same-language translation. Save validates uniqueness
    (same language + normalized text among non-deleted items; no type, D-046).
  - **Translations**: per language **other than the item's language** (an English item shows "Hebrew"; a
    Hebrew item shows "English"), stacked one under the other. An inactive language gets its block too, marked
    "inactive: learners don't see it yet", so its content can be prepared before it is switched on (D-027); three inline list editors in display order: **meaning (required)**, **parallel** and
    **literal translation** (D-024, D-025). A missing meaning shows the "not playable" warning. Where the language
    has a parallel and no literal entries, a **"Same as the parallel"** checkbox stores the marker (D-026) instead of
    a list; an expression with a parallel but an empty literal shows a "No literal translation" warning. The item's own language is never offered (§8.1).
  - **Explanation**: an inline list editor, one entry per meaning, in the item's language.
  - **Synonyms**: an inline list editor.
  - **Hints**: an inline list editor.
  - **Preview as learner**: renders the **flip card** exactly as the loop would (Hints and Flip working), one
    direction at a time. A **"Show the answer in"** picker lists each other language (translation card) and
    then the item's own language (explanation card), each marked ✓ (ready) or ✗ (not yet), and inactive ones marked
    "inactive" (D-027); past six languages it is a dropdown. It opens on the first ready translation language,
    active ones first (a Hebrew item on English, an English item on Hebrew). Above the card, a heading names the direction and the kind ("English → Hebrew ·
    Translation") with one line on what the back shows; a direction that isn't ready shows what to add instead of a
    card ("add a meaning in Hebrew", "add an explanation"). It uses the server's card builder (§12.4), so it always
    matches what learners see, with the session's Hints toggle. On desktop each card is drawn at the session card's exact size for the window and scaled
    down to fit the admin column (a true miniature: same text size, wrapping and spacing in proportion).
  - **Warnings** (badges; they never block saving):
    - not playable for a direction (no translation into X, or no explanation);
    - **Multiple meanings** is on, but a translation list or the explanation has only one entry;
    - **mixed scripts**: a text contains letters from a different script than its language (e.g. a Hebrew "מ" inside
      an English item: "A מeedle in a haystack"). Checked for the text, explanation, synonyms and hints (against the
      item's language) and for each translation entry (against that translation's language), using
      `languages.script` (§11).
- **FR-A12** **Inline list editor** (one reusable component for translations, explanation, synonyms, hints; in the item
  editor the lists are stacked one under the other at full width, also on desktop): shows
  entries in order; **Add** (input + Enter); **Edit** in place (click/tap → input with **Save** and **Cancel** buttons;
  Enter also saves, Esc also cancels; clicking elsewhere keeps the edit open, never discards it silently); **Delete**
  (immediate, with a 5-second "Undo" toast that re-adds the entry); **Reorder** (drag handle on desktop, ↑/↓ buttons
  on mobile and for keyboard users). Every change saves that list right away (`PATCH /admin/items/:id` with the item's
  `version`) and is audit-logged with the list before and after.
  - **Concurrent edits**: if someone else changed the item since it was loaded, the save is rejected (409); the editor
    reloads the item and says "This item was changed by someone else. Your last change was not saved."
- **FR-A13** **Delete item** = soft delete to Trash (confirm dialog that names the item).

### 7.3 Trash (`/admin/trash`)
- **FR-A20** Lists soft-deleted items: text, language, deleted by, deleted at, and "purges in Xh Ym".
- **FR-A21** **Restore**: undeletes the item. Restore is **blocked** with a clear message if a non-deleted duplicate
  now exists (same language + normalized text). Users' known marks are preserved while an item is in Trash, so
  restoring brings them back.
- **FR-A22** **Purge now**: permanent delete (typed confirmation).
- **FR-A23** **Auto-purge**: a Worker Cron Trigger runs hourly and permanently deletes items whose `deleted_at` is older
  than `trash.retentionHours` (default **24**). Purge cascades to topic links and users' known marks.
- **FR-A24** Every delete, restore and purge writes an audit entry containing a **full JSON snapshot** of the item
  (all fields and lists + topic slugs) that is **kept permanently**.

### 7.4 Topics (`/admin/topics`)
- **FR-A30** CRUD: slug (lowercase, `a-z0-9-`), name, active, sort order (reorder), and **"Can't be combined with"** (one other topic, kept both ways; refused while items are in both; D-046). An item with two such topics can't be saved in the editor, and is an error in a CSV import. The add form fills the slug from
  the name as it is typed ("Home & Garden" → `home-garden`) until the admin edits the slug; a hint under the field says
  what it is for, and an invalid or already-used slug is reported under the field while typing (Add stays disabled). Deleting a topic that still has
  items is blocked: deactivate it instead, or remove it from those items first.

### 7.5 Languages (`/admin/languages`)
- **FR-A35** Lists languages (code, name, native name, direction, script) with an **active** toggle and an **Edit**
  button (name and native name; the code, direction and script are fixed). Learners see only active languages: an
  inactive one is hidden from the start card and never used in a session, and its data is kept. At least one language
  stays active.
- **FR-A36** **Add a language** (D-027): a form under the list. A **Language** dropdown of common languages (those not
  added yet) fills the code, name, native name, direction and script, all still editable; **"Other"** leaves them to
  type. The code (ISO 639, e.g. `ar`, `pt-br`) must be new; the script (ISO 15924, e.g. `Arab`) must be one Unicode
  knows, since the mixed-script check uses it. Both are checked while typing and again by the server. A new language
  starts **inactive** and goes last in the order. While inactive, its content can be prepared: the item editor
  shows its translation block and offers it as an item language, CSV import and the template accept its columns,
  the preview shows its cards, and the Items filters include it ("Missing Arabic meaning"). Ticking Active makes it
  available to learners.

### 7.6 Users (`/admin/users`)
- **FR-A40** List: avatar, name, email, role, **Owner** badge, created, last seen (from the latest session refresh, day
  precision; never written per request, §11.2), banned. Search by name/email.
- **FR-A41** **Make admin / Remove admin**. Rules: owners (in `ADMIN_EMAILS`) can't be demoted; an admin can't demote
  themselves; the last remaining admin can't be demoted.
- **FR-A42** **Ban / Unban** (with an optional reason). Banning revokes all the user's sessions. Admins can't ban
  themselves or owners.

### 7.7 Settings (`/admin/settings`)
| Key | Type | Default | Meaning |
|---|---|---|---|
| `defaults.sourceLang` | lang code | `"en"` | Start card default source |
| `defaults.targetLang` | lang code | `"he"` | Start card default target |
| `defaults.topicId` | int \| null | `null` (All topics) | Start card default topic |
| `loop.sizeOptions` | int[] | `[10,20,30,40,50]` | Amount choices for signed-in learners |
| `loop.defaultSize` | int | `10` | Default amount (must be in `sizeOptions`) |
| `loop.maxSize` | int | `50` | Server-side cap for `POST /loops`; no amount choice may exceed it. Admin label "Maximum amount", with a hint under the field explaining this |
| `guests.enabled` | bool | `true` | Allow guests to run loops |
| `guests.loopSize` | int | `5` | Fixed guest amount (server-enforced) |
| `guests.loopsPerHour` | int | `10` | Guest loops per hour per IP |
| `users.cardsPerDay` | int | `500` | Cards served per learner per UTC day (admins exempt) |
| `undo.windowSeconds` | int | `5` | Seconds a Know waits in the queue before it is sent (1–15; FR-L51). Admin label "Seconds before a Know is saved" |
| `maintenance.enabled` | bool | `false` | Show banner + block loops for non-admins |
| `maintenance.message` | string | `""` | Banner text (≤ 280 chars) |
| `trash.retentionHours` | int | `24` | Hours before auto-purge (1–720) |

- **FR-A50** Settings are validated with Zod (server side; e.g. the default languages must be active, and
  `defaultSize` must be in `sizeOptions`) and audit-logged.

### 7.8 CSV import (`/admin/import`): see §8.3
- **FR-A60** Download the template; upload a CSV; **dry run** shows the counts, per-row errors and warnings; **Commit**
  applies it (allowed with warnings, refused with errors).
- **FR-A61** The option "Create missing topics" (default off).

### 7.9 Audit log (`/admin/audit`)
- **FR-A70** A read-only list: time, actor, action, entity type/id, summary. Filters: actor, action, entity type, date
  range. Row detail shows the pretty-printed `details` JSON (snapshots, before/after).
- **FR-A71** No API exists to modify or delete audit entries.

---

## 8. Content: model, CSV, private content repo, export

### 8.1 The item model
This JSON shape is used by the API, the admin editor and the JSON export (illustrative content):
```json
{
  "itemId": 61,
  "text": "Date",
  "lang": "en",
  "multipleMeanings": true,
  "topics": ["food"],
  "parallel": {},
  "meaning": { "he": ["תאריך", "תמר"] },
  "literal": {},
  "explanation": ["A particular day of the month or year",
                  "The sweet brown fruit of the date palm"],
  "synonyms": [],
  "hints": ["What is the date today?", "Dates grow on palm trees."],
  "status": "published"
}
```
| Field | Rules |
|---|---|
| `text` | Required, ≤ 200 chars. Always the front of the card |
| `lang` | A known language, active or not (D-027). **Fixed after creation** |
| `multipleMeanings` | Boolean, default `false` |
| `topics` | 0..N topic slugs (ids in the admin API). An item without topics appears only under All topics |
| `parallel` | Column `translation_parallel`. An object whose keys are language codes **other than `lang`**; each value is a non-empty ordered list (≤ 10 entries, each ≤ 200 chars): the equivalent word or expression in that language. For a plain word, this is simply its translation. The main answer of a card |
| `meaning` | Column `translation_meaning`. Same shape (≤ 10 entries, each ≤ 300 chars): what the item means, in that language. Shown under the parallel, or as the main answer when there is no parallel |
| `literal` | Column `translation_literal`. Same shape (≤ 5 entries, each ≤ 200 chars): the word-for-word translation, shown last in a muted color. When it is word for word the same as the parallel, the list holds only the marker `=parallel` (D-026), allowed only where that language has a parallel; an empty list means "not filled in" |
| `explanation` | Ordered list in `lang` (≤ 10 entries, each ≤ 500 chars), one entry per meaning |
| `synonyms` | Ordered list in `lang` (≤ 20 entries, each ≤ 100 chars) |
| `hints` | Ordered list in `lang` (≤ 20 entries, each ≤ 500 chars) |
| `status` | `published` (default) or `draft` (hidden from loops) |
| `in_sample_set` | Guests play only these items (D-038). Off for new items; every item that existed when it was added was put in |

- The meaning is required to play an item into a language; the parallel and the literal translation are optional
  (D-024, D-025). Example, the Hebrew idiom "יצא המרצע מן השק" in English: parallel "The cat is out of the bag",
  meaning "The truth came out", literal "The awl came out of the sack". The English word "fork" in Hebrew: only the
  meaning "מזלג".
- **No translation of any kind into the item's own language, at every layer**: the editor never offers it,
  the API and CSV import reject it (Zod), and a database CHECK constraint blocks it (§11). Because `lang` is fixed after creation, an
  existing translation can never turn into a same-language one.
- Within each list, entries are trimmed, empty entries are dropped, and duplicates are rejected (normalized compare,
  §8.2).
- Hebrew → English cards need **Hebrew items** (the `text` is always the front). The English item "Swift" and the
  Hebrew item "מהיר" are separate items, each with its own lists and known marks.
- **Adding a language later** (FR-A36, D-027): add it in Languages (it starts inactive), add translations into it on
  existing items (in the editor, or new `translation_parallel_<code>` / `translation_meaning_<code>` /
  `translation_literal_<code>` CSV columns), create items whose `lang` is the new language, check the cards in the
  preview, then activate it.

### 8.2 Text normalization (`packages/core`)
`normalized_text` is used for uniqueness and merge matching (never shown):
Unicode **NFC** → trim → collapse internal whitespace to one space → lowercase (`toLowerCase()`, locale-independent)
→ remove Hebrew niqqud/cantillation marks (U+0591–U+05C7) → remove Arabic short-vowel and Quranic marks (harakat,
superscript alef, small high signs) and the tatweel (U+0640) (D-027) → strip leading/trailing punctuation.
The same normalization (case-insensitive, NFC) is used to de-duplicate entries within each list.

### 8.3 CSV format (used by import, seed, and the vocabulary export)
- **Encoding**: UTF-8, with or without BOM. Export writes UTF-8 **with** BOM (so Excel shows Hebrew correctly). The
  template and help text tell Excel users to save as **"CSV UTF-8 (Comma delimited)"**. If an uploaded file isn't valid
  UTF-8, the import fails with a clear error.
- **Import limits**: ≤ 2 MB and ≤ 5,000 data rows per file (admin upload). `pnpm db:seed` has no such limit (it chunks).
- **Structure**: **one row per item**. RFC 4180 quoting. Header row required. List cells use `|` as the separator
  (entries trimmed; empty entries ignored; a literal `|` inside an entry is not supported in v1).

| Column | Required | Description |
|---|---|---|
| `lang` | yes | A known language code (`en`, `he`), active or not (D-027) |
| `text` | yes | Item text (≤ 200 chars) |
| `type` | no | Old, optional (D-046): `word` or `expr`. `expr` puts the item in "Expressions (except Idioms)" unless it is in a topic that excludes it; otherwise ignored. The export no longer writes it |
| `multiple_meanings` | no | `true` / `false` (default `false`) |
| `topics` | no | Topic slugs, `|`-separated. Older files may call this column `categories` (still read, D-039) |
| `translation_parallel_<code>` | no | One column per language, e.g. `translation_parallel_he`: the parallel (equivalent word or expression) in that language, `|`-separated. The column of the row's own `lang` must be empty |
| `translation_meaning_<code>` | no | One column per language: the meaning in that language, `|`-separated. The row's own `lang` column must be empty |
| `translation_literal_<code>` | no | One column per language: the literal (word-for-word) translation in that language, `|`-separated, or `=parallel` when it is the same as the parallel (D-026). The row's own `lang` column must be empty |
| `explanation` | no | Explanation entries in the row's language, `|`-separated |
| `synonyms` | no | `|`-separated |
| `hints` | no | `|`-separated |
| `status` | no | `published` (default) or `draft` |
| `sample` | no | `true` / `false`: in the Sample set guests play (D-038). Empty: off for a new item, unchanged for an existing one. The one column that can change an existing item both ways (the import is otherwise append-only) |

Rules:
- A row must have **at least one meaning or explanation** (otherwise it can't be played in any direction).
- A translation column for an unknown language is a file error. A value in the row's own language column is a row
  error ("An English item can't have an English translation; use `explanation`"). Errors name the column as it is in
  the file.
- **Old column names** (before D-024) are still read: `translation_<code>` is the meaning (D-025) and
  `literal_<code>` the literal translation. An old and a new name for the same list in one file is a duplicate column.
- **Merge semantics** (an import never deletes or overwrites):
  - An item matches an existing **non-deleted** item on (`lang`, normalized `text`); otherwise it is created.
  - Topics are unioned. Parallel, meaning and literal entries (per language), explanation entries, synonyms and hints are appended
    if not already present (normalized compare).
  - `multiple_meanings = true` turns the flag on; `false` or empty never turns it off.
  - `status` applies only to newly created items (an existing item's status isn't changed by import).
  - Rows in the same file that refer to the same item are merged together.
- Unknown topic slugs → a row error, unless **Create missing topics** is ticked (the slug becomes the
  name in Title Case). `pnpm db:seed` always creates missing topics.
- **Warnings** (shown in the dry run; they don't block the commit): multiple meanings with a single-entry list; mixed
  scripts (FR-A11).
- **Dry run** (`dryRun=true`): parses and validates everything and returns totals (new items, merged items, new
  parallel, meaning and literal entries, explanation entries, synonyms, hints, skipped duplicates) and lists of `{row, column, message}`
  errors and warnings. Nothing is written.
- **Commit**: refused if the dry run would report errors (fix the file first). It is written in a single D1 `batch()`
  (transactional). If D1 limits require it, the write is chunked by item with a precise report of what was written.
  It writes one `csv.import` audit entry with totals and the file name/SHA-256 (never the file contents).
- **Round-trip guarantee**: exporting the vocabulary to CSV (§8.6) and importing that CSV into an empty database
  produces identical content (items, topics, all lists in order, flags, statuses). The export writes a
  `translation_parallel_<code>`, `translation_meaning_<code>` and `translation_literal_<code>` column for every
  language present. No cell escaping that would alter values is applied.

**Example** (illustrative only; the template also has a synthetic expression row with all three kinds). Only the
columns a file needs are required; the others may be left out.
```csv
lang,text,multiple_meanings,topics,translation_meaning_he,translation_meaning_en,explanation,synonyms,hints,status
en,Swift,word,true,,מהיר|סנונית,,"Moving or able to move very fast|A small bird that flies very fast",fast|quick|rapid,"He gave a swift reply.|A swift nested under the roof.",published
he,מהיר,word,false,,,fast|quick,"שנע או פועל במהירות רבה",זריז,"הרכבת המהירה הגיעה בזמן.",published
```

### 8.4 Starter set
- Written by the implementing agent into the **private content repo folder** (`../MyVocab-Content/starter.csv`),
  **never** into the public code repo.
- 6 topics: `home`, `nature`, `electronics-devices`, `food`, `business`, `travel` (+ `general-idioms` for idioms).
- About 15 items per topic **per language** (English and Hebrew), plus about 10 idioms (topic "Idioms") per language.
- Every English item has a **Hebrew translation** and an **English explanation**. Every Hebrew item has an **English
  translation** and a **Hebrew explanation**. Synonyms where natural; 1–2 hints per item (natural usage sentences in
  the item's language). `multiple_meanings` is set where a word truly has several meanings, with one translation and
  one explanation entry per meaning. Every item has its translation in
  `translation_meaning_<code>`; idioms also put their equivalent expression in the other language, when one exists, in
  `translation_parallel_<code>`, and the word-for-word translation in `translation_literal_<code>` (`=parallel` when it
  is the same as the parallel, D-026).
- ⚠️ **The owner reviews the Hebrew and English content before it is seeded into production.**

### 8.5 Private content repository and data flow
```
 MyVocab-Content  (PRIVATE GitHub repo)
   ├─ README.md                       how to use this repo (written by the agent)
   ├─ starter.csv                     the starter set
   ├─ imports/YYYY-MM-DD-<name>.csv   batches you import
   └─ snapshots/vocabulary-YYYY-MM-DD.csv   exports of the live vocabulary (content only, no user data)
        │  git clone / pull, on the owner's computer
        ▼
 Owner's computer:  GithubProjects\
                      ├─ MyVocab\           (public code repo)
                      └─ MyVocab-Content\   (private content repo)
        │
        ├─ A) Admin → Import: upload a CSV in the browser → dry run → Commit ─┐
        │                                                                     ├──▶ D1 (the live database)
        └─ B) pnpm db:seed --file ..\MyVocab-Content\starter.csv [--remote] ──┘
                (run in MyVocab; local D1 by default, production with --remote via the owner's Cloudflare login)

 Snapshots:  D1 ──▶ pnpm db:export --content-only ──▶ ..\MyVocab-Content\snapshots\vocabulary-<date>.csv ──▶ git commit (private)
```
- **The app never reads from GitHub.** At runtime it reads only from D1.
- **D1 is the live copy.** Admin-panel edits happen in D1. Imports only add (§8.3), so editing a row in a CSV and
  re-importing does not change existing data. Snapshots capture the live state back into the private repo.
- **Local development**: `pnpm db:seed` (no `--file`) loads `$CONTENT_DIR/starter.csv` if it exists
  (`CONTENT_DIR` defaults to `../MyVocab-Content`). Otherwise it loads the public repo's synthetic
  `seed/sample.csv` (about 10 made-up rows, clearly fake, e.g. "sample-word-1").
- **CI never sees real vocabulary**: GitHub Actions use only `seed/sample.csv` and test fixtures.
- **Guardrails in the public repo**: `.gitignore` excludes `AGENT_PROMPT.md` (local only), `exports/`, `*.export.*`,
  `content/`, and every `seed/*.csv` except `seed/sample.csv`. A CI step (`check:no-vocabulary`) fails the build if any `.csv`, `.sql` or export artifact
  other than the allow-listed fixtures is committed, or if `seed/sample.csv` exceeds 20 rows.
- **The agent** creates `..\MyVocab-Content\` locally with its README and starter set. The owner creates the private
  GitHub repo and pushes it (or explicitly approves the agent doing so with `gh repo create --private`).

### 8.6 Database export (`pnpm db:export`)
Runs **on the owner's computer** (requires `wrangler login` to the owner's Cloudflare account). **Never** in GitHub
Actions (in a public repo, Actions logs and artifacts can be visible to others) and never through a public service.

| Command | Output |
|---|---|
| `pnpm db:export` | Full export of production D1 → `exports/myvocab-export-<YYYY-MM-DD-HHmm>/` (gitignored) + a `.zip` of it |
| `pnpm db:export --local` | The same, from the local development D1 |
| `pnpm db:export --content-only [--out <path>]` | Only the vocabulary CSV (no users, known lists, audit or settings). Default `--out` = `$CONTENT_DIR/snapshots/vocabulary-<YYYY-MM-DD>.csv` |

**Full export folder contents**
```
myvocab-export-2026-11-16-1430/
├─ README.md            what each file is, table descriptions, relations, how to load into another DB
├─ manifest.json        { exportedAt, appVersion, schemaVersion (last migration), tables: { name: rowCount } }
├─ sqlite/
│  ├─ schema.sql        CREATE TABLE / INDEX statements (SQLite dialect)
│  └─ data.sql          INSERT statements (from `wrangler d1 export`)
├─ json/
│  ├─ languages.json    one file per table: an array of row objects, ISO-8601 timestamps added next to epoch ms
│  ├─ items.json  …     (every table, including Better Auth tables, user_known_items, app_settings, audit_log);
│  │                    the item list columns are written as real JSON arrays/objects (the §8.1 shape), not strings
└─ csv/
   └─ vocabulary.csv    import-ready vocabulary (§8.3 format, round-trip guaranteed)
```
- `json/` is **database-agnostic**: any target (PostgreSQL, MySQL, MongoDB, …) can load it with a simple script.
  The export README includes a table → columns → types → foreign keys reference and a worked example for
  PostgreSQL (create tables, with the lists as `jsonb`, and load the JSON with a short Node script).
- `sqlite/` restores into any SQLite or D1 database as-is (`sqlite3 new.db < schema.sql && sqlite3 new.db < data.sql`,
  or `wrangler d1 execute <db> --file`).
- The full export contains **personal data** (user emails). The command prints a warning and never writes the full
  export into the content repo. Only `--content-only` output is meant to be committed there.
- The `README.md` of the code repo has a dedicated **"Export & migrate your data"** section with step-by-step
  instructions (prerequisites, commands, output explanation, loading into SQLite, loading into PostgreSQL, taking a
  vocabulary snapshot into the private repo, and restoring a snapshot with `pnpm db:seed --file`).

---

## 9. UX and visual design

### 9.1 Design tokens (dark theme only)
| Token | Value | Use |
|---|---|---|
The look follows the owner's mockup (D-017): a deep navy-violet night, glassy cards with a violet glow, and
glossy, glowing pressable buttons.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E0B1A` | Page background, with a soft violet radial glow at the top |
| `--surface` | `#19142E` | Cards, panels |
| `--surface-2` | `#241D40` | Inputs, secondary panels, chips, the multiple-meanings badge |
| `--border` | `#3A2F63` | Borders, dividers |
| `--text` | `#F1EEFB` | Primary text, user-selected values |
| `--text-muted` | `#A79FC6` | Secondary text, button captions, hints and synonyms |
| `--accent` | `#9B82FF` (button gradient `#8B6CFF → #6A3EF5`) | Primary actions, links, focus ring, selected-field outline, the card glow |
| `--know` | `#2BD46A → #16A34A` | Know pill (white text) |
| `--again` | `#F8A920 → #C96A05` | Know · ask again pill (amber, white text; FR-L27a) |
| `--dontknow` | `#FB4D6D → #E11D48` | Don't know pill (white text), destructive actions |
| `--hint` | `#FACC15` icon on `#4A3718 → #30230E` | Hints round button |
| `--round` | `#3E2D7E → #251A50` | Stop, Next and Flip round buttons (white icon) |
| `--stop` | `#2E2650` | Secondary actions (e.g. Home) |
| `--card-glow` | `0 0 0 1px #6D4CFF66, 0 0 32px #6D4CFF40, 0 20px 50px #0009` | Flip card edge glow + elevation |

- Every button color has a `--*-ledge` variant (a darker shade for the 3D ledge) and a `--*-glow` (a soft colored
  halo, about 45% opacity).
- Text/background combinations must meet **WCAG AA** contrast. White on the Know pill is used only as large bold text
  (≥ 20px bold); icons meet 3:1.
- Radius 28px (flip card), 18px (other cards), pill/circle for loop buttons, 14px for other buttons, 12px (inputs).
  Spacing on a 4px scale.

### 9.2 Pressable-ledge 3D buttons
Buttons keep the pressable ledge, now glossy: a top-to-bottom gradient, a thin light top edge, the ledge underneath
and a colored glow around. The loop uses two shapes:
- **Pills** (the three answers, FR-L27a, D-030): icon (✓ / ✕) + label inside ("I know it", "I know it", "I don't
  know"). On phones the three pills share the row and carry the label only. Each has a small italic muted caption
  under it ("Don't show again", "Show again in future", "Show again soon"), which may wrap onto two lines on a
  phone. For guests the green pill is locked: a darker green (dimmed, not grey), disabled, with a small yellow padlock
  (no background) on its top-left edge, shown on phones too where the pills hide their icons (D-042).
- **Round buttons** (Stop, Back, Next; Flip on the card): an icon in a circle (56px mobile, 64px desktop) with an
  italic muted caption underneath ("Stop", "Back", "Next"). (No Hints button since D-047: hints are on the card.)
Disabled buttons lose glow and ledge and look muted. Base mechanics:
```css
.btn3d {
  background: var(--c);
  box-shadow: 0 6px 0 var(--c-ledge);
  transform: translateY(0);
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.btn3d:active:not(:disabled) {
  transform: translateY(6px);
  box-shadow: 0 0 0 var(--c-ledge);
}
.btn3d:disabled { opacity: .45; box-shadow: none; transform: translateY(6px); cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .btn3d { transition: none; } }
```
- Keyboard focus: a 2px `--accent` outline with offset. Minimum touch target 48×48px.

### 9.3 The flip card (look)
- A glassy card: a translucent violet gradient over `--surface`, a 1px violet border with `--card-glow`, radius 28px,
  and a subtle top highlight. Generous padding (24px mobile, 40px desktop).
- **Front**: a pill chip at the top left ("EN → HE · WORDS", uppercase, violet text on `--surface-2`); the item text
  centered, large and bold; under it, when applicable, a
  small pill badge "◆ Multiple meanings" (`--surface-2` background, `--accent` text). After Hints: a thin divider,
  then the hints as a muted list and a "Synonyms: …" line (or "Hint is not available").
- **Back**: for a translation, centered sections, each under a small uppercase headline (D-024, D-025): the main
  answer, large and bold ("Parallel", or "Meaning" when there is no parallel); under a parallel, **"Meaning"** in
  `--text`, semibold, a size below the answer; then **"Literally"** in `--text-muted` at the hints' size, the least
  emphasized. When the literal is the parallel (D-026), the main headline reads "Parallel (also literally)" and the
  Literally section is left out. Two or more entries in a section are numbered ("1.", "2."). For the same language: the "Explanation"
  chip and the explanation lines (numbered when there are two or more, smaller when long). Then a thin divider;
  then
  **Hints** as a muted list and a "Synonyms: …" line (or "Hint is not available").
- A round **Flip** button (↻) sits in the bottom-right corner of **both** faces, so the card can be turned back from
  the answer side too.
- **Size** (owner request, 2026-11-18): in the loop the card has a **fixed height** that never changes when it flips,
  shows hints, or moves to the next card: on phones it fills the space between the header and the buttons; on desktop
  it is `clamp(420px, 58vh, 600px)`. Both faces share one grid cell. A face with more content than fits scrolls
  inside the card.
- **Placement**: the item (front) and the answer (back) sit in the **upper part** of the card (a block of at least
  46% of its height, content centered in it) and never move; the meaning, the literal translation, hints and synonyms appear below
  it, in the space kept for them.

```
FRONT, after Hints               BACK, after Flip (EN → HE)
┌────────────────────────────┐   ┌────────────────────────────┐
│ EN → HE · Words            │   │ Translation                │
│           Date             │   │           תאריך            │
│   ◆ Multiple meanings      │   │            תמר             │
│ ────────────────────────── │   │ ────────────────────────── │
│ • What is the date today?  │   │ • What is the date today?  │
│ • Dates grow on palm trees.│   │ • Dates grow on palm trees.│
└────────────────────────────┘   └────────────────────────────┘
```

### 9.4 Flip animation and interaction
```css
.flip-card        { perspective: 1200px; }
.flip-card__inner { display: grid; transform-style: preserve-3d;
                    transition: transform 450ms cubic-bezier(.2,.7,.2,1); }
.flip-card.is-flipped .flip-card__inner { transform: rotateY(180deg); }
.flip-card__face  { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.flip-card__back  { transform: rotateY(180deg); }
@media (prefers-reduced-motion: reduce) {
  .flip-card__inner { transition: none; }      /* swap faces with a 150ms opacity crossfade instead */
}
```
- Triggers: the round **Flip** button on the card and the **Space**/**F** keys (a tap on the card does nothing, D-047). It toggles
  both ways without limit.
- Rapid repeated flips simply reverse the animation (no queued spins).
- RTL: the rotation direction stays the same; only text direction changes per face.
- **Hints**: the live cover's dots scatter and fade while the text sharpens (none with reduced motion, D-047).
- **Accessibility**: the round Flip button on the visible face is the keyboard control (a real `button` named
  "Flip"); it is the only pointer control for flipping. The hidden face gets `inert` +
  `aria-hidden="true"`, so only the visible face's Flip button is focusable. An `aria-live="polite"` region announces
  "Showing answer" / "Showing front" / "Hints shown".
- After **Don't know** on the front, the same flip animation plays automatically.
- **Next** / **Know**: the next card enters front side up, rising in (≈ 260ms: from slightly lower, smaller and
  transparent to full size; a plain 150ms fade with reduced motion).
- **Know animation** (owner idea, 2026-11-18): a decorative copy of the card **crumples like paper** and is **sucked
  along a curve into the "N known" counter** in the header, which pops (bigger, green) as it lands. After a quick
  green ✓ glow the card folds into ~10 triangular facets, each tilting its own way in 3D with its own light or shadow,
  like real crumpled paper; the wad shrinks and turns as it flies. About 0.8s in total, and the next card rises in at
  the same time, so Know never feels slow. Reduced motion: no crumple. (A first, simpler "squash into a ball"
  version was tried and dropped in favour of this one.) Know · ask again plays the same animation, with an amber
  glow. Back has no reverse crumple: the earlier card simply rises in,
  front side up. Don't know keeps the flip. A swipe slides the card out sideways (FR-L29b).

### 9.5 Start card (look)
- Five fields stacked on mobile (2-column grid on desktop), each with a label and either a select (languages,
  topic) or a segmented control (amount). On desktop, Amount sits next to Topic (D-046).
- **Default style** (value unchanged): looks chosen (bright value text, filled selected option), subtle solid
  outline, a small violet "Default" tag on the right. **Selected style** (user changed it): the same, with a solid
  `--accent` outline and no tag.
- **Guest amount**: a single "5" pill with a lock icon; tapping it shows the "sign-in" toast (FR-L6).
- The "Same language: the back shows an explanation" note (FR-L5) appears under the language fields when they match.
- The card's heading is **"Configure your session"**.
- The large **Start** button (accent color, pressable ledge): on desktop it sits under the fields, with the "N new
  cards available" line just above it; on mobile it sits above the card, right under the hero text (FR-L1). The
  security check (if any) and error messages appear next to it.

### 9.6 Typography
- **Rubik** (Latin, Hebrew, Arabic and Cyrillic), self-hosted via `@fontsource/rubik` (no external font requests;
  keeps the CSP strict). The per-weight files give each subset a `unicode-range`, so a browser downloads only the
  subsets a page shows (D-027).
- Item text (front): `clamp(2rem, 6vw, 3.5rem)`, weight 600. Answer lines (back): `clamp(1.5rem, 4.5vw, 2.25rem)`;
  long explanation lines step down to `1.125rem–1.25rem`. Hints, synonyms and the literal translation: 1.125rem on every screen (raised from 1rem on phones at the owner's request), `--text-muted`.
- Every piece of content text gets `dir` and `lang` from its language (`he` → `rtl`). The UI chrome stays LTR English.

### 9.7 Layouts
- **Landing**: header (logo "MyVocab", sign-in / avatar, an "Admin" link for admins as a full-page navigation); hero
  ("Learn words until they stick"); How it works (1. Pick languages and a topic, or just press Start ·
  2. Use Hints or Flip, then mark what you know · 3. Repeat until nothing is left), then "Buttons" (the three answer
  buttons as small coloured icons, each with one line on what it does); Start card; footer (Privacy,
  GitHub). **The landing page never shows real vocabulary** (illustrations use made-up or generic examples).
- **Loop header**: the MyVocab logo mark (two stacked cards) and the progress `Cycle 1 • Card 2/10 • 1 known` on the
  left; on the right, on desktop a "⌨ Keyboard shortcuts" link that opens a small popover listing the shortcuts, and
  "← Home" (asks before stopping the loop, FR-L30a).
- **Loop buttons**: on desktop, one row under the card, in this order: `Stop · Back · I know it (green) ·
  I know it (amber) · I don't know · Next` (round, round, pill, pill, pill, round; the green pill locked for
  guests); after I don't know the row stays the same, the answers disabled and Next pumping (D-031). Flip is
  on the card itself.
- **Loop (mobile, 360–767px)**: the flip card fills the space above; the buttons form a **sticky bottom bar** in the
  thumb zone, in two rows: the three answer pills on top (**I know it · I know it · I don't know**, three equal pills
  with their captions), and the round
  `Stop · Back · Next` (with captions) below, so the two main actions stay big. After Don't know, the
  layout stays: the answer pills disable and the round Next pumps (FR-L28, FR-L29a, D-031).
- **Loop (desktop ≥ 768px)**: a centered column of about 1100px; the card is wide (≈ 2.3 : 1) and the pills carry
  their labels.
- **Cycle break / Summary**: a glassy card with large numbers and the 3D buttons.
- **Toasts**: bottom-center on mobile (above the button bar), top-right on desktop (below the header, clear of the
  loop buttons); auto-dismiss; `aria-live="polite"`.
- **Admin**: a left sidebar (collapses into a top menu on mobile); content max width about 1100px.

### 9.8 Microcopy (centralized in `apps/web/src/strings.ts`)
All UI strings live in one module, keyed (e.g. `loop.know = "Know"`, `loop.hints = "Hints"`, `loop.flip = "Flip"`,
`card.multipleMeanings = "Multiple meanings"`, `setup.sameLanguageNote = "Same language: the back shows an
explanation"`, `setup.guestAmountToast = "Sign-in to choose more cards per session."`), so a
future i18n library can replace it without touching components.

---

## 10. Architecture

### 10.1 Overview
```
Browser (React SPA)
   │  same origin: https://myvocab.<account>.workers.dev
   ▼
Cloudflare edge ── Cloudflare Access (only on /admin*, /api/admin/*)
   ▼
Cloudflare Worker "myvocab"
   ├─ static assets (apps/web/dist, SPA fallback)
   ├─ /api/*  → Hono app
   │     routes → services → repository interfaces → Drizzle/D1 implementations
   ├─ Cron Trigger (hourly) → Trash purge + old usage counters cleanup
   └─ bindings: DB (D1), RATE_LIMITER (Workers Rate Limiting, burst limits), ASSETS
   ▼
Cloudflare D1 "myvocab-prod" (SQLite; no public endpoint)

Turnstile siteverify (Cloudflare) ◀── guest POST /loops token check
```

### 10.2 Technology
| Concern | Choice |
|---|---|
| Package manager / monorepo | pnpm workspaces; Node current LTS |
| Language | TypeScript `strict` everywhere |
| Frontend | React 19, Vite, React Router (SPA/library mode), TanStack Query, Tailwind CSS v4 |
| Backend | Hono on Cloudflare Workers (static assets + `run_worker_first: ["/api/*"]`) |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations applied with `wrangler d1 migrations apply`) |
| Validation / contracts | Zod (shared in `packages/contracts`) |
| Auth | Better Auth (Google provider, admin plugin) with the Drizzle/D1 adapter |
| Bot check | Cloudflare Turnstile (invisible/managed widget; server-side siteverify) |
| JWT (Cloudflare Access) | `jose` (RS256 against the team JWKS) |
| CSV | An RFC 4180-compliant parser/serializer (e.g. `papaparse`), wrapped behind an interface in core |
| Scripts | `tsx` Node scripts for seed/export (cross-platform) driving `wrangler` |
| Tests | Vitest, `@cloudflare/vitest-pool-workers`, Playwright, Testing Library |
| Lint / format | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier |

### 10.3 Repository layout (public code repo)
```
MyVocab/
├─ apps/
│  ├─ web/                        React SPA
│  │  └─ src/
│  │     ├─ routes/               route modules (landing, loop, known, account, privacy, admin/*)
│  │     ├─ features/
│  │     │  ├─ setup/             start card (defaults, default/selected styling, guest lock + toast, Turnstile)
│  │     │  ├─ loop/              loop screen, FlipCard, useLoop (wraps core reducer), useSwipe, known queue
│  │     │  ├─ known/             My known words
│  │     │  └─ admin/             lazy-loaded admin feature modules + ListEditor
│  │     ├─ components/           Button3D, FlipCard, Card, Panel, Toast, Dialog, Select, Segmented…
│  │     ├─ lib/                  api client (typed via contracts), auth hooks, storage helpers
│  │     ├─ styles/               tokens.css, base.css
│  │     └─ strings.ts
│  └─ api/                        Hono Worker
│     ├─ src/
│     │  ├─ index.ts              Worker entry: fetch (Hono) + scheduled (cron)
│     │  ├─ app.ts                Hono app assembly
│     │  ├─ config.ts             Zod-validated env
│     │  ├─ container.ts          per-request DI wiring
│     │  ├─ auth/                 Better Auth instance factory, Access JWT verifier, Turnstile verifier
│     │  ├─ middleware/           session, requireUser, requireAdmin, rateLimit, securityHeaders, noindex, errors
│     │  ├─ routes/               public.ts, me.ts, admin/*.ts
│     │  ├─ services/             LoopService, KnownItemsService, ItemAdminService, CsvImportService,
│     │  │                        TopicService, UserAdminService, SettingsService, AuditService, TrashService,
│     │  │                        UsageLimitService
│     │  ├─ repositories/
│     │  │  ├─ interfaces/        ItemRepository, KnownItemRepository, TopicRepository, UsageRepository, …
│     │  │  └─ d1/                Drizzle implementations
│     │  └─ db/schema.ts
│     ├─ migrations/              generated SQL
│     ├─ scripts/                 seed.ts, export.ts (owner-run, local only)
│     └─ wrangler.jsonc
├─ packages/
│  ├─ core/                       pure domain logic, zero runtime deps
│  │  └─ src/ loop/ (reducer, shuffle) · card/ (answer strategies + card builder) · item/ (item validation rules,
│  │          shared by the editor, the API and CSV) · text/ (normalize, script check) · csv/ (row schema, merge
│  │          planner, serializer) · setup/ (defaults resolution)
│  └─ contracts/                  Zod request/response schemas + inferred types
├─ seed/sample.csv                SYNTHETIC rows only (≤ 20), for tests/CI
├─ scripts/check-no-vocabulary.ts CI guard (§8.5)
├─ .github/ workflows/{ci.yml,deploy.yml,codeql.yml} · dependabot.yml
├─ PRD.md · README.md · .gitignore     (AGENT_PROMPT.md sits here locally but is git-ignored)
```

### 10.4 Software design principles
- **Single responsibility / layering**: routes only translate HTTP ↔ service calls (validate with Zod, map
  errors). Services hold business rules. Repositories hold data access. No SQL in routes or services.
- **Dependency inversion**: services depend on repository **interfaces**; `container.ts` builds concrete D1
  implementations per request from the Worker `env`. Tests can inject in-memory fakes.
- **Open/Closed: the back of the card is a strategy**:
  ```ts
  type AnswerKind = 'translation' | 'explanation';
  interface AnswerStrategy {
    kind: AnswerKind;
    appliesTo(src: LangCode, tgt: LangCode): boolean;      // translation: src !== tgt; explanation: src === tgt
    isPlayable(item: ItemData, tgt: LangCode): boolean;     // has ≥ 1 entry to show (FR-L40)
    answerLines(item: ItemData, tgt: LangCode): string[];   // translation[tgt] or explanation, in order
    numbered(lines: string[]): boolean;                     // explanation: true when 2+ lines
  }
  const answerStrategies: AnswerStrategy[] = [translationStrategy, explanationStrategy];
  function buildCard(item: ItemData, src: LangCode, tgt: LangCode, langs: LanguageInfo): CardView; // §12.1
  ```
  `buildCard` is used by `POST /loops` and by the admin preview. Adding another kind of back later means adding one
  strategy. The repository's selection query applies the same playability rule in SQL (§11.3); an integration test
  asserts that SQL and `isPlayable` agree on a fixture set.
- **One validation module for items** (`packages/core/item`): the same rules (no same-language translation, list
  limits, duplicates, required fields) run in the admin editor, the API (Zod schemas built from them) and the CSV
  importer.
- **Pure loop engine**: `loopReducer(state, action)` in `packages/core` with actions
  `KNOW | DONT_KNOW | TOGGLE_HINTS | FLIP | NEXT | BACK | CONTINUE | STOP` (`answerOf` derives a card's answer). State includes `phase` (`deciding |
  revealed | cycleBreak | finished | stopped`), `side` (`front | back`) and `hintsShown` (boolean, current card).
  `FLIP` only toggles `side`; `TOGGLE_HINTS` only flips `hintsShown` and is ignored unless `side = front`; neither changes
  grading. `DONT_KNOW` sets `side = back`. A new card always starts with `side = front` and `hintsShown = false`. An
  injected `rng` (seedable) is used for shuffles. The web app uses it via `useReducer`. It is fully unit-tested
  without a DOM.
- **Usage limits as a policy**: `UsageLimitService` (guest hourly loops per hashed IP, learner daily cards) behind an
  interface, with limits read from settings. `EntitlementService` composes it (future plans can raise limits).
- **Data-driven languages**: language code, names, `dir` and `script` come from the `languages` table. Adding a
  language means data + content only.
- **Configuration**:
  - *Static* (deploy-time): `config.ts` parses `env` with Zod at startup (fail fast). It asserts production
    invariants (Access configured, Turnstile secret present, no test routes).
  - *Runtime* (admin-editable): `app_settings` via `SettingsService` (typed keys + defaults, cached per request).
- **Future seams (interfaces only in v1)**:
  - `EntitlementService.canStartLoop(user, size)`: today it applies the guest/learner rules and usage limits. Later: plans/subscriptions.
  - `ContentGenerator.suggestItems(params)`: not implemented. Later, AI suggestions are saved as `draft` items for admin review.
- **Errors**: one error type hierarchy (`ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`,
  `RateLimitedError`, …) mapped to HTTP by the error middleware into `{ "error": { "code", "message", "details"? } }`.

---

## 11. Data model
SQLite (D1) via Drizzle. Timestamps are `INTEGER` unix epoch milliseconds. Foreign keys enforced.

### 11.1 Schema
```sql
-- Languages (data-driven)
CREATE TABLE languages (
  code         TEXT PRIMARY KEY,                       -- 'en', 'he'
  name         TEXT NOT NULL,                          -- 'English', 'Hebrew'
  native_name  TEXT NOT NULL,                          -- 'English', 'עברית'
  dir          TEXT NOT NULL CHECK (dir IN ('ltr','rtl')),
  script       TEXT NOT NULL,                          -- ISO 15924: 'Latn', 'Hebr' (mixed-script warnings)
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE topics (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- One row per word/expression. Its lists live inside the row as JSON (§11.2 rule 1).
CREATE TABLE items (
  id                 INTEGER PRIMARY KEY,
  lang               TEXT NOT NULL REFERENCES languages(code),   -- fixed after creation
  text               TEXT NOT NULL,
  normalized_text    TEXT NOT NULL,
  multiple_meanings  INTEGER NOT NULL DEFAULT 0 CHECK (multiple_meanings IN (0,1)),
  translation_parallel TEXT NOT NULL DEFAULT '{}', -- JSON object { "<lang>": ["…", …] }; never the item's own lang (D-024)
  translation_meaning  TEXT NOT NULL DEFAULT '{}', -- same shape: what it means (D-024); never own lang
  translation_literal  TEXT NOT NULL DEFAULT '{}', -- same shape: word for word (D-016, D-024), or ["=parallel"] (D-026); never own lang
  explanation        TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings, item's language
  synonyms           TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings, item's language
  hints              TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings, item's language
  status             TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  version            INTEGER NOT NULL DEFAULT 1,   -- optimistic concurrency for admin edits
  created_by         TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER,                      -- soft delete (Trash)
  deleted_by         TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  -- The same two CHECKs for each of translation_parallel, translation_meaning and translation_literal:
  CHECK (json_valid(translation_parallel) AND json_type(translation_parallel) = 'object'),
  CHECK (json_extract(translation_parallel, '$."' || lang || '"') IS NULL),  -- no translation into the item's own language
  CHECK (json_valid(explanation) AND json_type(explanation) = 'array'),
  CHECK (json_valid(synonyms)    AND json_type(synonyms)    = 'array'),
  CHECK (json_valid(hints)       AND json_type(hints)       = 'array')
);
CREATE UNIQUE INDEX ux_items_identity ON items(lang, normalized_text) WHERE deleted_at IS NULL;
CREATE INDEX ix_items_playable ON items(lang) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX ix_items_trash    ON items(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE item_topics (
  item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  topic_id  INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, topic_id)
) WITHOUT ROWID;
CREATE INDEX ix_item_topics_topic ON item_topics(topic_id, item_id);

-- Known memory: one row per user + item + direction. It hides the item only in that direction (D-028).
CREATE TABLE user_known_items (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  known_target    TEXT NOT NULL,                       -- the direction's target language (= lang: explanation)
  known_in_cycle  INTEGER NOT NULL CHECK (known_in_cycle >= 1),
  known_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id, known_target)
) WITHOUT ROWID;
CREATE INDEX ix_known_item ON user_known_items(item_id);   -- for the ON DELETE CASCADE from items (purge)

-- Usage counters for anti-scraping limits (hourly guest loops per hashed IP, daily learner cards)
CREATE TABLE usage_counters (
  subject      TEXT NOT NULL,                          -- 'ip:<HMAC-SHA256(ip, USAGE_HASH_SECRET)>' or 'user:<id>'
  period       TEXT NOT NULL,                          -- 'h:2026-11-16T14' (hour) or 'd:2026-11-16' (UTC day)
  count        INTEGER NOT NULL DEFAULT 0,             -- loops (guests) or cards served (learners)
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (subject, period)
) WITHOUT ROWID;
-- Raw IPs are never stored. Cron deletes periods older than 48 h. Deleting a user deletes their 'user:<id>' rows.

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,                           -- JSON
  updated_by  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at  INTEGER NOT NULL
);

-- Append-only audit log (no update/delete API)
CREATE TABLE audit_log (
  id             INTEGER PRIMARY KEY,
  actor_user_id  TEXT,                                 -- no FK: keep history even if the user is deleted
  actor_email    TEXT,
  action         TEXT NOT NULL,                        -- e.g. 'item.create', 'item.update', 'item.trash',
                                                       -- 'item.restore', 'item.purge', 'csv.import',
                                                       -- 'user.role_change', 'settings.update', 'limit.exceeded'
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  details        TEXT,                                 -- JSON: before/after, full snapshots
  created_at     INTEGER NOT NULL
);
CREATE INDEX ix_audit_time ON audit_log(created_at);

-- Better Auth tables: "user", session, account, verification (generated by Better Auth for Drizzle).
-- Admin plugin adds to "user": role ('user'|'admin', default 'user'), banned, ban_reason, ban_expires.
-- The role field MUST be configured as non-writable from client input (input: false).
```

### 11.2 Optimization rules (D1 free tier)
At the time of writing, the D1 free tier allows **5M rows read** and **100k rows written** per day, and **every index
adds one more "row written"** when an indexed value changes. Writes are the scarcest resource. The schema and code
follow these rules:
1. **One row per item.** Translations, explanation, synonyms and hints are JSON lists inside the item row:
   - loading a 10-card loop returns 10 rows; editing one hint writes 1 row;
   - importing 5,000 items writes about **25,000** rows (about 95,000 if every list entry were its own row, which is
     nearly the whole daily write allowance);
   - integrity comes from the shared item validation (Zod) and the CHECK constraints above; editing single entries
     stays easy in the UI (FR-A12).
2. **Cards are not stored.** A card is computed from the item and the chosen target language at loop time.
3. **Only the indexes the queries need** (listed in §11.1, nothing else):
   - partial indexes hold only matching rows (published and not deleted; or trashed), so they cost writes only for those;
   - `item_topics`, `user_known_items` and `usage_counters` are `WITHOUT ROWID`, so the primary key *is* the table
     (one write instead of two);
   - every child column used by `ON DELETE CASCADE` has an index (otherwise SQLite scans the whole child table for each
     deleted parent): `item_topics` via its primary key, `user_known_items.item_id` via `ix_known_item`;
   - if Drizzle/drizzle-kit can't express `WITHOUT ROWID` reliably (including when it rebuilds a table in a later
     migration), use normal tables and record it in the decisions log.
4. **Loop selection reads as little as possible** (§11.3): it uses `ix_items_playable`, starts from `item_topics`
   when a topic is chosen, checks playability on the candidate row itself (no extra lookups), and returns the
   chosen cards' data in the same query (no second round trip).
5. **No writes from blocked or unverified requests**: a guest's Turnstile token is verified before any D1 write;
   usage caps are checked before incrementing, so an over-limit request writes nothing; `limit.exceeded` is audited
   at most once per subject per period; burst limits use the Workers Rate Limiting binding, not D1.
6. **No per-request writes**: Better Auth refreshes a session at most once a day (`updateAge` ≥ 1 day); "last seen"
   comes from that refresh. Known marks are batched (FR-L51).
7. **Optimistic concurrency**: every item update is `UPDATE … WHERE id = ? AND version = ?` with `version = version + 1`.
   If no row changed → 409 `CONFLICT`. The audit insert in the same batch is conditional on the update having applied
   (e.g. `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM items WHERE id = ? AND version = :newVersion)`).

Rough write costs: a Know mark = 2 rows (table + `ix_known_item`); a learner loop start = 1 (daily counter); a guest
loop start = 1 (hourly counter); an item edit = 1 (+1 per changed indexed value). This leaves room for tens of
thousands of Know marks per day on the free tier.

### 11.3 Loop selection query (shape)
```sql
-- All topics (no topic filter). The service inserts the answer condition from the AnswerStrategy (§10.4):
--   different languages:  json_array_length(i.translation_meaning, '$."' || :tgt || '"') > 0   (D-025)
--   same language:        json_array_length(i.explanation) > 0
SELECT i.id, i.text, i.lang, i.multiple_meanings, i.translation_parallel, i.translation_meaning,
       i.translation_literal, i.explanation, i.synonyms, i.hints
FROM items i
WHERE i.lang = :src
  AND i.status = 'published' AND i.deleted_at IS NULL          -- served by ix_items_playable
  AND <answer condition>
  AND (:userId IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_known_items k
        WHERE k.user_id = :userId AND k.item_id = i.id AND k.known_target = :tgt))  -- D-028
ORDER BY RANDOM()
LIMIT :n;

-- With a topic, start from its links so only that topic's items are read:
--   FROM item_topics ic JOIN items i ON i.id = ic.item_id
--   WHERE ic.topic_id = :topicId AND <the same conditions>
```
- `GET /loops/available` uses the same conditions with `COUNT(*)`.
- `ORDER BY RANDOM()` is fine at the expected scale (thousands of items per language). **Scaling path** (documented,
  not built): an indexed `rand_key REAL` column, selecting `WHERE rand_key >= random()` with wrap-around.
- **Known list and Trash**: known-list queries join `items` and filter `deleted_at IS NULL`, so trashed items are
  hidden and reappear on restore. Purge cascades the known rows away.

---

## 12. API specification
- Base path `/api`. JSON in and out (except CSV upload: `multipart/form-data`).
- Every input is validated with the Zod schemas from `packages/contracts`. Unknown fields are rejected (`.strict()`).
- Errors: `{ "error": { "code": "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "BOT_CHECK_FAILED" | "INTERNAL", "message": string, "details"?: unknown } }`.
- Mutations require `Content-Type: application/json` (or multipart for import), and an `Origin` matching `APP_URL`.
- Every `/api/*` response carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` (card responses must
  never be cached by shared caches).

### 12.1 Public
| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ ok: true, version }` |
| GET | `/meta` | `{ languages[], topics[], defaults: { sourceLang, targetLang, topicId, size }, sizeOptions, guest: { enabled, loopSize }, undoWindowSeconds, maintenance, turnstileSiteKey }` |
| GET | `/stats/registered-users` | `{ registeredUsers: number }`: accounts that are not admins and not banned; kept 30 minutes per Worker instance (D-036) |
| GET | `/loops/available?source&target&topicId&sample` | `{ available: number }` (excludes known items if signed in; guests always count the Sample set, admins with `sample=true`, D-038) |
| POST | `/loops` | Body `{ source, target, topicId: number \| null, size?, sample?, turnstileToken? }` (guests always get the Sample set; admins with `sample: true`, D-038) → `{ requested, returned, cards: CardView[] }` |

```ts
type Dir = 'ltr' | 'rtl';
type CardView = {
  itemId: number;
  direction: { source: LangCode; target: LangCode };
  multipleMeanings: boolean;                              // shows the badge on the front
  front: { text: string; lang: LangCode; dir: Dir };      // the item text
  answer: {                                               // composed by the server (§6.3)
    kind: 'translation' | 'explanation';
    main: 'parallel' | 'meaning' | 'explanation';         // what `lines` are (D-024)
    lines: string[];                                      // parallel[target], else meaning[target]; or explanation
    numbered: boolean;                                    // explanation with 2+ lines
    meaning: string[];                                    // meaning[target] under a parallel, else []
    literal: string[];                                    // literal[target] for a translation, else [] (D-016)
    literalSameAsParallel: boolean;                       // literal[target] is the "=parallel" marker (D-026)
    lang: LangCode; dir: Dir;
  };
  hints: string[];                                        // item language, in order
  synonyms: string[];                                     // item language, in order
  extrasLang: { lang: LangCode; dir: Dir };               // language of hints + synonyms (= the item's language)
};
```
**`POST /loops` rules**
- **Guest** (no session): `turnstileToken` is **required** and verified server-side (Turnstile siteverify, single use,
  hostname check) **before any D1 write**. Failure → 403 `BOT_CHECK_FAILED`. `size` is **ignored** and forced to
  `guests.loopSize` (5). Counted against `guests.loopsPerHour` per hashed IP. Exceeding it → 429 `RATE_LIMITED` with a
  "sign in or try later" message.
- **Learner**: `size` must be one of `loop.sizeOptions` (≤ `loop.maxSize`). The returned card count is added to
  `users.cardsPerDay` for the current UTC day. If the request would exceed the cap → 429 with the remaining allowance.
  Admins are exempt.
- Common: languages active; topic active (or null); `guests.enabled` / maintenance respected; `EntitlementService`
  consulted. Over-limit requests write nothing; the first one per subject and period writes a `limit.exceeded` audit
  entry (subject hash/user id only) (§11.2 rule 5).

### 12.2 Auth and current user
| Method | Path | Description |
|---|---|---|
| * | `/auth/*` | Better Auth handler (Google sign-in, callback, sign-out, session) |
| GET | `/me` | `{ user: { id, name, email, image, role, isOwner } \| null }` |
| DELETE | `/me` | Delete own account (body `{ confirm: "DELETE" }`) |

### 12.3 Learner (requires a session)
| Method | Path | Description |
|---|---|---|
| POST | `/me/known` | Body `{ items: { itemId, target, cycle }[] }` (≤ 100). Idempotent upsert per item + target, keeps the earliest `known_at` |
| DELETE | `/me/known/:itemId?target=` | Undo one direction; without `target`, every direction of the item (older clients, D-028) |
| POST | `/me/known/restore` | Body `{ marks: { itemId, target }[] }` (≤ 500), **or** `{ filter: { q?, lang?, target?, topicId? } }`, **or** `{ itemIds: number[] }` (every direction, older clients) → `{ restored }` |
| GET | `/me/known?q&lang&target&topicId&sort&cursor` | Paginated known items, one row per item + direction |

`user_id` is **always** taken from the session, never from the request.

### 12.4 Admin (requires an admin role **and** a valid Cloudflare Access JWT)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Dashboard counts |
| GET / POST | `/admin/items` | List (filters, pagination) / create `{ lang, text, multipleMeanings?, status?, topicIds?, translation?, explanation?, synonyms?, hints? }` |
| GET | `/admin/items/:id` | The full item (§8.1 shape) + `version` + `topicIds` + warnings |
| PATCH | `/admin/items/:id` | `{ version, text?, multipleMeanings?, status?, topicIds?, translation?, explanation?, synonyms?, hints? }`. A list field replaces that whole list (`translation` replaces the whole object). `lang` is not accepted. → the updated item with its new `version`; 409 `CONFLICT` on a stale `version` |
| DELETE | `/admin/items/:id` | Soft delete → Trash |
| GET | `/admin/items/:id/preview` | `CardView[]` for every direction (the same `buildCard` as `POST /loops`) |
| GET | `/admin/trash` | Trashed items, with purge times |
| POST | `/admin/trash/:id/restore` | Restore (409 if a duplicate exists) |
| DELETE | `/admin/trash/:id` | Purge now (body `{ confirm: "PURGE" }`) |
| GET / POST / PATCH / DELETE | `/admin/topics[/:id]` | CRUD (delete blocked if in use) |
| PUT | `/admin/topics/order` | `{ ids: number[] }` |
| GET / POST / PATCH | `/admin/languages[/:code]` | List / add (starts inactive) / toggle `isActive` or rename (D-027) |
| GET | `/admin/users?q&cursor` | List users |
| PATCH | `/admin/users/:id` | `{ role?: 'user' \| 'admin', banned?: boolean, banReason?: string }` (rules in FR-A41/42) |
| GET / PUT | `/admin/settings` | Typed settings object |
| GET | `/admin/import/template` | CSV template download (header + 2 illustrative rows) |
| POST | `/admin/import?dryRun=true\|false&createMissingTopics=true\|false` | multipart `file` → report |
| GET | `/admin/audit?actor&action&entityType&from&to&cursor` | Audit entries |

Every admin mutation writes an `audit_log` row in the **same D1 batch** as the change.
There is intentionally **no** HTTP endpoint for exporting the database (export is a local owner command, §8.6).

### 12.5 Test-only (exists only when `ENVIRONMENT=test`)
| Method | Path | Description |
|---|---|---|
| POST | `/test/session` | Create a session for a seeded test user `{ role }` (for Playwright). **Never registered in production**; startup asserts this |

In test, Turnstile uses Cloudflare's documented **test keys** (always-pass / always-fail) to exercise both paths.

---

## 13. Authentication and roles

### 13.1 Sign-in
- **Google only** via Better Auth. The session is in an `HttpOnly; Secure; SameSite=Lax` cookie, DB-backed (the `session` table).
  No tokens in `localStorage`. Session refresh at most once a day (§11.2 rule 6).
- Better Auth must be instantiated per request inside the Worker (bindings come from `env`).
- If Better Auth cannot run reliably on Workers + D1, the fallback is Arctic (Google OAuth) + our own `session` table
  with the same cookie semantics. Record the choice in the decisions log.

### 13.2 Who is an admin
- `user.role` ∈ {`user`, `admin`}; default `user`. It is **never** writable from client input.
- **Owners**: emails listed in the `ADMIN_EMAILS` Worker secret (comma-separated). After a successful Google sign-in
  with a **verified** email in that list, the server sets `role = admin`. Owners can't be demoted in the UI.
- **Other admins**: promoted or demoted by an admin in Admin → Users (rules: no self-demotion, last admin protected).
- The UI shows the "Admin" link and admin routes only when `/api/me` says `role = admin`. **This is cosmetic.**

### 13.3 Lock 1: server-side role check
- The `requireAdmin` middleware is mounted on the whole `/api/admin` router. It loads the session from the DB:
  no session → 401; `role ≠ admin` or banned → 403.

### 13.4 Lock 2: Cloudflare Access (mandatory)
- A Cloudflare Zero Trust **Access application** (free for ≤ 50 users) covers the paths `/admin*` and `/api/admin/*`
  on the app hostname, with a policy that allows only the admin emails, using the **one-time PIN** login method.
- **Defense in depth inside the Worker**: `requireAdmin` also verifies the `Cf-Access-Jwt-Assertion` header:
  - The RS256 signature against `https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` (JWKS cached), `aud` contains
    `CF_ACCESS_AUD`, `iss` matches the team domain, and the token isn't expired.
  - The Access JWT `email` must equal the session user's email (case-insensitive).
  - If anything is missing or invalid → 403, even with an admin session (**fails closed** if Access is misconfigured).
- The "Admin" link uses **full-page navigation** (`<a href="/admin">`, not client-side routing), so Cloudflare Access
  can intercept it. The admin API client treats an Access redirect / non-JSON 401/403 as "Access session expired" and
  reloads `/admin`.
- `ENVIRONMENT=development|test`: the Access check is skipped (local only). `ENVIRONMENT=production`: startup **asserts**
  that `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set, and the check cannot be disabled.

---

## 14. Security and vocabulary privacy

### 14.1 Every path to the database and how it is closed
1. **Direct connection: impossible.** D1 has no public address, connection string, port or password. It is reachable
   only through the Worker binding and through the owner's Cloudflare account (dashboard/API/wrangler). The browser
   never talks to the database.
2. **Stolen keys:**
   - The Cloudflare and GitHub accounts **require 2FA** (authenticator app or security key), with as few members as possible.
   - The Cloudflare API token used by CI has the **narrowest scope** (this account's Workers Scripts + this D1 only). It
     is stored only in the GitHub **`production` Environment** (deployment branch `main`, owner as required reviewer)
     and rotated periodically.
   - **Public repo hardening**: a ruleset on `main` (PR required, CI must pass, no force-push or deletion); **CodeQL**;
     **secret scanning with push protection**; **Dependabot** alerts and version updates; GitHub Actions pinned to a
     commit SHA with a minimal `permissions:` block; fork PRs never receive secrets; `pull_request_target` with a PR
     checkout is never used; deploys require write access + approval.
   - No secrets, real emails, PII or vocabulary in the public repo (`ADMIN_EMAILS` is a Worker secret; `.dev.vars` is
     gitignored; `.dev.vars.example` holds placeholders). Migrations run only from the approved deploy job.
3. **API abuse:**
   - Guest endpoints are **read-only** (apart from the usage counter, written only after Turnstile passes).
   - `/api/me/*` writes only the caller's own rows. `user_id` comes from the session, never from the request (no IDOR).
   - No endpoint lets a user change their own role. The Better Auth `role` field is `input: false`.
   - Content writes happen only on `/api/admin/*`, behind **both** locks. There is no export endpoint.
4. **A compromised admin or an honest mistake:** no bulk "delete all" endpoints; CSV import is append-only; item
   deletes go to a 1-day Trash; every item change is audited with before/after; the audit log is append-only.
5. **Recovery:** D1 **Time Travel** point-in-time restore (7-day window on the free plan) + vocabulary snapshots in the
   private content repo + owner-run full exports. The implementation must confirm Time Travel is still free on the
   Workers Free plan; if not, **flag it to the owner** and do not enable anything paid. The README documents the
   restore procedure.

### 14.2 Vocabulary privacy: the vocabulary never appears in a public service
| Where it could leak | Control |
|---|---|
| Public GitHub code repo | No vocabulary files at all. Real content lives only in the private `MyVocab-Content` repo and in D1. `seed/sample.csv` contains only synthetic rows. `.gitignore` rules + the `check:no-vocabulary` CI guard (§8.5). The landing page, tests and screenshots use made-up examples only. Docs (including this PRD) may use a handful of common dictionary words as illustrations, never content copied from the real set |
| GitHub Actions logs/artifacts (visible in public repos) | Actions never connect to production D1 except for migrations and deploys. They never run seed or export, and never print query results. E2E runs against a local D1 with synthetic data |
| Exports | `pnpm db:export` runs only on the owner's machine; output goes to a gitignored `exports/` folder (full) or the private repo (`--content-only`). No HTTP export endpoint |
| Search engines | `robots.txt` disallows `/api/`, `/admin`, `/known`, `/account`. `X-Robots-Tag: noindex, nofollow` on all `/api/*`. Cards load only via `POST /loops` after a user action, so crawlers never see them. The landing/privacy pages contain no vocabulary |
| Shared caches / CDN | `Cache-Control: no-store` on all `/api/*` responses |
| Third-party services | No third-party analytics, fonts, CDNs, error trackers or AI APIs receive content. Fonts are self-hosted. Cloudflare Web Analytics is cookieless and collects page views only (no API bodies). Turnstile receives only its challenge data, never content |
| Logs | Worker logs record ids, counts, status codes and timings, **never** item text, CSV contents or request/response bodies. The audit log stores vocabulary snapshots inside the private D1 only |
| Browser storage | `sessionStorage` holds the current loop (needed to resume after a refresh) and is cleared on Stop/finish. `localStorage` holds only item ids (known queue), never text |
| Future AI features | Sending content to an AI provider is a future, explicit owner decision (not in v1) |

### 14.3 Anti-scraping (bulk copying by scripts)
The app must show cards to its users, so scraping can be made **slow, costly and visible**, but not impossible.
- **Turnstile for guests**: every guest `POST /loops` needs a fresh, single-use Turnstile token (invisible/managed
  widget, free), verified server-side via siteverify, including the hostname. Signed-in users are already verified by
  Google sign-in.
- **Guest limits**: 5 cards per loop (fixed) and `guests.loopsPerHour` (default 10) loops per hour per **hashed** IP
  → at most ~50 cards per hour per IP.
- **Learner limits**: `users.cardsPerDay` (default 500) cards served per UTC day per user; admins exempt.
- **Burst limits** (Workers Rate Limiting binding, per minute): `POST /loops` 10/min per IP, `GET /loops/available`
  60/min per IP, `/auth/*` 20/min per IP, `/admin/import` 10/min per admin, other `/api/admin/*` 120/min per admin.
- **The daily write allowance can't be burned by bots**: blocked or unverified requests write nothing to D1 (§11.2
  rule 5).
- **Visibility**: the first over-limit request per subject and period writes a `limit.exceeded` audit entry. The admin
  dashboard shows the last 24 h count. Admins can ban abusive accounts.
- **Privacy of counters**: IPs are stored only as `HMAC-SHA256(ip, USAGE_HASH_SECRET)`; counters older than 48 h are deleted.

### 14.4 Application controls
| Threat | Control |
|---|---|
| SQL injection | Drizzle parameterized queries only. A lint rule bans `sql.raw(...)` and `db.exec`/multi-statement execution in app code. JSON paths are built from validated language codes only |
| Mass assignment | Zod `.strict()` schemas whitelist fields per endpoint (`lang` is not accepted on item update) |
| Oversized/malicious input | Length limits (item text ≤ 200, translation entry ≤ 200, explanation entry ≤ 500, synonym ≤ 100, hint ≤ 500, message ≤ 280), list sizes (translations ≤ 10 per language, explanation ≤ 10, synonyms ≤ 20, hints ≤ 20), NFC normalization, CSV ≤ 2 MB / 5,000 rows, request body size limits |
| XSS | React escaping; **no** `dangerouslySetInnerHTML`; strict CSP: `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' https://lh3.googleusercontent.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com` (adjust only as strictly needed for Google sign-in, Turnstile and Cloudflare Web Analytics) |
| Clickjacking | `frame-ancestors 'none'` (+ `X-Frame-Options: DENY`) |
| CSRF | `SameSite=Lax` cookies + Better Auth origin checks + `Origin` must equal `APP_URL` on all mutating `/api/*` requests + JSON content type required |
| Session theft | HttpOnly/Secure cookies; session expiry (e.g. 30 days rolling for users); banning revokes sessions |
| Information leakage | Generic error messages in production (no SQL/stack traces); details only in Worker logs (without content) |
| Headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera/mic/geolocation) |
| Test backdoors | `/api/test/*` registered only when `ENVIRONMENT=test`; production startup asserts it is absent |
| Supply chain | Lockfile committed; Dependabot; `pnpm` with build scripts allowed only for approved packages |
| Privacy | Store only Google id, email, name, avatar URL, known items, usage counters (hashed IP). Account deletion. Privacy page |

Answers are sent to the browser at loop start **by design** (self-assessment; a learner peeking only cheats themselves).

---

## 15. Non-functional requirements
| Area | Requirement |
|---|---|
| Responsiveness | 360px → 1440px+. No horizontal scrolling. Touch targets ≥ 48px |
| Performance | Learner path JS ≤ 200 KB gzipped (admin lazy-loaded; Turnstile script loaded only for guests). LCP < 2.5 s on mid-range mobile over 4G. Button response < 50 ms (the loop is local). Flip animation at 60 fps (transform-only) |
| Accessibility | WCAG 2.2 AA: contrast, visible focus, full keyboard operation, ARIA labels/live regions (announce Back with the card's answer, flip side, hints shown, cycle changes, toasts), `prefers-reduced-motion` respected (no 3D flip; crossfade instead). The default/selected field styles are not conveyed by color alone (the "Default" tag + outline style) |
| Browsers | The last 2 versions of Chrome, Edge, Firefox and Safari; iOS Safari 16+; Android Chrome |
| RTL | Correct rendering of Hebrew content (and mixed Hebrew/English) via per-element `dir`/`lang` on both card faces |
| Reliability | Known marks are never lost silently (persistent queue + retries). A tab opened before a deploy whose lazily loaded part (e.g. the admin area) no longer exists reloads itself once to pick up the new version, instead of showing "'text/html' is not a valid JavaScript MIME type" (`vite:preloadError`; at most one automatic reload per 15 s, so a real error still shows) |
| Database budget | Stays within the D1 free tier by design (§11.2) |
| Cost | Runs on the Cloudflare Workers Free (+ Turnstile, Access free tiers) and GitHub Free plans. Upgrade path: Workers Paid ($5/mo) |
| Observability | Workers logs (structured JSON, request id, no content), Cloudflare Web Analytics, audit log for admin actions and limit events |
| Maintainability | Strict TS, lint clean, `packages/core` coverage ≥ 90%, ADR log (the private decisions log, "D-0xx") |
| Dev environment | Works on Windows, macOS and Linux. npm scripts must be cross-platform (no bash-only syntax) |
| Portability | Full export to SQLite SQL + DB-agnostic JSON + import-ready CSV (§8.6) |

**Free-tier limits at time of writing (re-verify during implementation):** Workers: 100k requests/day (static asset
requests are free), 10 ms CPU per invocation. D1: 5M rows read/day, 100k rows written/day, 500 MB per database.
Cloudflare Access: free for ≤ 50 users. Turnstile: free.

---

## 16. Hosting, deployment and operations
- **Worker** `myvocab`, configured in `apps/api/wrangler.jsonc`:
  - `assets.directory` → `../web/dist`, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`.
  - Bindings: `DB` (D1 `myvocab-prod`), `RATE_LIMITER` (Rate Limiting), cron trigger `0 * * * *` (Trash purge +
    usage counter cleanup).
  - Vars: `ENVIRONMENT`, `APP_URL`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `TURNSTILE_SITE_KEY`.
  - Secrets (`wrangler secret put`): `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`,
    `TURNSTILE_SECRET_KEY`, `USAGE_HASH_SECRET`.
- **Environments**: local (`wrangler dev` + local D1 + `.dev.vars`), test (Vitest/Playwright, `ENVIRONMENT=test`,
  Turnstile test keys), production. The app starts on `myvocab.<account>.workers.dev`; a custom domain can be added
  later (update `APP_URL`, the Google redirect URIs, the Turnstile widget hostnames and the Access application).
- **GitHub Actions** (public code repo):
  - `ci.yml` (every PR and push): install → lint → typecheck → `check:no-vocabulary` → unit + integration tests →
    build → Playwright (against a local `wrangler dev` with the test env and synthetic data).
  - `deploy.yml`: triggered on push to `main` (and manually). Its deploy job targets the **`production` Environment**
    with the owner as **required reviewer**, so it **waits for the owner's Approve click**. Then: CI checks →
    `wrangler d1 migrations apply myvocab-prod --remote` → `wrangler deploy`. It never seeds, exports or prints data.
  - `codeql.yml`: CodeQL for JS/TS. `dependabot.yml`: npm + GitHub Actions, weekly.
- **Content operations** (owner, locally): first production seed with
  `pnpm db:seed --file ..\MyVocab-Content\starter.csv --remote` (after reviewing it); snapshots with
  `pnpm db:export --content-only` + commit in the private repo; full exports with `pnpm db:export`.
- **Restore**: `wrangler d1 time-travel info|restore` (README section with exact commands), or re-seed from a snapshot.

---

## 17. Testing strategy
| Level | Tooling | Must cover |
|---|---|---|
| Unit | Vitest | Every `loopReducer` transition: Know/Don't know/Show hints/Flip/Next/Continue/Stop; `FLIP` toggles `side` any number of times in both phases and never changes grading; `TOGGLE_HINTS` works only on the front, toggles on and off, resets on the next card and never changes grading; `DONT_KNOW` on the front sets `side = back`; new cards start on the front with hints hidden; cycle building; the **order differs** rule (seeded RNG); Back card by card (front up, never into an earlier cycle) and from the cycle break / summary; Next only on answered cards; changing an answer both ways (no duplicates in the next cycle). Answer strategies (translation vs explanation chosen by same/different languages, playability, line order, numbering); `buildCard` output; item validation (no same-language translation, list limits, duplicates, `lang` absent from the update schema); multiple-meanings warnings; the mixed-script check; `normalize`; CSV row validation (incl. the three `translation_<kind>_<code>` columns, the old column names, and the own-language column rule), merge planning (incl. the `multiple_meanings` OR rule), **CSV serializer**; start-card defaults resolution (settings → defaults; guest size = 5) |
| Integration | Vitest + `@cloudflare/vitest-pool-workers` (local D1, migrations applied) | Loop selection by topic/direction (translation vs explanation playability; the SQL rule agrees with `isPlayable` on fixtures); known items excluded **in every direction**; the DB CHECK rejects a same-language translation even through a direct repository write; item PATCH with a stale `version` → 409 and **no** audit row; **guest size forced to 5 even if a larger size is sent**; **guest without/with an invalid Turnstile token → 403 and zero D1 writes**; guest hourly cap → 429 with zero writes after the first `limit.exceeded` entry; learner daily cap → 429 with remaining allowance; admin exempt from caps; learner size must be in `sizeOptions`; admin endpoints → 401 guest / 403 user / 403 admin without an Access JWT in production mode / 403 on an email mismatch; item create/update + audit rows (before/after of changed lists); Trash: delete hides from loops and known lists, restore brings known marks back, restore blocked on a duplicate, purge cascades + snapshot; CSV dry run vs commit, merge rules, error and warning rows; idempotent `POST /me/known`; user A can't touch user B's known rows; `/api/*` responses carry `noindex` + `no-store` headers; settings validation (defaults must be active languages, etc.) |
| Scripts | Vitest (Node) against a local D1 | `db:seed` falls back to `seed/sample.csv` when `CONTENT_DIR` is missing; **export round-trip**: seed → `db:export --local --content-only` → import into an empty D1 → identical content; full export produces `manifest.json` row counts that match the tables, valid JSON per table (item lists as real arrays/objects), and a `schema.sql` that recreates the schema in a fresh SQLite |
| Guard | CI | `check:no-vocabulary` fails on a committed non-fixture `.csv`/`.sql`/export, or a `seed/sample.csv` over 20 rows |
| Component | Vitest + Testing Library | Button states per phase; FlipCard (button/keyboard flipping, a card tap does nothing, the hints cover on the front and the hints always on the back, multiple-meanings badge, numbered explanation lines, hidden face `inert`, live-region text, reduced-motion path); start card default vs selected styling + "Reset to defaults" + same-language note; guest locked amount + toast (auto once per session, on tap); Back, the "Clicked" chip, ← / →, and answer changes reaching the Know queue; ListEditor add/edit/delete/reorder + 409 handling; RTL rendering on both faces |
| E2E | Playwright (mobile 390×844 + desktop 1280×800) | Guest: landing → press Start without changing anything (defaults EN→HE, All topics, Words) → 5-card loop to the summary (incl. Hints on the front, then Flip showing hints on the back, Flip back and forth by button and by tapping the card, Know from the back side, Don't know → auto-flip → Next, Know → Back → Don't know; touch swipes left = Next and right = Back); guest sees the sign-in toast and can't change the amount. Signed-in (test session): choose 20 → loop; Know → appears in My known words → no longer offered in the other direction → Return to loops → available again. Admin: create an item with translations, explanation, synonyms, hints and multiple meanings; preview both directions; delete to Trash; restore. CSV: dry run with errors and warnings, then commit |
| Manual (post-deploy) | Phone + desktop | Play a loop (check the flip and hints feel on a real phone); guest Turnstile works invisibly; sign in; known list; `/admin` → Cloudflare Access asks for a one-time code; a non-admin email is refused by Access; a normal user calling `/api/admin/*` → 403; `pnpm db:export` and `--content-only` work from the owner's machine; the D1 dashboard shows rows read/written well within the free tier |

CI fails on lint, type or test errors, a guard failure, or if `packages/core` coverage < 90%.

---

## 18. Milestones
| # | Milestone | Key deliverables |
|---|---|---|
| M0 | Scaffold | Monorepo, strict TS, ESLint/Prettier, Vitest, CI (+ `check:no-vocabulary`), Worker serving the SPA shell + `/api/health`, tokens + Button3D |
| M1 | Core domain | Loop reducer (`FLIP`/`side`, `TOGGLE_HINTS`/`hintsShown`), shuffle, answer strategies + `buildCard`, item validation rules, normalization + mixed-script check, CSV row schema + merge planner + serializer, setup defaults resolution, ≥ 90% coverage |
| M2 | Database & content | Drizzle schema + migrations per §11 (JSON list columns + CHECKs, partial indexes, `WITHOUT ROWID` where supported, cascade indexes), repositories, `CsvImportService`, `seed/sample.csv` (synthetic), `pnpm db:seed` (`CONTENT_DIR` + fallback), the starter set + README written to `../MyVocab-Content/` (private, outside the public repo) |
| M3 | Learning experience | `/meta`, `/loops/available`, `/loops` (guest rules, Turnstile before writes, usage limits); landing, start card (defaults, default/selected styling, same-language note, guest lock + toast), **FlipCard** with Hints + loop screen, cycle break, summary; guest E2E |
| M4 | Auth & known items | Better Auth Google, `/me`, known endpoints (per item), known queue + Undo, My known words, account deletion, privacy page, learner amounts + daily cap |
| M5 | Admin | Both locks, dashboard, item editor (fixed language, translations per other language, explanation, synonyms, hints, multiple meanings, warnings) + ListEditor + optimistic concurrency + flip-card preview, topics, languages, users, settings (incl. defaults and limits), audit log, Trash + cron |
| M6 | CSV import UI & export | Import UI (template, upload, dry-run report with errors/warnings, commit); `pnpm db:export` (full + `--content-only`) with round-trip tests; README "Export & migrate your data" |
| M7 | Hardening & release | Security headers/CSP, `noindex`/`robots.txt`, burst rate limits, write-discipline checks (§11.2), a11y pass, full E2E, deploy workflow + approval env, ruleset, CodeQL, Dependabot, README setup + restore guide |

Detailed acceptance criteria are in `AGENT_PROMPT.md` (local only, git-ignored).

---

## 19. Owner (human) action items
1. Create (or confirm) a **Cloudflare account** and enable **2FA**.
2. Create the **GitHub repos**: `MyVocab` (**public**, code) and `MyVocab-Content` (**private**, vocabulary). Enable
   **2FA**. Approve repo creation and pushes by the agent.
3. **Google Cloud Console**: create an OAuth client (Web). Authorized redirect URIs:
   `http://localhost:8787/api/auth/callback/google` and `https://<app-host>/api/auth/callback/google`.
4. **Cloudflare Turnstile**: create a widget (invisible/managed) for the app hostname (+ `localhost` for dev). Note the
   site key and secret key.
5. Create the **Cloudflare API token** (scoped) and add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to the GitHub
   `production` Environment; set yourself as required reviewer.
6. Set the Worker secrets: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`,
   `TURNSTILE_SECRET_KEY`, `USAGE_HASH_SECRET`, and the var `TURNSTILE_SITE_KEY`.
7. Configure **Cloudflare Access** (team domain, application for `/admin*` + `/api/admin/*`, one-time PIN policy
   for the admin emails) and copy the **AUD tag** into `CF_ACCESS_AUD`.
8. **Review `MyVocab-Content/starter.csv`** (Hebrew and English quality), then seed production
   (`pnpm db:seed --file ..\MyVocab-Content\starter.csv --remote`).
9. Approve each production deploy in GitHub.
10. Periodically: `pnpm db:export --content-only` and commit the snapshot to the private repo.

---

## 20. Future roadmap
- **Monetization**: plans/subscriptions behind `EntitlementService` (e.g. a free tier with limited loop sizes or
  topics). Provider candidates: Paddle or Lemon Squeezy (merchant of record, which handles VAT) or Stripe.
- **AI content**: `ContentGenerator` using the Claude API to suggest items, translations, explanations, hints and
  synonyms as `draft`s for admin review (an explicit owner decision about sending content to an AI provider).
- **More languages**: insert into `languages` + content; UI localization via an i18n library replacing `strings.ts`.
- **Learning science**: session history, per-word statistics, spaced repetition, "review known words" loops.
- **Content ops**: bulk edit, duplicate finder, "replace" import mode (overwrite instead of append).
- **Platform**: PWA/offline mode, custom domain, light theme.
