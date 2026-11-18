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
shows the **explanation**. A translation may also carry a **literal meaning** (the word-for-word translation of an
expression), shown under it. Hints and synonyms can be revealed on the front and always appear on the back.

**Known items memory.** For signed-in learners, every item they mark "Know" is remembered and never shown again in any
future loop, **in any direction**. A "My known words" page lists those items and lets the learner return any of them
to future loops.

**Private vocabulary.** The vocabulary is the product's asset. It lives only in the app's private database and in a
private content repository. It never appears in the public code repo or any public/third-party service (§14.2).

---

## 2. Goals and non-goals

### 2.1 Goals (v1)
- A simple, clean, fast, dark-themed site that works well on desktop and mobile, reachable from anywhere.
- A frictionless start: every start option has a sensible default, so anyone can press **Start** immediately. Guests
  can run short (5-card) loops right from the landing page.
- Google sign-in for learners who want larger loops and their known words remembered.
- An admin panel for content (items with their translations, explanations, synonyms and hints; categories), users and
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
| **Item** | The basic content unit: one word or expression in its **language** (e.g. English "Swift"). It holds its type, the multiple-meanings flag, categories, translations, explanation, synonyms and hints (§8.1). Its `text` is always what the front of the card shows. |
| **Type** | `word` or `expr`, shown as **Words** / **Expressions**. Set by the admin on each item; the learner picks one on the start card. |
| **Translation** | For each **other** language, an ordered list of translations of the item (e.g. `he: ["מהיר", "סנונית"]`). An item never has a translation into its own language. |
| **Literal meaning** | Optional, per **other** language: the word-for-word translation, for expressions whose literal words differ from their meaning (e.g. an idiom). The translation holds the meaning; the literal meaning is shown under it as "Literal meaning: …". An item never has a literal meaning in its own language. |
| **Explanation** | An ordered list of explanations **in the item's own language**, one entry per meaning. |
| **Synonym** | An alternative word or expression in the item's language. Synonyms have their own list and are shown in a "Synonyms" section next to the hints. |
| **Hint** | A usage example or sentence in the item's language. 0..N per item. |
| **Multiple meanings** | A flag (`multipleMeanings`) the admin sets when the item has two or more meanings (e.g. "Date": a day / a fruit). The learner sees a badge on the front. It can't be computed from list lengths: "Happy" → ["שמח", "מאושר"] has two translations but one meaning. |
| **Card** | What the learner sees in a loop: one item + the target language chosen on the start card. **Not stored** in the database. On screen it is a **flip card**: the item on the **front**; the translation or explanation, hints and synonyms on the **back**. |
| **Direction** | Source language → target language, e.g. EN→HE. The source is always the item's language. |
| **Hints (button)** | Reveals the hints and synonyms on the front of the card. |
| **Flip** | Turning the on-screen card over (front ↔ back). It can be done any number of times and **has no effect on grading**. |
| **Amount** | The number of cards in a loop (learners: 10/20/30/40/50; guests: always 5). |
| **Loop** | One learning session over a group of cards. |
| **Cycle** | One pass over the loop's remaining cards. |
| **Known item** | An item a signed-in learner marked "Know" (in any direction). It is excluded from all their future loops, **in every direction**, until returned. |
| **Category** | A topic (Home, Nature, …). An item can have many, or none. **General** is virtual: random across all items, including items without a category. |
| **Content repo** | The **private** GitHub repo `MyVocab-Content` that holds vocabulary files (starter set, import batches, snapshots). |

**How the back of the card is chosen** (illustrative items):
| Start card | Front | Back (answer) | Back (below the answer) |
|---|---|---|---|
| EN → HE · Words | Swift ◆ | מהיר / סנונית | Hints + Synonyms |
| EN → EN · Words | Swift ◆ | 1. Moving or able to move very fast · 2. A small bird that flies very fast | Hints + Synonyms |
| EN → HE · Expressions | A needle in a haystack | מחט בערימת שחת | Hints |
| EN → HE · Expressions | *an idiom* | *its meaning in Hebrew* | **Literal meaning:** *its word-for-word Hebrew translation*, then Hints |
| EN → EN · Expressions | A needle in a haystack | Something very hard to find among many other things | Hints |

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
| Start defaults | Source **English**, Target **Hebrew**, Category **General**, Type **Words**, Amount **10**, shown in a muted "default" style |
| Amount | Learners: **10 / 20 / 30 / 40 / 50** (default 10). Guests: **always 5**, locked, with a "please register" toast |
| Guests | Can run 5-card loops after an invisible **Turnstile** bot check. Their Know marks are **not** remembered |
| Anti-scraping | Turnstile for guests + strict limits (guests ~10 loops/hour per IP; learners ~500 cards/day) + `noindex` + no third-party content exposure |
| Content model | One **item** per word/expression, in its own language. Translations and literal meanings (per other language), explanation, synonyms and hints are **ordered lists** stored inside the item row (§11) |
| Types | Two: `word` / `expr` (Words / Expressions) |
| Back of card | Different languages → **translation** (+ **literal meaning** if any); same language → **explanation**. Hints + synonyms always below |
| Multiple meanings | Admin-set flag. Shown as a "◆ Multiple meanings" badge on the front |
| Card UI | A glassy, violet-glowing **flip card** with a 3D flip animation and a round **Flip** button on both sides |
| Hints | A **Hints** button reveals hints + synonyms on the front (one-way for that card). Flipping always shows them on the back |
| Flip | The round **Flip** button on the card (front and back), a tap/click on the card, or Space/F. It toggles front ↔ back any number of times and never affects grading |
| Known memory | **Any** "Know" (any cycle) is remembered per **item** and hides the item in **every** direction |
| Known list | "My known words": search/filter/sort; return items to loops (single, selected, all filtered) |
| Know tap | Advances immediately + an Undo bar for ~4 s showing `item → answer ✓ Undo` |
| Categories | Many-to-many. "General" = all items |
| Content sources | Agent-written starter set (in the private content repo) → then admins add manually or by CSV bulk upload |
| UI language | English only (strings centralized for future i18n). Hebrew content renders RTL |
| Look | Dark only. Near-black + violet palette. "Pressable ledge" 3D buttons |
| DB tuning | Built for the D1 free tier: one row per item, only the indexes queries need, no writes from blocked requests, no per-request writes (§11.2) |

---

## 6. Functional requirements: Learner

### 6.1 Landing page and start card
- **FR-L1** The landing page (`/`) shows a short hero, a 3-step "How it works" section, and the **Start card**.
  Desktop: hero and start card side by side. Mobile: stacked, with the start card visible after minimal scrolling.
