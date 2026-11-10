import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, chooseComputerMove, evaluatePosition, orderedMoves, rankMoves, search, type Difficulty, type SearchCache } from "../lib/game/ai.ts";
import { SETUPS, applyMove, candidateId, createInitialBoard, getAllLegalMoves, getWinner, otherPlayer, type Board, type Player, type Scores, type SetupId } from "../lib/game/engine.ts";

type Position = { board: Board; scores: Scores; player: Player; label: string };

/** Small seeded generator so the test positions are the same on every run. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function positions(): Position[] {
  const found: Position[] = [];
  (Object.keys(SETUPS) as SetupId[]).forEach((setup, index) => {
    const random = seeded(17 + index * 101);
    let board = createInitialBoard(setup);
    let scores: Scores = { black: 0, white: 0 };
    let player: Player = "black";
    for (let ply = 1; ply <= 40 && !getWinner(scores); ply += 1) {
      const moves = getAllLegalMoves(board, player);
      // Prefer pushes now and then, so positions include contact and captures.
      const pushes = moves.filter((move) => move.opponents.length);
      const pool = pushes.length && random() < 0.5 ? pushes : moves;
      const move = pool[Math.floor(random() * pool.length)];
      const result = applyMove(board, move.selected, player, scores, move);
      board = result.board;
      scores = result.scores;
      player = otherPlayer(player);
      if ([8, 16, 24, 32, 40].includes(ply)) found.push({ board, scores, player, label: `${setup} ply ${ply}` });
    }
  });
  return found;
}

/** Plain minimax over the same candidate moves: no pruning, no cache. The reference answer. */
function minimax(board: Board, scores: Scores, player: Player, perspective: Player, depth: number, width: number): number {
  if (depth === 0 || getWinner(scores)) return evaluatePosition(board, scores, perspective);
  const moves = orderedMoves(board, scores, player, width);
  if (!moves.length) return evaluatePosition(board, scores, perspective);
  const values = moves.map((move) => {
    const result = applyMove(board, move.selected, player, scores, move);
    return minimax(result.board, result.scores, otherPlayer(player), perspective, depth - 1, width);
  });
  return player === perspective ? Math.max(...values) : Math.min(...values);
}

for (const difficulty of ["medium", "hard"] as Difficulty[]) {
  test(`${difficulty} AI scores every candidate exactly like plain minimax (cache and pruning are safe)`, () => {
    const { depth, width } = PROFILES[difficulty];
    // Hard is slow to check with plain minimax, so it uses a smaller sample.
    const sample = difficulty === "hard" ? positions().slice(0, 6) : positions();
    assert.ok(sample.length >= 6, "enough test positions");
    for (const { board, scores, player, label } of sample) {
      for (const { move, score } of rankMoves(board, scores, player, difficulty)) {
        const result = applyMove(board, move.selected, player, scores, move);
        const expected = minimax(result.board, result.scores, otherPlayer(player), player, depth - 1, width);
        assert.equal(score, expected, `${label}: move ${candidateId(move)} scored ${score}, minimax says ${expected}`);
      }
    }
  });
}

test("an unknown difficulty falls back to medium instead of crashing", () => {
  const board = createInitialBoard();
  const scores = { black: 0, white: 0 };
  const choice = chooseComputerMove(board, scores, "white", "expert" as Difficulty);
  assert.ok(choice, "returns a move");
  assert.deepEqual(rankMoves(board, scores, "white", "expert" as Difficulty).map((entry) => entry.score), rankMoves(board, scores, "white", "medium").map((entry) => entry.score));
});

test("a bound stored after a cut-off is never reused as an exact score", () => {
  const depth = 2;
  const width = PROFILES.hard.width;
  // Find a position where the first-ordered move is not the best one, so a cut-off on it stores a bound.
  const target = positions().find(({ board, scores, player }) => {
    const [first] = orderedMoves(board, scores, player, width);
    if (!first) return false;
    const afterFirst = applyMove(board, first.selected, player, scores, first);
    const firstValue = minimax(afterFirst.board, afterFirst.scores, otherPlayer(player), player, depth - 1, width);
    return minimax(board, scores, player, player, depth, width) > firstValue;
  });
  assert.ok(target, "a position where the first candidate is not the best");
  const { board, scores, player } = target;
  const [first] = orderedMoves(board, scores, player, width);
  const afterFirst = applyMove(board, first.selected, player, scores, first);
  const firstValue = minimax(afterFirst.board, afterFirst.scores, otherPlayer(player), player, depth - 1, width);
  const exact = minimax(board, scores, player, player, depth, width);

  const cache: SearchCache = new Map();
  const counter = { value: 0 };
  // A narrow window (beta = firstValue) cuts off after the first move and caches a lower bound.
  search(board, scores, player, player, depth, width, -Infinity, firstValue, cache, counter);
  // The same cache, now with the full window, must still give the exact minimax value.
  assert.equal(search(board, scores, player, player, depth, width, -Infinity, Infinity, cache, counter), exact);
});
