# Sumito style guide

This is the source of truth for how Sumito looks, moves, and reads.
All tokens live at the top of `app/globals.css`. Use them. Do not add raw hex values to components.

> `docs/design.md` describes the older light "editorial" theme. It is kept for history only.

---

## 1. Principles

1. **The board comes first.** On every game screen, the board is the largest thing. Text, panels, and buttons serve it.
2. **One screen, no page scroll.** The game route fits the viewport at 320×568 and up. Extra content opens in a sheet.
3. **Show, then tell.** Prefer a picture, a highlight, or a short motion over a sentence. When text is needed, keep it to one short line.
4. **Mobile first.** Write base CSS for a 320–400px phone. Add `min-width` media queries for bigger screens.
5. **Fast motion only.** Animate `transform` and `opacity`. Every animation respects reduced motion.

---

## 2. Colour tokens

### Stage (game, `/learn`, sheets)

| Token | Value | Use |
|---|---|---|
| `--stage` | `#1b1f20` | Page background on the game and `/learn` |
| `--stage-raised` | `#262b2a` | Cards, buttons, chips, score pill |
| `--stage-line` | `#3d4342` | Borders and dividers on the stage |
| `--stage-text` | `#eef0ec` | Main text on the stage |
| `--stage-muted` | `#a7aeaa` | Secondary text (≈ 7:1 contrast on `--stage`) |
| `--dock` | `#161a1b` | Bottom bar background |
| `--sheet` | `#202525` | Sheet and drawer background |

### Accents

| Token | Value | Meaning |
|---|---|---|
| `--lime` | `#d5f04a` | **"You can act here."** Playable dots, targets, selection ring, primary buttons, the turn marker |
| `--orange` | `#e85e2b` | **"Attention or limit."** Pushable opponent ring, blocked selection, the board edge in pictures, focus outline |

Rule: lime and orange are the only accent hues. Never use them for decoration alone.

### Paper

`--ink #15191a` (text on lime buttons) and `--paper #fbfaf6` (the document background behind the stage). Every page uses the stage palette.

### Marbles

Marbles are CSS radial gradients, not images.

- **Onyx (dark):** `radial-gradient(circle at 34% 28%, #7a8381 0 3%, #424a49 7%, #1c2222 31%, #050707 75%)`
- **Pearl (light):** `radial-gradient(circle at 34% 26%, #fff 0 8%, #f1ede3 19%, #d7d3ca 62%, #8f8c84 100%)`
- Depth comes from one static `box-shadow`. Never animate it.

---

## 3. Typography

| Token | Value | Use |
|---|---|---|
| `--font-display` | `"Cinzel Decorative", "Cinzel", Georgia, serif` | The **Sumito** wordmark only (title screen, `/learn` nav) |
| `--font-heading` | `"Cinzel", Georgia, serif` | Page and section headings on `/learn` |
| `--font-body` | system UI stack | Everything else: labels, body, buttons |

Fonts load once from Google Fonts in `app/layout.tsx` with `display=swap`. If they fail, the serif fallback still reads well.

### Sizes

| Role | Size | Notes |
|---|---|---|
| Wordmark | `clamp(40px, 11vw, 68px)`, weight 900 | White-to-lime vertical gradient, letter-spacing `.06em` |
| `/learn` h1 | `clamp(34px, 8vw, 60px)` | Cinzel 700 |
| `/learn` h2 | `clamp(26px, 5vw, 36px)` | Cinzel 700 |
| Sheet title | 20px, weight 700 | Body font |
| Body (`--text-body`) | 15px, line-height 1.5–1.6 | |
| Label (`--text-label`) | 12px | Bottom-bar labels, chip labels |
| Eyebrow | 11–12px, weight 800, uppercase, letter-spacing `.08–.16em` | Lime on the stage |

**Floor: no visible text below 11px.** The browser QA measures this on every route.

### Copy voice

- Short, active, present tense. One idea per line.
- Name the action: "Tap a marble with a green dot", not "Marbles may be selected".
- Player names: **Onyx** (dark, moves first) and **Pearl** (light). Against the computer: **You** and **AI**.
- Numbers: use digits in UI chips ("0/6", "3 push 2"), words in longer prose ("push six").

---

## 4. Space, shape, and size

