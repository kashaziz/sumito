# How the computer opponent works

The AI plays **white**; the human always plays **black**. It is a classic
minimax + alpha-beta engine with a hand-tuned heuristic evaluator, not a
neural network or learned model. All of the logic lives in
`lib/game/ai.ts`, is invoked from a background thread in `app/ai.worker.ts`,
and is wired into the UI in `app/page.tsx`.

## 1. Triggering a move

`app/page.tsx:164-185` runs a `useEffect` that fires whenever:

- `mode === "computer"`
- `currentPlayer === "white"` (i.e. it's the AI's turn)
- the game isn't already won (`!liveWinner`)
- the player isn't reviewing move history (`!reviewing`)

When those conditions hold, it spins up a dedicated **Web Worker**
(`new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" })`)
and posts `{ board, scores, player: "white", difficulty }` to it. The worker
(`app/ai.worker.ts:4-7`) just calls `chooseComputerMove(...)` and posts the
result back — this keeps the search off the main thread so the UI doesn't
freeze during deeper searches.

If the worker throws (`worker.onerror`, page.tsx:175-182), the same
`chooseComputerMove` call is made synchronously on the main thread as a
fallback, so the game never gets stuck waiting on a broken worker.

The returned `ComputerChoice` (`{ move, score, reasons, examined }`) is
applied via `commitMove`, and `reasons` are turned into user-facing text
via `reasonText` (ai.ts:136-143), e.g. "wins a marble immediately",
"improves central control".

## 2. Board evaluation (the heuristic)

`evaluatePosition(board, scores, perspective)` (ai.ts:42-53) scores a
position from one player's point of view:

1. **Terminal check** — if `getWinner(scores)` says the perspective player
   has already won, return `+1,000,000`; if the opponent has won, return
   `-1,000,000`.
2. **Capture differential** — `(myCaptures - theirCaptures) * 12,000`. This
   dominates the score, since captures are the actual win condition
   (first to 6 in this build's `WINNING_SCORE`).
3. **Material differential** — `(myPieces - theirPieces) * 4,000`, from
   `boardFeatures`.
4. **Positional terms**, all derived from `boardFeatures` (ai.ts:29-40):
   - `center`: sum of `(4 - distance from board center)` per piece — reward
     for controlling the middle of the hex board, weight `20`.
   - `links`: count of same-color pieces adjacent along 3 axial directions
     — reward for staying grouped (harder to push off), weight `13`.
   - `edge`: count of pieces sitting on the outermost ring (distance 4 from
     center) — penalized at weight `24`, since edge marbles are one push
     from being knocked out.

So the priority order is: don't lose → capture marbles → keep material →
control center / stay grouped / avoid the edge.

## 3. Move ordering and pruning

Before searching, every legal move is scored once with `movePriority`
(ai.ts:55-58) — the resulting position's `evaluatePosition`, plus bonuses
for pushing opponent pieces (`+800` per piece pushed) and for capturing
(`+20,000`). `orderedMoves` (ai.ts:60-66) sorts by that priority and keeps
only the top `width` candidates (ties broken by a stable move-id string).
This both speeds up alpha-beta (better moves searched first prune more)
and caps the branching factor so search stays fast in the browser.

## 4. The search itself

`search()` (ai.ts:72-103) is a textbook recursive **minimax with
alpha-beta pruning**:

- Recurses until `depth === 0` or the game is won, at which point it
  returns the static `evaluatePosition`.
- At each node it re-generates and re-orders moves (`orderedMoves`) down
  to `width`, alternates maximizing/minimizing depending on whose turn it
  is relative to the AI's `perspective`, and prunes when `beta <= alpha`.
- Results are memoized in a `Map` keyed by a serialized
  `positionKey` (board contents + scores + player + remaining depth), so
  transpositions reached via different move orders aren't re-searched.
- A `counter` object tracks how many nodes were visited (`examined`),
  surfaced back to the UI/worker for diagnostics.

`chooseComputerMove()` (ai.ts:119-134) is the entry point:

1. Get up to `width` ordered candidate moves for the current position.
2. Run `search` one ply deeper (`depth - 1`, since the candidate move
   itself is already applied) on each candidate, from the *opponent's*
   turn but scored from the AI's own perspective.
3. Sort candidates by score.
4. **Forced capture rule**: if the single best-scoring move captures a
   piece, it's always played — no randomization.
5. Otherwise, pick uniformly at random from the top `variety` candidates.
   This is what keeps "easy" mode from being a robotic, always-optimal
   player — it still plays *reasonable* moves (all candidates were already
   filtered/ranked by the heuristic) but with real variety.
6. `explain()` (ai.ts:105-117) compares board features before/after the
   chosen move to generate up to two human-readable `MoveReason`s
   (`captures`, `pushes`, `improves_center`, `joins_group`,
   `escapes_edge`, or the fallback `keeps_options`).

## 5. Difficulty levels

Three profiles in `PROFILES` (ai.ts:19-23) control search depth, breadth,
and randomness — there's no time-based cutoff, just fixed limits per
difficulty:

| Difficulty | Search depth | Candidate width | Variety (top-N random pick) | Feel |
|---|---|---|---|---|
| Easy | 1 ply | 12 | 4 | Shallow lookahead, picks randomly among the top 4 heuristic moves — noticeably weaker and more varied |
| Medium (default) | 2 ply | 14 | 2 | Sees one opponent response ahead, still has some variety |
| Hard | 3 ply | 18 | 1 | Sees two opponent responses ahead, always plays the single best-scoring move |

Difficulty is chosen in the UI via a `<select>` (page.tsx:318, only shown
in `mode === "computer"`) and stored in React state (`difficulty`,
page.tsx:56), defaulting to `medium`.

## 6. Supporting engine details (for context)

`lib/game/engine.ts` provides everything the AI calls into:

- Board = hex grid, axial coordinates `{q, r}`, radius 4, stored as
  `Record<"q,r", Player>`.
- `getAllLegalMoves` generates all legal single-piece and in-line group
  moves, including pushes ("Sumito").
- `applyMove` mutates a board copy, resolves captures, and updates scores.
- `getWinner` returns a player once their score reaches the win threshold.

## Summary

The "AI" is a deterministic search algorithm with a tunable heuristic, run
off the main thread, wrapped with just enough randomness at low/mid
difficulty to feel less mechanical. It's not adaptive or learning — the
same board position and difficulty will explore the same move space every
time, only the final random tie-break among near-equal top moves differs
from game to game.
