export type Player = "black" | "white";
export type Coord = { q: number; r: number };
export type Direction = Coord & { label: string };
export type Board = Record<string, Player>;
export type Scores = Record<Player, number>;
export type Snapshot = { board: Board; currentPlayer: Player; scores: Scores };
export type LegalMove = { direction: Direction; destinations: Coord[]; opponents: Coord[] };
export type CandidateMove = LegalMove & { selected: Coord[] };
export type MoveResult = { board: Board; scores: Scores; captured: number };
export type SetupId = "standard" | "belgian-daisy" | "german-daisy";
export type SetupDefinition = { id: SetupId; name: string; note: string; black: number[]; white: number[] };
export type MoveRecord = { selected: string[]; direction: number; player: Player; captured: number };
export type GameRecord = { version: 1; setup: SetupId; moves: MoveRecord[] };
export type ReplayState = { board: Board; scores: Scores; currentPlayer: Player };

export const RADIUS = 4;
export const WINNING_SCORE = 6;
export const DIRECTIONS: Direction[] = [
  { q: 1, r: 0, label: "right" },
  { q: 0, r: 1, label: "down right" },
  { q: -1, r: 1, label: "down left" },
  { q: -1, r: 0, label: "left" },
  { q: 0, r: -1, label: "up left" },
  { q: 1, r: -1, label: "up right" },
];

export const PLAYER_NAMES: Record<Player, string> = { black: "Onyx", white: "Pearl" };

export const keyOf = ({ q, r }: Coord) => `${q},${r}`;
export const add = (a: Coord, b: Coord): Coord => ({ q: a.q + b.q, r: a.r + b.r });
export const same = (a: Coord, b: Coord) => a.q === b.q && a.r === b.r;
export const otherPlayer = (player: Player): Player => player === "black" ? "white" : "black";
export const isInside = ({ q, r }: Coord) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= RADIUS;

export const CELLS: Coord[] = Array.from({ length: RADIUS * 2 + 1 }, (_, row) => {
  const r = row - RADIUS;
  const qMin = Math.max(-RADIUS, -r - RADIUS);
  const qMax = Math.min(RADIUS, -r + RADIUS);
  return Array.from({ length: qMax - qMin + 1 }, (_, index) => ({ q: qMin + index, r }));
}).flat();

export const SETUPS: Record<SetupId, SetupDefinition> = {
  standard: {
    id: "standard",
    name: "Standard",
    note: "Classic opposing formations",
    black: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15],
    white: [45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
  },
  "belgian-daisy": {
    id: "belgian-daisy",
    name: "Belgian Daisy",
    note: "Open, tactical tournament formation",
    black: [0, 1, 5, 6, 7, 12, 13, 47, 48, 53, 54, 55, 59, 60],
    white: [3, 4, 8, 9, 10, 15, 16, 44, 45, 50, 51, 52, 56, 57],
  },
  "german-daisy": {
    id: "german-daisy",
    name: "German Daisy",
    note: "Distributed formation with early contact",
    black: [5, 6, 11, 12, 13, 19, 20, 40, 41, 47, 48, 49, 54, 55],
    white: [9, 10, 15, 16, 17, 23, 24, 36, 37, 43, 44, 45, 50, 51],
  },
};

export function createInitialBoard(setupId: SetupId = "standard"): Board {
  const board: Board = {};
  const setup = SETUPS[setupId];
  setup.black.forEach((index) => { board[keyOf(CELLS[index])] = "black"; });
  setup.white.forEach((index) => { board[keyOf(CELLS[index])] = "white"; });
  return board;
}

export function lineDirection(group: Coord[]): Coord | null {
  if (group.length < 2) return null;
  const first = group[0];
  for (const axis of DIRECTIONS.slice(0, 3)) {
    const onAxis = group.every((coord) => {
      const dq = coord.q - first.q;
      const dr = coord.r - first.r;
      return axis.q === 0 ? dq === 0 : axis.r === 0 ? dr === 0 : dq === -dr;
    });
    if (!onAxis) continue;
    if (group.length === 2 && DIRECTIONS.some((step) => same(add(first, step), group[1]))) return axis;
    if (group.length === 3) {
      const keys = new Set(group.map(keyOf));
      if (group.some((middle) => keys.has(keyOf(add(middle, axis))) && keys.has(keyOf(add(middle, { q: -axis.q, r: -axis.r }))))) return axis;
    }
  }
  return null;
}

export const isValidGroup = (group: Coord[]) => group.length <= 1 || lineDirection(group) !== null;

export function legalMoves(board: Board, selected: Coord[], player: Player): LegalMove[] {
  if (!selected.length || !isValidGroup(selected)) return [];
  if (selected.some((coord) => board[keyOf(coord)] !== player)) return [];
  const selectedKeys = new Set(selected.map(keyOf));
  const axis = lineDirection(selected);

  return DIRECTIONS.flatMap((direction): LegalMove[] => {
    const inline = selected.length === 1 || (axis !== null && (
      same(direction, axis) || same(direction, { q: -axis.q, r: -axis.r })
    ));
    if (!inline) {
      const destinations = selected.map((coord) => add(coord, direction));
      return destinations.every(isInside) && destinations.every((coord) => !board[keyOf(coord)])
        ? [{ direction, destinations, opponents: [] }]
        : [];
    }

    const front = selected.find((coord) => !selectedKeys.has(keyOf(add(coord, direction))));
    if (!front) return [];
    const destination = add(front, direction);
    if (!isInside(destination)) return [];
    const occupant = board[keyOf(destination)];
    if (!occupant) {
      return [{ direction, destinations: selected.map((coord) => add(coord, direction)), opponents: [] }];
    }
    if (occupant === player) return [];

    const opponents: Coord[] = [];
    let cursor = destination;
    while (isInside(cursor) && board[keyOf(cursor)] && board[keyOf(cursor)] !== player) {
      opponents.push(cursor);
      cursor = add(cursor, direction);
    }
    if (opponents.length >= selected.length || (isInside(cursor) && Boolean(board[keyOf(cursor)]))) return [];
    return [{ direction, destinations: selected.map((coord) => add(coord, direction)), opponents }];
  });
}