| Thing | Value |
|---|---|
| Side gutter on phones | 12–16px (plus `env(safe-area-inset-*)`) |
| Card padding | 10–18px |
| Gaps between cards | 8–12px |
| Radius: chips, pills | `999px` |
| Radius: buttons | 12px |
| Radius: cards | 14–16px |
| Radius: sheets | 20px on the open edge |
| Minimum touch target | **44×44px** (bottom-bar buttons are 56px tall) |
| Top bar max width | 760px, centred |

---

## 5. Layout

### Game route (`/`)

A single `100dvh` grid. Nothing on the page scrolls.

```
┌──────────── hud ────────────┐  ← back/menu · score pill · restart
│           status            │  ← status chip or one coach tip, or the title
│                             │
│            board            │  ← takes all remaining space
│                             │
│            dock             │  ← 4 actions
└─────────── credit ──────────┘  ← title screen only
```

- **Title screen** (`started = false`): wordmark, one-sentence description, the board dimmed and inactive with an idle ripple, dock = Play · How to play · Tutorial · Puzzles, © line.
- **In a match**: dock = Undo · Hint · Review · Match. The top-left button is **Back to start**.
- **Landscape phone** (`orientation: landscape` and `max-height: 540px`): three columns, so the board gets the full height (≈ 378px at 844×390, up from 272px):

```
┌ left (184px) ┬──────── board ────────┬ rail (88px) ┐
│ ‹ back  ↻    │                       │   Undo      │
│ ● Onyx  3/6  │   full-height board   │   Hint      │
│ ○ Pearl 1/6  │                       │   Review    │
│ status / tip │                       │   Match     │
│ ? Rules      │                       │             │
└──────────────┴───────────────────────┴─────────────┘
```

  Left thumb: back, restart, stacked scores (the turn marker moves up and down), status, Rules. Right thumb: the actions. On the title screen the left column holds the name, description, and © line. Sheets slide in from the right; the Play panel splits into two columns so Start is always in view; How to play is a compact 2×2 grid with no scrolling. Rotating keeps the game and jumps straight to the new layout: transitions pause for 450ms (`html[data-rotating]`), so nothing slides between its portrait and landscape spots, and the phone's own rotation animation covers the change.
- **Notch and home bar**: the page uses `viewport-fit=cover` (set in `app/layout.tsx`, because vinext ignores `viewportFit`). Every edge control pads with `env(safe-area-inset-*)`, and the landscape side columns grow by the inset so their content keeps full width.
- **Desktop** (`min-width: 1024px`): the dock is a centred card; sheets become right-side drawers. The How to play drawer is wide (`.sheet.is-wide`) and shows the rules as a 2×2 grid **without scrolling**.

### Board geometry

- Cells sit on a hex grid: step 10.35% horizontally and 8.95% vertically of the board frame (`lib/game/ui.ts`).
- The plate is a regular hexagon: half-width 48.5%, apothem 42% (`PLATE_HALF_WIDTH`, `PLATE_APOTHEM`).
- A unit test checks that **every hole sits fully inside the plate**. If you change sizes, update the constants and the CSS together.

### Sections and sheets

All secondary content opens in a `Sheet` (native `<dialog>`): bottom sheet on phones, right drawer in landscape and on desktop. Never add a permanent side panel to the game route.

Every sheet has a 40px **✕ close button** at the top-right, plus Esc and a backdrop tap. The slide-in runs once per opening (`.is-entering`), so a rotation never replays it.

| Sheet | Opens from |
|---|---|
| New match (mode, opening, difficulty, settings) | Play, Puzzles, Match, tapping the idle board |
| How to play (4 picture cards) | How to play, the "Rules" button |
| Move review | Review |
| Menu (tutorial, learn, about, privacy, source code, settings) | Menu button on the title screen |
| Result | A win |

---

## 6. Components

- **Score pill**: 52px tall, 24px score numbers, 28px marbles (26px under 440px). Both names, scores as `n/6` (the `/6` shows from 440px). A lime marker slides to the side whose turn it is, and stays on the winner after a win. A QA check makes sure names never cut off at 320 or 390px.
- **Result panel**: centred headline in the heading font, a big `6 – 3` score with marbles, one subtitle line, then 2–3 actions with the primary one in lime. Bottom sheet on phones; centred card (`.sheet.is-center`, 460px) on desktop. Puzzles get Next puzzle · Retry · Back to start; matches get Rematch · Review · Share. Colour follows the outcome: a **win** uses a white-to-lime title (it pops in) and a lime leading score; a **loss** uses a white-to-orange title (it settles in) and an orange leading score.
- **Status chip**: one line of state ("Your turn · tap a marble with a green dot"). Puzzles add a lime eyebrow ("Puzzle · Edge pressure").
- **Coach tip**: lime pill that replaces the status chip once per tip. Never covers the board. Off in puzzles and the tutorial.
- **Rule cards** (`app/game/rules.tsx`): picture + numbered title + one sentence. Pictures are SVG drawn with the real marble gradients. Each `RulesCards` instance needs a unique `ids` prefix.
- **Bottom-bar buttons**: icon (22px line icon) over a 12px label. Primary action uses lime for the icon.
- **Buttons on `/learn`** (`.lp-button`): 44px tall, 12px radius; `.is-primary` is lime with ink text.