- **FR-L2** Start card fields and **defaults** (the defaults come from admin settings, §7.7):

| Field | Options | Default |
|---|---|---|
| Source language | Active languages | **English** |
| Target language | Active languages | **Hebrew** |
| Category | "General" + active categories (by `sort_order`) | **General** |
| Type | Words / Expressions | **Words** |
| Amount (signed-in) | **10 / 20 / 30 / 40 / 50** (segmented control) | **10** |
| Amount (guest) | **5**, fixed and locked | **5** |

- **FR-L3 Default styling**: a default value must still read as **chosen**: same background and bright `--text`
  value as a selected one (the selected option of a segmented control is filled the same way), with a subtle solid
  `--border` outline and a small violet **"Default"** tag. As soon as the user changes it, the field gets a solid
  `--accent` outline and the tag disappears (owner feedback, 2026-11-18: the muted look made defaults seem unset).
  When any field differs from its default, a **"Reset to defaults"** link appears. The user can press **Start**
  immediately without touching anything.
- **FR-L4** "New loop" from the summary keeps the previous selection (fields that differ from the defaults show the
  selected style). A fresh visit to `/` always starts from the defaults (nothing is remembered between visits).
- **FR-L5 Same language**: choosing source = target is allowed. The back of the card then shows the item's
  **explanation** instead of a translation. While the two languages are the same, a short muted note under the
  fields says "Same language: the back shows an explanation".
- **FR-L6 Guest amount**: guests see the Amount field fixed at **5** with a lock icon. It cannot be changed. A
  **temporary toast** says: **"Please register in order to choose a larger amount of cards."**, with a **"Sign in with
  Google"** button, and auto-dismisses after ~5 s. It appears:
  - once automatically, the first time a guest sees the start card in a browser session, and
  - every time the guest taps/clicks the locked Amount field.
  The server **enforces** 5 for guests regardless of the request (§12.1).
- **FR-L7** The start card shows **"N new cards available"** for the current selection (debounced 300 ms; counts only
  playable items (FR-L40); excludes known items for signed-in users).
