import { keyOf, type Board, type Coord, type Player, type Scores } from "./engine.ts";

export type PuzzleId = "edge-push" | "two-line" | "find-formation";
export type PuzzleDefinition = {
  id: PuzzleId;
  name: string;
  level: "Starter" | "Tactical" | "Advanced";
  goal: string;
  note: string;
  currentPlayer: Player;
  scores: Scores;
  board: Board;
};

const boardWith = (black: Coord[], white: Coord[]): Board => {
  const board: Board = {};
  black.forEach((coord) => { board[keyOf(coord)] = "black"; });
  white.forEach((coord) => { board[keyOf(coord)] = "white"; });
  return board;
};

export const PUZZLES: Record<PuzzleId, PuzzleDefinition> = {
  "edge-push": {
    id: "edge-push",
    name: "Edge pressure",
    level: "Starter",
    goal: "Push Pearl beyond the right edge in one move.",
    note: "Select both connected Onyx marbles, then move right.",
    currentPlayer: "black",
    scores: { black: 5, white: 0 },
    board: boardWith([{ q: 2, r: 0 }, { q: 3, r: 0 }], [{ q: 4, r: 0 }]),
  },
  "two-line": {
    id: "two-line",
    name: "Three beats two",
    level: "Tactical",
    goal: "Break the two-marble Pearl line and capture the edge marble.",
    note: "Only a full line of three has enough force here.",
    currentPlayer: "black",
    scores: { black: 3, white: 1 },
    board: boardWith(
      [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      [{ q: 3, r: 0 }, { q: 4, r: 0 }],
    ),
  },
  "find-formation": {
    id: "find-formation",
    name: "Diagonal finish",
    level: "Advanced",
    goal: "Find the diagonal three-on-two push that reaches the edge.",
    note: "Read the up-right axis before selecting the attacking line.",
    currentPlayer: "black",
    scores: { black: 4, white: 2 },
    board: boardWith(
      [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 2, r: -2 }, { q: -1, r: 0 }],
      [{ q: 3, r: -3 }, { q: 4, r: -4 }],
    ),
  },
};