### Icons

- Line icons in `app/game/icons.tsx`: 24px grid, 2px stroke, round caps and joins, `currentColor`.
- Decorative only (`aria-hidden`). The visible label or `aria-label` carries the meaning.
- Do not mix emoji into bars or buttons.

### Tooltips

- Add `data-tip="…"` to any bar or top-bar button. CSS shows it on mouse hover (after 250ms) and on keyboard focus.
- Tooltip text: a short verb phrase, sentence case ("Take back the last move").
- Touch devices do not show tooltips; the visible label must stand alone.

---

## 7. Motion

| Token | Value |
|---|---|
| `--motion` | `1` normally, `0` for reduced motion (OS setting or the in-app toggle) |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` — arrivals, slides |
| `--ease-back` | `cubic-bezier(.3,1.4,.5,1)` — small pops (selection, score) |

Every duration is written as `calc(<ms> * var(--motion))`. JavaScript reads the same setting through `getMotionScale()` in `app/game/motion.ts`.

| Event | Motion | Time |
|---|---|---|
| Select | Lift 3px + scale 1.05, ring fades in | 140ms |
| Targets | Dots fade/scale in, 15ms stagger | 120ms |
| Move / push | Slide one cell; pushed line starts 40ms later | 220ms |
| Capture | Slide past the edge, drop, shrink, fade; then score pop + 2px board nudge | 420ms |
| Invalid tap | Shake ±4px | 180ms |
| Turn change | Score marker slides | 260ms |
| AI move | Wait ≥350ms, then the normal slide | — |
| Sheet | Slide in from the edge | 260ms in, 200ms out |
| Idle board | Ripple: a soft lime ring glows outward ring by ring | 4.8s loop |
| Win | Headline pops in; ~80 confetti pieces burst from both bottom corners (popover layer above the sheet), then remove themselves | 0.5s / 1.7–2.6s |

Rules:

- Animate only `transform` and `opacity`. Rings, glows, and shadows sit on pseudo-elements and fade.
- A new tap finishes any running animation at once. Input is never blocked.
- Looping animations (the idle ripple) are switched off entirely under reduced motion.

---

## 8. Sound

Sounds are synthesized with the Web Audio API in `app/game/sound.ts`. There are no audio files.

| Event | Sound |
|---|---|
| Move | Soft wooden tap (70ms) |
| Capture | Falling whistle timed to the 420ms drop, then a low thud |
| Win (or puzzle solved) | Rising major arpeggio with a held top note |
| Loss to the AI | Two gentle falling notes, no confetti |

Rules:

- Quiet by default (peak gain ≤ 0.22). Never play a sound without a player action behind it.
- The "Sound effects" setting turns all sound off and is remembered.
- Sound is separate from reduced motion; a player may want one without the other.
- Each sound dispatches a `sumito:sound` event so tests can observe it.

## 9. Accessibility

- Visible focus: 3px orange outline.
- The board uses a roving `tabindex`: one cell in the tab order, arrow keys move, Enter/Space taps, Esc clears.
- Every cell has an `aria-label` ("Onyx marble, available to move").
- Long sentences go to a screen-reader live region; the screen shows the short version.
- Colour is never the only signal: playable marbles also get a dot, targets get a dot or ring, pushes get an orange ring.

---

## 10. Checks before you ship

- `npm test` — engine, UI geometry, product, research, build, and HTML tests.
- `npm run qa:mobile` — real-browser checks at 320×568, 390×844, 844×390, and 1280×800: no page scroll, text ≥ 11px, targets ≥ 44px, board fits, rules sheet fits without scrolling, tooltips, motion, and reduced motion. See the header of `tests/mobile-browser-qa.mjs` for setup.