- **FR-L8** If fewer cards are available than the amount, the loop starts with all available cards and shows a notice
  ("Only 7 new cards in Home, starting with 7"). If 0 are available: an empty state ("You know every card in this
  selection 🎉") with links to change the selection or open "My known words".
- **FR-L9** Guests see a subtle banner: "Sign in with Google to remember the words you know and choose bigger loops."
- **FR-L10** Guests pass an **invisible Cloudflare Turnstile** check when they press Start (§14.3). In the rare case
  Turnstile shows an interactive challenge, it appears inline in the start card.
- **FR-L11** When `guests.enabled` = false, guests see "Sign in to start" instead of the Start button.
- **FR-L12** When `maintenance.enabled` = true, every page shows `maintenance.message`, and starting loops is disabled
  for non-admins.

### 6.2 The loop
- **FR-L20** `POST /api/loops` returns the selected cards (fully composed for display). The loop then runs **entirely
  in the browser** (no network round-trip per tap).
- **FR-L21** Cycle 1 = all selected cards, shuffled with Fisher–Yates. Each later cycle = the previous cycle's
  "Don't know" cards, re-shuffled. **If a cycle has more than one card, its order must differ from the previous
  cycle's relative order** (re-shuffle, up to 10 attempts; then rotate by one).
- **FR-L22 The flip card.** Each card is shown on a raised card with a soft shadow (§9.3).
  - **Front**: a small label with the direction and type (e.g. "EN → HE · Words"); the item **text**, large and
    centered, with `dir`/`lang` from its language (`rtl` for Hebrew); a **"◆ Multiple meanings"** badge under the text
    when the item has multiple meanings. After **Hints** is pressed (FR-L25), a **Hints** section appears under the
    text: the hints in order, then a **Synonyms:** line (if there are synonyms), in smaller muted text with the item
    language's `dir`. If the item has no hints and no synonyms, the section shows "Hint is not available".
  - **Back**: a small muted label ("Translation" or "Explanation"); the **answer lines** (§6.3) in large text with the
    answer language's `dir`; for a translation with a literal meaning, a muted **"Literal meaning: …"** line under the
    answer lines (entries comma-separated, in the answer language's `dir`); a thin divider; then the Hints section and the Synonyms line, **always** (whether or not
    Hints was pressed), or "Hint is not available".
  - Every card starts **front side up, with hints hidden**.
- **FR-L23** Header progress: `Cycle 2 · Card 1/3 · 2 known` (known = total known in this loop).
- **FR-L24** Buttons and phases:

| Phase | Know | Hints | Flip | Don't know | Next | Stop |
|---|---|---|---|---|---|---|
| **Deciding** (front or back side) | enabled | enabled\* | enabled | enabled | **disabled** | enabled |
| **Revealed** (after Don't know) | disabled | enabled\* | enabled | disabled | **enabled + focused** | enabled |

\* Hints is enabled only while the **front** is showing and the current card's hints are not shown yet.

- **FR-L25 Hints**: reveals the hints and synonyms on the **front** of the current card (the **Hints** button or the
  **H** key). They stay shown on the front for that card, including after flipping back and forth, and the button then
  disables. If the learner never presses Hints, the front shows no hints, even after the back has been seen. **Hints
  has no effect on grading** and is not recorded.
- **FR-L26 Flip**: turns the card over (front ↔ back) with a 3D flip animation (§9.4). It can be triggered by the
  round **Flip** button in the card's corner (shown on **both** faces), by **tapping/clicking the card**, or by the
  **Space**/**F** keys. The learner can flip back and forth
  **any number of times**, in both phases. **Flipping has no effect on grading** and is not recorded.
- **FR-L27 Know** (available on either side while Deciding): removes the card from the loop (it won't appear in the
  next cycle), records it as known in this cycle, and **immediately** shows the next card (front side up). An **Undo
  bar** appears at the bottom for `undo.windowSeconds` (default 4): `Date → תאריך, תמר ✓  [Undo]` (the item text →
  the answer lines joined with ", ", cut at about 40 characters with "…").
  - **Undo** turns that card into "Don't know": it goes back into the next cycle's set. This works even if the Know
    ended a cycle (the interstitial updates) or ended the loop (the summary turns back into a cycle break with that card).
  - Only the **most recent** Know can be undone. A new Know finalizes the previous one.
- **FR-L28 Don't know** (available on either side while Deciding): adds the card to the next cycle. If the card is
  showing its front, it **flips automatically** to the back (answer + hints + synonyms). The phase becomes
  **Revealed**: Know and Don't know disable, **Next** enables and receives focus, and Flip stays available.
- **FR-L29 Next**: moves to the next card (only enabled in the Revealed phase). The next card enters front side up with
  a short slide-in (no reverse-flip animation).
- **FR-L30 Stop**: ends the loop immediately and returns to `/` with no confirmation dialog. Already-made Know marks are
  kept (and flushed, §6.4).
- **FR-L30a Home from the loop**: the loop header has a **"← Home"** link like the other pages. Because it leaves the
  loop, it first asks **"This will stop the loop. Are you sure?"** with **Yes** / **No**. **Yes** = Stop (FR-L30);
  **No** closes the question and the loop continues where it was. While the question is open, loop shortcuts are
  ignored and Esc means No (owner request, 2026-11-18).
- **FR-L31 Cycle break**: when a cycle ends and "Don't know" cards remain, an interstitial shows
  "Cycle 3 · 2 cards left" with a **Continue** button (Enter also continues).
- **FR-L32 End of loop**: when a cycle ends with no "Don't know" cards, a summary shows the total cards, the number of
  cycles, **Already knew** (known in cycle 1) vs **Learned here** (known in cycle ≥ 2), and buttons **New loop**
  (back to the start card with the same selection) and **Home**. Guests also see "Sign in to remember these words".
- **FR-L33** The loop state (including the current card's side and whether its hints are shown) is saved in
  `sessionStorage`, so a page refresh resumes the same loop. Stop or finishing clears it.
- **FR-L34** Desktop keyboard shortcuts (listed in a "Keyboard shortcuts" popover in the loop header): **K** Know, **D** Don't know, **H** Hints,
  **Space/F** Flip, **Enter** Next or Continue, **Esc** Stop. Shortcuts respect the enabled/disabled state.

### 6.3 What the back of the card shows
The front always shows the item text. The back depends only on whether the two languages are the **same or
different**:

| Languages | Answer (large) | Below the divider |
|---|---|---|
| different (e.g. EN → HE) | the item's **translation** into the target language: each entry on its own line; then "Literal meaning: …" (smaller, muted) if the item has a literal meaning in the target language | Hints + Synonyms (item language) |
| same (e.g. EN → EN) | the item's **explanation**: each entry on its own line, **numbered** ("1.", "2.") when there are two or more | Hints + Synonyms (item language) |

- **FR-L40 Playability**: an item can be used for a direction only if it is `published`, not in Trash, of the chosen
  type, its language is the source language, and:
  - different languages: it has **≥ 1 translation** into the target language;
  - same language: it has **≥ 1 explanation** entry.
- **FR-L41** The server composes each card (front, answer lines, literal meaning, hints, synonyms, languages and text directions)
  before sending it (§12.1). The browser only renders it and never applies these rules itself.
- **FR-L42** Hints and synonyms are always in the item's language and are shown with its `dir`.
- **FR-L43** The literal meaning never makes an item playable on its own (FR-L40 still needs a translation), is never
  revealed by **Hints** (it would give the answer away), and is not part of the Undo bar or "My known words".

### 6.4 Known items (signed-in learners only)
- **FR-L50** Every Know (in any cycle) is recorded as `{itemId, target, cycle}` in a client-side **pending queue**
  (`target` is kept for display only, FR-L60).
- **FR-L51** An entry becomes **final** when its undo window expires or a newer Know happens. Final entries are sent in
  batches (`POST /api/me/known`, debounced ~2 s). On `pagehide`/`visibilitychange=hidden`, **all** entries (including
  ones still in their undo window) are flushed with `fetch(..., {keepalive: true})`.
- **FR-L52** The queue is mirrored to `localStorage` (keyed by user id; item ids only, never item text) so unsent
  entries survive a closed tab and are sent on the next app load. Sends retry with exponential backoff. The server
  upsert is **idempotent** (it keeps the earliest `known_at`).
- **FR-L53** Undo removes the entry from the queue. If it was already sent, the client calls
  `DELETE /api/me/known/:itemId`.
- **FR-L54** `POST /api/loops` for a signed-in user **excludes** all their known items, **in every direction**. Knowing
  "Swift" in EN → HE also hides it from EN → EN. Separate items are not affected: the Hebrew item "מהיר" still appears
  in HE → EN loops.
- **FR-L55** Guests: nothing is queued or stored.

### 6.5 "My known words" page (`/known`, signed-in only)
- **FR-L60** A paginated list (cursor, 50 per page) of the learner's known items: item text (with `dir`), language,
  type label, the "◆" badge if it has multiple meanings, the answer in the direction where it was marked (e.g.
  "EN → HE: תאריך, תמר"), category chips, date known, and a badge **Already knew** (cycle 1) / **Learned here**
  (cycle ≥ 2).
- **FR-L61** Search (item text and translations, case-insensitive), filters (language, type, category), and sort
  (newest first by default; oldest first; A→Z).
- **FR-L62** **Return to loops**: per row; for selected rows (checkboxes); or "Return all N filtered" (with a confirm
  dialog). Returned items immediately become available to future loops, in every direction.
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
- **FR-A1** Counts: items (by language and type), items missing a translation (per language), items without an
  explanation, items with no hints, items with multiple meanings, users, admins, items in Trash, rate-limit/scraping
  events in the last 24 h. Quick links.

### 7.2 Items (`/admin/items`, `/admin/items/new`, `/admin/items/:id`)
- **FR-A10** List: search (text and translations), filters (language, type, category, status, multiple meanings,
  "missing translation into X", "missing explanation", "no hints", "not playable"), sort, pagination (50 per page).
  Columns: text, language, type, ◆, categories, translation badges per language, explanation ✓, hint count, status,
  updated.
- **FR-A11** **Item editor**:
  - **Header**: language, text, type (word/expr), **Multiple meanings** (toggle), status (draft/published),
    categories (multi-select chips). The **language is chosen at creation and then fixed** (to change it, create a new
    item); this keeps an existing translation from becoming a same-language translation. Save validates uniqueness
    (same language + normalized text + type among non-deleted items).
  - **Translations**: one inline list editor per active language **other than the item's language** (an English item
    shows "Hebrew"; a Hebrew item shows "English"). The item's own language is never offered (§8.1). Under each
    translation, a **Literal meaning** list editor for the same language (optional, usually one entry).
  - **Explanation**: an inline list editor, one entry per meaning, in the item's language.
  - **Synonyms**: an inline list editor.
  - **Hints**: an inline list editor.
  - **Preview as learner**: renders the **flip card** exactly as the loop would (Hints and Flip working), for every
    direction: each other active language (translation) and the same language (explanation). It uses the server's card
    builder (§12.4), so it always matches what learners see.
  - **Warnings** (badges; they never block saving):
    - not playable for a direction (no translation into X, or no explanation);
    - **Multiple meanings** is on, but a translation list or the explanation has only one entry;
    - **mixed scripts**: a text contains letters from a different script than its language (e.g. a Hebrew "מ" inside
      an English item: "A מeedle in a haystack"). Checked for the text, explanation, synonyms and hints (against the
      item's language) and for each translation entry (against that translation's language), using
      `languages.script` (§11).
- **FR-A12** **Inline list editor** (one reusable component for translations, explanation, synonyms, hints): shows
  entries in order; **Add** (input + Enter); **Edit** in place (click/tap → input; Enter saves, Esc cancels); **Delete**
  (immediate, with a 5-second "Undo" toast that re-adds the entry); **Reorder** (drag handle on desktop, ↑/↓ buttons
  on mobile and for keyboard users). Every change saves that list right away (`PATCH /admin/items/:id` with the item's
  `version`) and is audit-logged with the list before and after.
  - **Concurrent edits**: if someone else changed the item since it was loaded, the save is rejected (409); the editor
    reloads the item and says "This item was changed by someone else. Your last change was not saved."
- **FR-A13** **Delete item** = soft delete to Trash (confirm dialog that names the item).

### 7.3 Trash (`/admin/trash`)
- **FR-A20** Lists soft-deleted items: text, language, type, deleted by, deleted at, and "purges in Xh Ym".
- **FR-A21** **Restore**: undeletes the item. Restore is **blocked** with a clear message if a non-deleted duplicate
  now exists (same language + normalized text + type). Users' known marks are preserved while an item is in Trash, so
  restoring brings them back.
- **FR-A22** **Purge now**: permanent delete (typed confirmation).
- **FR-A23** **Auto-purge**: a Worker Cron Trigger runs hourly and permanently deletes items whose `deleted_at` is older
  than `trash.retentionHours` (default **24**). Purge cascades to category links and users' known marks.
- **FR-A24** Every delete, restore and purge writes an audit entry containing a **full JSON snapshot** of the item
  (all fields and lists + category slugs) that is **kept permanently**.

### 7.4 Categories (`/admin/categories`)
- **FR-A30** CRUD: slug (lowercase, `a-z0-9-`), name, active, sort order (reorder). Deleting a category that still has
  items is blocked: deactivate it instead, or remove it from those items first.

### 7.5 Languages (`/admin/languages`)
- **FR-A35** Lists languages (code, name, native name, direction, script) with an **active** toggle. Inactive languages
  are hidden from the start card and the editor, and their translations are not used; the data is kept. Adding new
  languages is done by migration or seed in v1 (data only, no code).

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
| `defaults.categoryId` | int \| null | `null` (General) | Start card default category |
| `defaults.type` | `"word"` \| `"expr"` | `"word"` | Start card default type |
| `loop.sizeOptions` | int[] | `[10,20,30,40,50]` | Amount choices for signed-in learners |
| `loop.defaultSize` | int | `10` | Default amount (must be in `sizeOptions`) |
| `loop.maxSize` | int | `50` | Server-side cap for `POST /loops` |
| `guests.enabled` | bool | `true` | Allow guests to run loops |
| `guests.loopSize` | int | `5` | Fixed guest amount (server-enforced) |
| `guests.loopsPerHour` | int | `10` | Guest loops per hour per IP |
| `users.cardsPerDay` | int | `500` | Cards served per learner per UTC day (admins exempt) |
| `undo.windowSeconds` | int | `4` | Undo bar duration (1–15) |
| `maintenance.enabled` | bool | `false` | Show banner + block loops for non-admins |
| `maintenance.message` | string | `""` | Banner text (≤ 280 chars) |
| `trash.retentionHours` | int | `24` | Hours before auto-purge (1–720) |

- **FR-A50** Settings are validated with Zod (server side; e.g. the default languages must be active, and
  `defaultSize` must be in `sizeOptions`) and audit-logged.

### 7.8 CSV import (`/admin/import`): see §8.3
- **FR-A60** Download the template; upload a CSV; **dry run** shows the counts, per-row errors and warnings; **Commit**
  applies it (allowed with warnings, refused with errors).
- **FR-A61** The option "Create missing categories" (default off).

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
  "type": "word",
  "lang": "en",
  "multipleMeanings": true,
  "categories": ["food"],
  "translation": { "he": ["תאריך", "תמר"] },
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
| `type` | `word` or `expr` |
| `lang` | An active language. **Fixed after creation** |
| `multipleMeanings` | Boolean, default `false` |
| `categories` | 0..N category slugs (ids in the admin API). An item without categories appears only under General |
| `translation` | An object whose keys are language codes **other than `lang`**; each value is a non-empty ordered list (≤ 10 entries, each ≤ 200 chars) |
| `literal` | Same shape as `translation` (keys **other than `lang`**), optional per language (≤ 5 entries, each ≤ 200 chars): the word-for-word translation, shown under the translation |
| `explanation` | Ordered list in `lang` (≤ 10 entries, each ≤ 500 chars), one entry per meaning |
| `synonyms` | Ordered list in `lang` (≤ 20 entries, each ≤ 100 chars) |
| `hints` | Ordered list in `lang` (≤ 20 entries, each ≤ 500 chars) |
| `status` | `published` (default) or `draft` (hidden from loops) |

- **No translation (or literal meaning) into the item's own language, at every layer**: the editor never offers it,
  the API and CSV import reject it (Zod), and a database CHECK constraint blocks it (§11). Because `lang` is fixed after creation, an
  existing translation can never turn into a same-language one.
- Within each list, entries are trimmed, empty entries are dropped, and duplicates are rejected (normalized compare,
  §8.2).
- Hebrew → English cards need **Hebrew items** (the `text` is always the front). The English item "Swift" and the
  Hebrew item "מהיר" are separate items, each with its own lists and known marks.
- **Adding a language later**: activate it, add translations into it on existing items (a new `translation_<code>`
  CSV column), and create items whose `lang` is the new language.

### 8.2 Text normalization (`packages/core`)
`normalized_text` is used for uniqueness and merge matching (never shown):
Unicode **NFC** → trim → collapse internal whitespace to one space → lowercase (`toLowerCase()`, locale-independent)
→ remove Hebrew niqqud/cantillation marks (U+0591–U+05C7) → strip leading/trailing punctuation.
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
| `lang` | yes | Active language code (`en`, `he`) |
| `text` | yes | Item text (≤ 200 chars) |
| `type` | yes | `word` or `expr` |
| `multiple_meanings` | no | `true` / `false` (default `false`) |
| `categories` | no | Category slugs, `|`-separated |
| `translation_<code>` | no | One column per language, e.g. `translation_he`, `translation_en`: translations into that language, `|`-separated. The column of the row's own `lang` must be empty |
| `literal_<code>` | no | One column per language, e.g. `literal_he`: the literal (word-for-word) meaning in that language, `|`-separated. The column of the row's own `lang` must be empty |
| `explanation` | no | Explanation entries in the row's language, `|`-separated |
| `synonyms` | no | `|`-separated |
| `hints` | no | `|`-separated |
| `status` | no | `published` (default) or `draft` |

Rules:
- A row must have **at least one translation or an explanation** (otherwise it can't be played in any direction).
- A `translation_<code>` header for an unknown language is a file error. A value in the row's own language column is a
  row error ("An English item can't have an English translation; use `explanation`").
- **Merge semantics** (an import never deletes or overwrites):
  - An item matches an existing **non-deleted** item on (`lang`, normalized `text`, `type`); otherwise it is created.
  - Categories are unioned. Translation and literal entries (per language), explanation entries, synonyms and hints are appended
    if not already present (normalized compare).
  - `multiple_meanings = true` turns the flag on; `false` or empty never turns it off.
  - `status` applies only to newly created items (an existing item's status isn't changed by import).
  - Rows in the same file that refer to the same item are merged together.
- Unknown category slugs → a row error, unless **Create missing categories** is ticked (the slug becomes the
  name in Title Case). `pnpm db:seed` always creates missing categories.
- **Warnings** (shown in the dry run; they don't block the commit): multiple meanings with a single-entry list; mixed
  scripts (FR-A11).
- **Dry run** (`dryRun=true`): parses and validates everything and returns totals (new items, merged items, new
  translation entries, explanation entries, synonyms, hints, skipped duplicates) and lists of `{row, column, message}`
  errors and warnings. Nothing is written.
- **Commit**: refused if the dry run would report errors (fix the file first). It is written in a single D1 `batch()`
  (transactional). If D1 limits require it, the write is chunked by item with a precise report of what was written.
  It writes one `csv.import` audit entry with totals and the file name/SHA-256 (never the file contents).
- **Round-trip guarantee**: exporting the vocabulary to CSV (§8.6) and importing that CSV into an empty database
  produces identical content (items, categories, all lists in order, flags, statuses). The export writes a
  `translation_<code>` column for every language present. No cell escaping that would alter values is applied.

**Example** (illustrative only; the template also has a synthetic expression row showing `literal_he`). Files
without `literal_<code>` columns stay valid.
```csv
lang,text,type,multiple_meanings,categories,translation_he,translation_en,explanation,synonyms,hints,status
en,Swift,word,true,,מהיר|סנונית,,"Moving or able to move very fast|A small bird that flies very fast",fast|quick|rapid,"He gave a swift reply.|A swift nested under the roof.",published
he,מהיר,word,false,,,fast|quick,"שנע או פועל במהירות רבה",זריז,"הרכבת המהירה הגיעה בזמן.",published
```

### 8.4 Starter set
- Written by the implementing agent into the **private content repo folder** (`../MyVocab-Content/starter.csv`),
  **never** into the public code repo.
- 6 categories: `home`, `nature`, `electronics-devices`, `food`, `business`, `travel` (+ `general-idioms` for idioms).
- About 15 items per category **per language** (English and Hebrew), plus about 10 idioms (`expr`) per language.
- Every English item has a **Hebrew translation** and an **English explanation**. Every Hebrew item has an **English
  translation** and a **Hebrew explanation**. Synonyms where natural; 1–2 hints per item (natural usage sentences in
  the item's language). `multiple_meanings` is set where a word truly has several meanings, with one translation and
  one explanation entry per meaning. Idioms whose literal words differ from their meaning put the meaning in
  `translation_<code>` and the word-for-word translation in `literal_<code>`.
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
- **Pills** (Know, Don't know): icon (✓ / ✕) + label inside, on every screen size.
- **Round buttons** (Stop, Hints, Next; Flip on the card): an icon in a circle (56px mobile, 64px desktop) with an
  italic muted caption underneath ("Stop", "Hints", "Next").
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
- **Back**: a small muted label ("Translation" / "Explanation"); the answer lines large and centered (one per line;
  explanation lines numbered when there are two or more, and set in a smaller size when long); under them, when
  present, "Literal meaning: …" in `--text-muted` at the hints' size; a thin divider; then
  **Hints** as a muted list and a "Synonyms: …" line (or "Hint is not available").
- A round **Flip** button (↻) sits in the bottom-right corner of **both** faces, so the card can be turned back from
  the answer side too.
- **Size**: both faces share one grid cell (`display:grid` with both faces at `grid-area: 1 / 1`), so the card takes the
  height of the taller face and doesn't jump when flipped. Minimum height about 300px on mobile, 420px on desktop. On
  small phones, if a face is very long it scrolls inside the card (max height ≈ 60vh).

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
- Triggers: the round **Flip** button on the card, a **tap/click on the card**, the **Space**/**F** keys. It toggles
  both ways without limit.
- Rapid repeated flips simply reverse the animation (no queued spins).
- RTL: the rotation direction stays the same; only text direction changes per face.
- **Hints** expands the front's hints section with a short height/opacity transition (none with reduced motion).
- **Accessibility**: the round Flip button on the visible face is the keyboard control (a real `button` named
  "Flip"); tapping the card is a pointer shortcut for the same action. The hidden face gets `inert` +
  `aria-hidden="true"`, so only the visible face's Flip button is focusable. An `aria-live="polite"` region announces
  "Showing answer" / "Showing front" / "Hints shown".
- After **Don't know** on the front, the same flip animation plays automatically.
- **Next** / **Know**: the next card enters front side up with a short slide-in (200ms; none with reduced motion).

### 9.5 Start card (look)
- Five fields stacked on mobile (2-column grid on desktop), each with a label and either a select (languages,
  category) or a segmented control (type: 2 options; amount).
- **Default style** (value unchanged): looks chosen (bright value text, filled selected option), subtle solid
  outline, a small violet "Default" tag on the right. **Selected style** (user changed it): the same, with a solid
  `--accent` outline and no tag.
- **Guest amount**: a single "5" pill with a lock icon; tapping it shows the "please register" toast (FR-L6).
- The "Same language: the back shows an explanation" note (FR-L5) appears under the language fields when they match.
- The large **Start** button (accent color, pressable ledge) sits under the fields, with the "N new cards available"
  line just above it.

### 9.6 Typography
- **Rubik** (Latin + Hebrew), self-hosted via `@fontsource/rubik` (no external font requests; keeps the CSP strict).
- Item text (front): `clamp(2rem, 6vw, 3.5rem)`, weight 600. Answer lines (back): `clamp(1.5rem, 4.5vw, 2.25rem)`;
  long explanation lines step down to `1.125rem–1.25rem`. Hints, synonyms and the literal meaning: 1.125rem on every screen (raised from 1rem on phones at the owner's request), `--text-muted`.
- Every piece of content text gets `dir` and `lang` from its language (`he` → `rtl`). The UI chrome stays LTR English.

### 9.7 Layouts
- **Landing**: header (logo "MyVocab", sign-in / avatar, an "Admin" link for admins as a full-page navigation); hero
  ("Learn words that stick: one loop at a time"); How it works (1. Pick languages and a topic, or just press Start ·
  2. Use Hints or Flip, then mark what you know · 3. Repeat until nothing is left); Start card; footer (Privacy,
  GitHub). **The landing page never shows real vocabulary** (illustrations use made-up or generic examples).
- **Loop header**: the MyVocab logo mark (two stacked cards) and the progress `Cycle 1 • Card 2/10 • 1 known` on the
  left; on the right, on desktop a "⌨ Keyboard shortcuts" link that opens a small popover listing the shortcuts, and
  "← Home" (asks before stopping the loop, FR-L30a).
- **Loop buttons**: on desktop, one row under the card, in this order: `Stop · Hints · Know · Don't know · Next`
  (round, round, pill, pill, round). Flip is on the card itself.
- **Loop (mobile, 360–767px)**: the flip card fills the space above; the buttons form a **sticky bottom bar** in the
  thumb zone, in two rows: the wide **Know** and **Don't know** pills (with their labels) on top, and the round
  `Stop · Hints · Next` (with captions) below, so the two main actions stay big. The Undo bar floats above it.
- **Loop (desktop ≥ 768px)**: a centered column of about 1100px; the card is wide (≈ 2.3 : 1) and the pills carry
  their labels.
- **Cycle break / Summary**: a glassy card with large numbers and the 3D buttons.
- **Toasts**: bottom-center on mobile (above the button bar), top-right on desktop (below the header, clear of the
  loop buttons); auto-dismiss; `aria-live="polite"`.
- **Admin**: a left sidebar (collapses into a top menu on mobile); content max width about 1100px.

### 9.8 Microcopy (centralized in `apps/web/src/strings.ts`)
All UI strings live in one module, keyed (e.g. `loop.know = "Know"`, `loop.hints = "Hints"`, `loop.flip = "Flip"`,
`card.multipleMeanings = "Multiple meanings"`, `setup.sameLanguageNote = "Same language: the back shows an
explanation"`, `setup.guestAmountToast = "Please register in order to choose a larger amount of cards."`), so a
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
│  │     │  ├─ loop/              loop screen, FlipCard, useLoop (wraps core reducer), undo bar, known queue
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
│     │  │                        CategoryService, UserAdminService, SettingsService, AuditService, TrashService,
│     │  │                        UsageLimitService
│     │  ├─ repositories/
│     │  │  ├─ interfaces/        ItemRepository, KnownItemRepository, CategoryRepository, UsageRepository, …
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
├─ docs/DECISIONS.md              ADR-style log of implementation decisions
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
  type ItemType = 'word' | 'expr';
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
  `KNOW | DONT_KNOW | SHOW_HINTS | FLIP | NEXT | CONTINUE | UNDO_KNOW | STOP`. State includes `phase` (`deciding |
  revealed | cycleBreak | finished | stopped`), `side` (`front | back`) and `hintsShown` (boolean, current card).
  `FLIP` only toggles `side`; `SHOW_HINTS` only sets `hintsShown` and is ignored unless `side = front`; neither changes
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

CREATE TABLE categories (
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
  type               TEXT NOT NULL CHECK (type IN ('word','expr')),
  multiple_meanings  INTEGER NOT NULL DEFAULT 0 CHECK (multiple_meanings IN (0,1)),
  translation        TEXT NOT NULL DEFAULT '{}',   -- JSON object { "<lang>": ["…", …] }; never the item's own lang
  literal            TEXT NOT NULL DEFAULT '{}',   -- same shape: word-for-word meaning (D-016); never own lang
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
  CHECK (json_valid(translation) AND json_type(translation) = 'object'),
  CHECK (json_extract(translation, '$."' || lang || '"') IS NULL),  -- no translation into the item's own language
  CHECK (json_valid(literal) AND json_type(literal) = 'object'),
  CHECK (json_extract(literal, '$."' || lang || '"') IS NULL),
  CHECK (json_valid(explanation) AND json_type(explanation) = 'array'),
  CHECK (json_valid(synonyms)    AND json_type(synonyms)    = 'array'),
  CHECK (json_valid(hints)       AND json_type(hints)       = 'array')
);
CREATE UNIQUE INDEX ux_items_identity ON items(lang, normalized_text, type) WHERE deleted_at IS NULL;
CREATE INDEX ix_items_playable ON items(lang, type) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX ix_items_trash    ON items(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE item_categories (
  item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, category_id)
) WITHOUT ROWID;
CREATE INDEX ix_item_categories_cat ON item_categories(category_id, item_id);

-- Known memory: one row per user + item. It hides the item in every direction.
CREATE TABLE user_known_items (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  known_target    TEXT NOT NULL,                       -- target language it was marked in (display only)
  known_in_cycle  INTEGER NOT NULL CHECK (known_in_cycle >= 1),
  known_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
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
   - `item_categories`, `user_known_items` and `usage_counters` are `WITHOUT ROWID`, so the primary key *is* the table
     (one write instead of two);
   - every child column used by `ON DELETE CASCADE` has an index (otherwise SQLite scans the whole child table for each
     deleted parent): `item_categories` via its primary key, `user_known_items.item_id` via `ix_known_item`;
   - if Drizzle/drizzle-kit can't express `WITHOUT ROWID` reliably (including when it rebuilds a table in a later
     migration), use normal tables and record it in `docs/DECISIONS.md`.
4. **Loop selection reads as little as possible** (§11.3): it uses `ix_items_playable`, starts from `item_categories`
   when a category is chosen, checks playability on the candidate row itself (no extra lookups), and returns the
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
-- General (no category). The service inserts the answer condition from the AnswerStrategy (§10.4):
--   different languages:  json_array_length(i.translation, '$."' || :tgt || '"') > 0
--   same language:        json_array_length(i.explanation) > 0
SELECT i.id, i.text, i.lang, i.type, i.multiple_meanings, i.translation, i.explanation, i.synonyms, i.hints
FROM items i
WHERE i.lang = :src AND i.type = :type
  AND i.status = 'published' AND i.deleted_at IS NULL          -- served by ix_items_playable
  AND <answer condition>
  AND (:userId IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_known_items k WHERE k.user_id = :userId AND k.item_id = i.id))
ORDER BY RANDOM()
LIMIT :n;

-- With a category, start from its links so only that category's items are read:
--   FROM item_categories ic JOIN items i ON i.id = ic.item_id
--   WHERE ic.category_id = :categoryId AND <the same conditions>
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
| GET | `/meta` | `{ languages[], categories[], types: [{ id: 'word', label: 'Words' }, { id: 'expr', label: 'Expressions' }], defaults: { sourceLang, targetLang, categoryId, type, size }, sizeOptions, guest: { enabled, loopSize }, undoWindowSeconds, maintenance, turnstileSiteKey }` |
| GET | `/loops/available?source&target&type&categoryId` | `{ available: number }` (excludes known items if signed in) |
| POST | `/loops` | Body `{ source, target, type: 'word' \| 'expr', categoryId: number \| null, size?, turnstileToken? }` → `{ requested, returned, cards: CardView[] }` |

```ts
type Dir = 'ltr' | 'rtl';
type CardView = {
  itemId: number;
  type: 'word' | 'expr';
  direction: { source: LangCode; target: LangCode };
  multipleMeanings: boolean;                              // shows the badge on the front
  front: { text: string; lang: LangCode; dir: Dir };      // the item text
  answer: {                                               // composed by the server (§6.3)
    kind: 'translation' | 'explanation';
    lines: string[];                                      // translation[target] or explanation, in order
    numbered: boolean;                                    // explanation with 2+ lines
    literal: string[];                                    // literal[target] for a translation, else [] (D-016)
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
- Common: languages active; category active (or null); `guests.enabled` / maintenance respected; `EntitlementService`
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
| POST | `/me/known` | Body `{ items: { itemId, target, cycle }[] }` (≤ 100). Idempotent upsert, keeps the earliest `known_at` |
| DELETE | `/me/known/:itemId` | Remove one (undo or return to loops) |
| POST | `/me/known/restore` | Body `{ itemIds: number[] }` (≤ 500) **or** `{ filter: { q?, lang?, type?, categoryId? } }` → `{ restored }` |
| GET | `/me/known?q&lang&type&categoryId&sort&cursor` | Paginated known items |

`user_id` is **always** taken from the session, never from the request.

### 12.4 Admin (requires an admin role **and** a valid Cloudflare Access JWT)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Dashboard counts |
| GET / POST | `/admin/items` | List (filters, pagination) / create `{ lang, text, type, multipleMeanings?, status?, categoryIds?, translation?, explanation?, synonyms?, hints? }` |
| GET | `/admin/items/:id` | The full item (§8.1 shape) + `version` + `categoryIds` + warnings |
| PATCH | `/admin/items/:id` | `{ version, text?, type?, multipleMeanings?, status?, categoryIds?, translation?, explanation?, synonyms?, hints? }`. A list field replaces that whole list (`translation` replaces the whole object). `lang` is not accepted. → the updated item with its new `version`; 409 `CONFLICT` on a stale `version` |
| DELETE | `/admin/items/:id` | Soft delete → Trash |
| GET | `/admin/items/:id/preview` | `CardView[]` for every direction (the same `buildCard` as `POST /loops`) |
| GET | `/admin/trash` | Trashed items, with purge times |
| POST | `/admin/trash/:id/restore` | Restore (409 if a duplicate exists) |
| DELETE | `/admin/trash/:id` | Purge now (body `{ confirm: "PURGE" }`) |
| GET / POST / PATCH / DELETE | `/admin/categories[/:id]` | CRUD (delete blocked if in use) |
| PUT | `/admin/categories/order` | `{ ids: number[] }` |
| GET / PATCH | `/admin/languages[/:code]` | List / toggle `isActive` |
| GET | `/admin/users?q&cursor` | List users |
| PATCH | `/admin/users/:id` | `{ role?: 'user' \| 'admin', banned?: boolean, banReason?: string }` (rules in FR-A41/42) |
| GET / PUT | `/admin/settings` | Typed settings object |
| GET | `/admin/import/template` | CSV template download (header + 2 illustrative rows) |
| POST | `/admin/import?dryRun=true\|false&createMissingCategories=true\|false` | multipart `file` → report |
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
  with the same cookie semantics. Record the choice in `docs/DECISIONS.md`.

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
| Accessibility | WCAG 2.2 AA: contrast, visible focus, full keyboard operation, ARIA labels/live regions (announce Undo, flip side, hints shown, cycle changes, toasts), `prefers-reduced-motion` respected (no 3D flip; crossfade instead). The default/selected field styles are not conveyed by color alone (the "Default" tag + outline style) |
| Browsers | The last 2 versions of Chrome, Edge, Firefox and Safari; iOS Safari 16+; Android Chrome |
| RTL | Correct rendering of Hebrew content (and mixed Hebrew/English) via per-element `dir`/`lang` on both card faces |
| Reliability | Known marks are never lost silently (persistent queue + retries) |
| Database budget | Stays within the D1 free tier by design (§11.2) |
| Cost | Runs on the Cloudflare Workers Free (+ Turnstile, Access free tiers) and GitHub Free plans. Upgrade path: Workers Paid ($5/mo) |
| Observability | Workers logs (structured JSON, request id, no content), Cloudflare Web Analytics, audit log for admin actions and limit events |
| Maintainability | Strict TS, lint clean, `packages/core` coverage ≥ 90%, ADR log in `docs/DECISIONS.md` |
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
| Unit | Vitest | Every `loopReducer` transition: Know/Don't know/Show hints/Flip/Next/Continue/Stop; `FLIP` toggles `side` any number of times in both phases and never changes grading; `SHOW_HINTS` works only on the front, is one-way for the card, resets on the next card and never changes grading; `DONT_KNOW` on the front sets `side = back`; new cards start on the front with hints hidden; cycle building; the **order differs** rule (seeded RNG); Undo during a cycle, at a cycle break, and after finishing; only the latest Know is undoable. Answer strategies (translation vs explanation chosen by same/different languages, playability, line order, numbering); `buildCard` output; item validation (no same-language translation, list limits, duplicates, `lang` absent from the update schema); multiple-meanings warnings; the mixed-script check; `normalize`; CSV row validation (incl. `translation_<code>` columns and the own-language column rule), merge planning (incl. the `multiple_meanings` OR rule), **CSV serializer**; start-card defaults resolution (settings → defaults; guest size = 5) |
| Integration | Vitest + `@cloudflare/vitest-pool-workers` (local D1, migrations applied) | Loop selection by type/category/direction (translation vs explanation playability; the SQL rule agrees with `isPlayable` on fixtures); known items excluded **in every direction**; the DB CHECK rejects a same-language translation even through a direct repository write; item PATCH with a stale `version` → 409 and **no** audit row; **guest size forced to 5 even if a larger size is sent**; **guest without/with an invalid Turnstile token → 403 and zero D1 writes**; guest hourly cap → 429 with zero writes after the first `limit.exceeded` entry; learner daily cap → 429 with remaining allowance; admin exempt from caps; learner size must be in `sizeOptions`; admin endpoints → 401 guest / 403 user / 403 admin without an Access JWT in production mode / 403 on an email mismatch; item create/update + audit rows (before/after of changed lists); Trash: delete hides from loops and known lists, restore brings known marks back, restore blocked on a duplicate, purge cascades + snapshot; CSV dry run vs commit, merge rules, error and warning rows; idempotent `POST /me/known`; user A can't touch user B's known rows; `/api/*` responses carry `noindex` + `no-store` headers; settings validation (defaults must be active languages, etc.) |
| Scripts | Vitest (Node) against a local D1 | `db:seed` falls back to `seed/sample.csv` when `CONTENT_DIR` is missing; **export round-trip**: seed → `db:export --local --content-only` → import into an empty D1 → identical content; full export produces `manifest.json` row counts that match the tables, valid JSON per table (item lists as real arrays/objects), and a `schema.sql` that recreates the schema in a fresh SQLite |
| Guard | CI | `check:no-vocabulary` fails on a committed non-fixture `.csv`/`.sql`/export, or a `seed/sample.csv` over 20 rows |
| Component | Vitest + Testing Library | Button states per phase (incl. Hints only on an unrevealed front); FlipCard (button/tap/keyboard toggling, hints section on the front after Hints and always on the back, multiple-meanings badge, numbered explanation lines, hidden face `inert`, live-region text, reduced-motion path); start card default vs selected styling + "Reset to defaults" + same-language note; guest locked amount + toast (auto once per session, on tap); Undo bar timing and truncation; ListEditor add/edit/delete/reorder + 409 handling; RTL rendering on both faces |
| E2E | Playwright (mobile 390×844 + desktop 1280×800) | Guest: landing → press Start without changing anything (defaults EN→HE, General, Words) → 5-card loop to the summary (incl. Hints on the front, then Flip showing hints on the back, Flip back and forth by button and by tapping the card, Know from the back side, Don't know → auto-flip → Next, Know → Undo); guest sees the register toast and can't change the amount. Signed-in (test session): choose 20 → loop; Know → appears in My known words → no longer offered in the other direction → Return to loops → available again. Admin: create an item with translations, explanation, synonyms, hints and multiple meanings; preview both directions; delete to Trash; restore. CSV: dry run with errors and warnings, then commit |
| Manual (post-deploy) | Phone + desktop | Play a loop (check the flip and hints feel on a real phone); guest Turnstile works invisibly; sign in; known list; `/admin` → Cloudflare Access asks for a one-time code; a non-admin email is refused by Access; a normal user calling `/api/admin/*` → 403; `pnpm db:export` and `--content-only` work from the owner's machine; the D1 dashboard shows rows read/written well within the free tier |

CI fails on lint, type or test errors, a guard failure, or if `packages/core` coverage < 90%.

---

## 18. Milestones
| # | Milestone | Key deliverables |
|---|---|---|
| M0 | Scaffold | Monorepo, strict TS, ESLint/Prettier, Vitest, CI (+ `check:no-vocabulary`), Worker serving the SPA shell + `/api/health`, tokens + Button3D |
| M1 | Core domain | Loop reducer (`FLIP`/`side`, `SHOW_HINTS`/`hintsShown`), shuffle, answer strategies + `buildCard`, item validation rules, normalization + mixed-script check, CSV row schema + merge planner + serializer, setup defaults resolution, ≥ 90% coverage |
| M2 | Database & content | Drizzle schema + migrations per §11 (JSON list columns + CHECKs, partial indexes, `WITHOUT ROWID` where supported, cascade indexes), repositories, `CsvImportService`, `seed/sample.csv` (synthetic), `pnpm db:seed` (`CONTENT_DIR` + fallback), the starter set + README written to `../MyVocab-Content/` (private, outside the public repo) |
| M3 | Learning experience | `/meta`, `/loops/available`, `/loops` (guest rules, Turnstile before writes, usage limits); landing, start card (defaults, default/selected styling, same-language note, guest lock + toast), **FlipCard** with Hints + loop screen, cycle break, summary; guest E2E |
| M4 | Auth & known items | Better Auth Google, `/me`, known endpoints (per item), known queue + Undo, My known words, account deletion, privacy page, learner amounts + daily cap |
| M5 | Admin | Both locks, dashboard, item editor (fixed language, translations per other language, explanation, synonyms, hints, multiple meanings, warnings) + ListEditor + optimistic concurrency + flip-card preview, categories, languages, users, settings (incl. defaults and limits), audit log, Trash + cron |
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
  categories). Provider candidates: Paddle or Lemon Squeezy (merchant of record, which handles VAT) or Stripe.
- **AI content**: `ContentGenerator` using the Claude API to suggest items, translations, explanations, hints and
  synonyms as `draft`s for admin review (an explicit owner decision about sending content to an AI provider).
- **More languages**: insert into `languages` + content; UI localization via an i18n library replacing `strings.ts`.
- **Learning science**: session history, per-word statistics, spaced repetition, "review known words" loops.
- **Content ops**: bulk edit, duplicate finder, "replace" import mode (overwrite instead of append).
- **Platform**: PWA/offline mode, custom domain, light theme.
