import {
  CELLS,
  applyMove,
  candidateId,
  getAllLegalMoves,
  getWinner,
  keyOf,
  otherPlayer,
  type Board,
  type CandidateMove,
  type Player,
  type Scores,
} from "./engine.ts";

export type Difficulty = "easy" | "medium" | "hard";
export type MoveReason = "captures" | "pushes" | "improves_center" | "joins_group" | "escapes_edge" | "keeps_options";
export type ComputerChoice = { move: CandidateMove; score: number; reasons: MoveReason[]; examined: number };

export const PROFILES: Record<Difficulty, { depth: number; width: number; variety: number }> = {
  easy: { depth: 1, width: 12, variety: 4 },
  medium: { depth: 2, width: 14, variety: 2 },
  hard: { depth: 3, width: 18, variety: 1 },
};

function centerDistance({ q, r }: { q: number; r: number }) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function boardFeatures(board: Board, player: Player) {
  const pieces = CELLS.filter((coord) => board[keyOf(coord)] === player);
  const center = pieces.reduce((sum, coord) => sum + (4 - centerDistance(coord)), 0);
  const edge = pieces.filter((coord) => centerDistance(coord) === 4).length;
  let links = 0;
  for (const coord of pieces) {
    for (const neighbor of [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }]) {
      if (board[keyOf({ q: coord.q + neighbor.q, r: coord.r + neighbor.r })] === player) links += 1;
    }
  }
  return { pieces: pieces.length, center, edge, links };
}

export function evaluatePosition(board: Board, scores: Scores, perspective: Player): number {
  const opponent = otherPlayer(perspective);
  const winner = getWinner(scores);
  if (winner === perspective) return 1_000_000;
  if (winner === opponent) return -1_000_000;
  const own = boardFeatures(board, perspective);
  const enemy = boardFeatures(board, opponent);
  const captureValue = (scores[perspective] - scores[opponent]) * 12_000;
  const materialValue = (own.pieces - enemy.pieces) * 4_000;
  const positionValue = (own.center - enemy.center) * 20 + (own.links - enemy.links) * 13 - (own.edge - enemy.edge) * 24;
  return captureValue + materialValue + positionValue;
}

function movePriority(board: Board, scores: Scores, player: Player, move: CandidateMove) {
  const result = applyMove(board, move.selected, player, scores, move);
  return evaluatePosition(result.board, result.scores, player) + move.opponents.length * 800 + result.captured * 20_000;
}

/** The candidate moves the search considers, best-first. Exported for tests. */
export function orderedMoves(board: Board, scores: Scores, player: Player, width: number) {
  return getAllLegalMoves(board, player)
    .map((move) => ({ move, priority: movePriority(board, scores, player, move) }))
    .sort((a, b) => b.priority - a.priority || candidateId(a.move).localeCompare(candidateId(b.move)))
    .slice(0, width)
    .map(({ move }) => move);
}

function positionKey(board: Board, scores: Scores, player: Player, depth: number) {
  return `${Object.entries(board).sort(([a], [b]) => a.localeCompare(b)).map(([cell, owner]) => `${cell}:${owner[0]}`).join("|")}/${scores.black}-${scores.white}/${player}/${depth}`;
}

/**
 * A cached search result. Alpha-beta cut-offs only prove a bound, so each entry records whether its
 * value is exact, a lower bound (the true value is at least this), or an upper bound (at most this).
 */
type CacheEntry = { value: number; bound: "exact" | "lower" | "upper" };
export type SearchCache = Map<string, CacheEntry>;

/** Alpha-beta minimax with a bound-aware cache. Exported for tests. */
export function search(
  board: Board,
  scores: Scores,
  player: Player,
  perspective: Player,
  depth: number,
  width: number,
  alpha: number,
  beta: number,
  cache: SearchCache,
  counter: { value: number },
): number {
  counter.value += 1;
  if (depth === 0 || getWinner(scores)) return evaluatePosition(board, scores, perspective);
  const key = positionKey(board, scores, player, depth);
  const cached = cache.get(key);
  if (cached) {
    if (cached.bound === "exact") return cached.value;
    if (cached.bound === "lower") alpha = Math.max(alpha, cached.value);
    else beta = Math.min(beta, cached.value);
    if (alpha >= beta) return cached.value;
  }
  const alphaAtEntry = alpha;
  const betaAtEntry = beta;
  const moves = orderedMoves(board, scores, player, width);
  if (!moves.length) return evaluatePosition(board, scores, perspective);
  const maximizing = player === perspective;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const result = applyMove(board, move.selected, player, scores, move);
    const score = search(result.board, result.scores, otherPlayer(player), perspective, depth - 1, width, alpha, beta, cache, counter);
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  const bound = best <= alphaAtEntry ? "upper" : best >= betaAtEntry ? "lower" : "exact";
  cache.set(key, { value: best, bound });
  return best;
}

function explain(board: Board, scores: Scores, player: Player, move: CandidateMove): MoveReason[] {
  const before = boardFeatures(board, player);
  const result = applyMove(board, move.selected, player, scores, move);
  const after = boardFeatures(result.board, player);
  const reasons: MoveReason[] = [];
  if (result.captured) reasons.push("captures");
  else if (move.opponents.length) reasons.push("pushes");
  if (after.center > before.center) reasons.push("improves_center");
  if (after.links > before.links) reasons.push("joins_group");
  if (after.edge < before.edge) reasons.push("escapes_edge");
  if (!reasons.length) reasons.push("keeps_options");
  return reasons.slice(0, 2);
}

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === "string" && (DIFFICULTIES as string[]).includes(value);

/** Every candidate move with its search score, best first. Deterministic; exported for tests. */
export function rankMoves(board: Board, scores: Scores, player: Player, difficulty: Difficulty, counter = { value: 0 }) {
  const profile = PROFILES[isDifficulty(difficulty) ? difficulty : "medium"];
  const cache: SearchCache = new Map();
  return orderedMoves(board, scores, player, profile.width).map((move) => {
    const result = applyMove(board, move.selected, player, scores, move);
    const score = search(result.board, result.scores, otherPlayer(player), player, profile.depth - 1, profile.width, -Infinity, Infinity, cache, counter);
    return { move, score };
  }).sort((a, b) => b.score - a.score || candidateId(a.move).localeCompare(candidateId(b.move)));
}

export function chooseComputerMove(board: Board, scores: Scores, player: Player, difficulty: Difficulty): ComputerChoice | null {
  const profile = PROFILES[isDifficulty(difficulty) ? difficulty : "medium"];
  const counter = { value: 0 };
  const ranked = rankMoves(board, scores, player, difficulty, counter);
  if (!ranked.length) return null;
  const bestCaptures = applyMove(board, ranked[0].move.selected, player, scores, ranked[0].move).captured > 0;
  const pool = bestCaptures ? ranked.slice(0, 1) : ranked.slice(0, Math.min(profile.variety, ranked.length));
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return { ...selected, reasons: explain(board, scores, player, selected.move), examined: counter.value };
}

export const reasonText: Record<MoveReason, string> = {
  captures: "wins a marble immediately",
  pushes: "creates useful pressure",
  improves_center: "improves central control",
  joins_group: "connects the formation",
  escapes_edge: "moves away from the edge",
  keeps_options: "keeps several replies available",
};