export function applyMove(
  board: Board,
  selected: Coord[],
  player: Player,
  scores: Scores,
  requestedMove: LegalMove,
): MoveResult {
  const move = legalMoves(board, selected, player).find((candidate) => same(candidate.direction, requestedMove.direction));
  if (!move) throw new Error("Cannot apply an illegal move");

  const nextBoard = { ...board };
  selected.forEach((coord) => delete nextBoard[keyOf(coord)]);
  move.opponents.forEach((coord) => delete nextBoard[keyOf(coord)]);
  selected.forEach((coord) => { nextBoard[keyOf(add(coord, move.direction))] = player; });

  let captured = 0;
  [...move.opponents].reverse().forEach((coord) => {
    const destination = add(coord, move.direction);
    if (isInside(destination)) nextBoard[keyOf(destination)] = otherPlayer(player);
    else captured += 1;
  });

  return {
    board: nextBoard,
    scores: { ...scores, [player]: scores[player] + captured },
    captured,
  };
}

export function getPlayerGroups(board: Board, player: Player): Coord[][] {
  const pieces = CELLS.filter((coord) => board[keyOf(coord)] === player);
  const groups: Coord[][] = pieces.map((coord) => [coord]);
  for (const start of pieces) {
    for (const axis of DIRECTIONS.slice(0, 3)) {
      const second = add(start, axis);
      if (board[keyOf(second)] !== player) continue;
      groups.push([start, second]);
      const third = add(second, axis);
      if (board[keyOf(third)] === player) groups.push([start, second, third]);
    }
  }
  return groups;
}

export function getAllLegalMoves(board: Board, player: Player): CandidateMove[] {
  return getPlayerGroups(board, player).flatMap((selected) =>
    legalMoves(board, selected, player).map((move) => ({ ...move, selected })),
  );
}

export function getWinner(scores: Scores): Player | null {
  return scores.black >= WINNING_SCORE ? "black" : scores.white >= WINNING_SCORE ? "white" : null;
}

export function createMoveRecord(selected: Coord[], move: LegalMove, player: Player, captured = 0): MoveRecord {
  const direction = DIRECTIONS.findIndex((candidate) => same(candidate, move.direction));
  if (direction < 0) throw new Error("Cannot record an unknown direction");
  return { selected: selected.map(keyOf), direction, player, captured };
}

export function parseCoord(value: string): Coord {
  const [q, r] = value.split(",").map(Number);
  if (!Number.isInteger(q) || !Number.isInteger(r) || !isInside({ q, r })) throw new Error(`Invalid board coordinate: ${value}`);
  return { q, r };
}

export function replayGame(setup: SetupId, moves: MoveRecord[], limit = moves.length): ReplayState {
  let board = createInitialBoard(setup);
  let scores: Scores = { black: 0, white: 0 };
  let currentPlayer: Player = "black";
  const safeLimit = Math.max(0, Math.min(limit, moves.length));

  for (const record of moves.slice(0, safeLimit)) {
    if (record.player !== currentPlayer) throw new Error("Replay contains an out-of-turn move");
    const selected = record.selected.map(parseCoord);
    const direction = DIRECTIONS[record.direction];
    if (!direction) throw new Error("Replay contains an unknown direction");
    const move = legalMoves(board, selected, currentPlayer).find((candidate) => same(candidate.direction, direction));
    if (!move) throw new Error("Replay contains an illegal move");
    const result = applyMove(board, selected, currentPlayer, scores, move);
    board = result.board;
    scores = result.scores;
    currentPlayer = otherPlayer(currentPlayer);
  }
  return { board, scores, currentPlayer };
}

export function serializeGame(record: GameRecord): string {
  return JSON.stringify(record);
}

const COORD_KEY = /^-?\d+,-?\d+$/;

function isMoveRecord(value: unknown): value is MoveRecord {
  if (!value || typeof value !== "object") return false;
  const move = value as Record<string, unknown>;
  return (move.player === "black" || move.player === "white")
    && Number.isInteger(move.direction) && (move.direction as number) >= 0 && (move.direction as number) < DIRECTIONS.length
    && Number.isInteger(move.captured) && (move.captured as number) >= 0
    && Array.isArray(move.selected) && move.selected.length >= 1 && move.selected.length <= 3
    && move.selected.every((key) => typeof key === "string" && COORD_KEY.test(key));
}

/**
 * Parse a shared match record. Anything malformed, including records whose moves are illegal,
 * is rejected with one clear error instead of crashing later.
 */
export function parseGame(value: string): GameRecord {
  const unsupported = () => new Error("Unsupported Sumito match record");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw unsupported();
  }
  if (!parsed || typeof parsed !== "object") throw unsupported();
  const record = parsed as Partial<GameRecord>;
  if (record.version !== 1 || typeof record.setup !== "string" || !Object.hasOwn(SETUPS, record.setup)
    || !Array.isArray(record.moves) || !record.moves.every(isMoveRecord)) {
    throw unsupported();
  }
  try {
    replayGame(record.setup, record.moves);
  } catch {
    throw unsupported();
  }
  return { version: 1, setup: record.setup, moves: record.moves };
}

export function candidateId(move: CandidateMove): string {
  return `${move.selected.map(keyOf).sort().join(";")}|${DIRECTIONS.findIndex((direction) => same(direction, move.direction))}`;
}
