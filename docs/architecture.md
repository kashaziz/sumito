# Architecture

Sumito is a client-heavy web game. The server only renders pages; every rule, move, and AI decision runs in the browser.

## Layers

```text
lib/game/engine.ts   Pure rules: board, legal moves, pushes, captures, replays   (no React, no DOM)
lib/game/ai.ts       Computer opponent: alpha-beta search + move explanations
lib/game/puzzles.ts  Training positions
lib/game/ui.ts       Pure UI geometry: cell positions, swipe directions, drag lines, motion plans, plate size
        │
app/ai.worker.ts     One long-lived Web Worker for computer moves and hints
app/game/use-ai.ts   Hook that talks to the worker (request ids, main-thread fallback)
        │
app/game/game.tsx    Game state and screens: title, match, tutorial, puzzles, review, result
app/game/board.tsx   Memoised cells, pointer gestures (tap, drag-select, swipe), keyboard, motion
app/game/sheets.tsx  Native <dialog> sheets: match, review, menu, rules, result
app/game/rules.tsx   Illustrated rule cards (SVG)
app/game/motion.ts · sound.ts · celebrate.ts · icons.tsx
        │
app/page.tsx (/), app/learn, app/about, app/privacy    Routes (React Server Components via vinext)
worker/index.ts      Cloudflare Worker: workers.dev → custom-domain redirect, image endpoint, app handler
```

## Rules engine

- The board has 61 cells in axial coordinates `{ q, r }`; `keyOf` turns a cell into `"q,r"`.
- `legalMoves(board, selected, player)` returns every legal direction for a selected line, including the opponents it would push.
- `applyMove` checks legality again and returns the new board, scores, and captures. The UI never mutates a board.
- Games serialise to a compact record (`serializeGame`) used for replays and share links (`?replay=`).
- `research/` holds a Python copy of the rules. `research/fixtures/conformance.json` is read by both the TypeScript and Python tests, so the two stay identical.

## Computer opponent

See [ai-opponent.md](ai-opponent.md). Search runs in the Web Worker, so the board stays responsive. The game waits at least 350 ms before showing a computer move, so a player can follow it.

## UI and motion

- One full-height CSS grid per orientation (portrait, phone landscape, desktop). The board is sized with container queries.
- Moves animate with the Web Animations API from a `motionPlan` (moved, pushed, and fallen marbles); only `transform` and `opacity` change.
- During a rotation, `html[data-rotating]` pauses transitions for 450 ms, so nothing slides between layouts.
- Settings and small history live in `localStorage`. There is no server state.

See [STYLE.md](../STYLE.md) for tokens, layout rules, and motion timings.

## Build and deploy

- [vinext](https://github.com/cloudflare/vinext) builds the Next.js-style `app/` directory for Vite and Cloudflare Workers.
- `npm run deploy` sets `SUMITO_DEPLOY=cloudflare`, builds, and runs `wrangler deploy`. An optional `SUMITO_CUSTOM_DOMAIN` adds a custom-domain route and the `workers.dev` redirect.
- `public/sw.js` is a small service worker: network-first for pages, cache-first for hashed assets.

## Tests

| Layer | Command | What it covers |
|---|---|---|
| Engine | `npm run test:engine` | Rules, setups, replays, AI legality, puzzles, Python conformance fixtures |
| UI geometry | `npm run test:ui` | Hit-testing, swipe snapping, drag lines, motion plans, holes inside the plate |
| Research | `npm run test:research` | Python rules core and baselines |
| Rendered HTML | part of `npm test` | Server-rendered routes and key content |
| Browser QA | `npm run qa:mobile` | Real headless Chrome: layouts, gestures, motion, sound, panels, safe areas |

## Not built yet

Accounts, saved scores, and online rooms. The plan: real sign-in first, then Cloudflare D1 for scores and history, then Durable Objects with WebSockets for rooms, with every move checked by the same engine on the server.
