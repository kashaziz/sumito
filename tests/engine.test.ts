import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CELLS,
  DIRECTIONS,
  applyMove,
  createInitialBoard,
  createMoveRecord,
  getAllLegalMoves,
  getWinner,
  keyOf,
  legalMoves,
  replayGame,
  SETUPS,
  type Board,
  type Coord,
  type Player,
  parseGame,
} from "../lib/game/engine.ts";
import { chooseComputerMove } from "../lib/game/ai.ts";
import { PUZZLES } from "../lib/game/puzzles.ts";

const boardWith = (pieces: Array<[Coord, Player]>): Board => Object.fromEntries(
  pieces.map(([coord, player]) => [keyOf(coord), player]),
);

const right = DIRECTIONS.find((direction) => direction.label === "right")!;
const downRight = DIRECTIONS.find((direction) => direction.label === "down right")!;
const conformance = JSON.parse(readFileSync(
  new URL("../research/fixtures/conformance.json", import.meta.url),
  "utf8",
)) as {
  setups: Record<string, { black: number; white: number }>;
  positions: Array<{
    id: string;
    board: Record<string, Player>;
    player: Player;
    selected: string[];
    legalDirections?: number[];
    illegalDirections?: number[];
    applyDirection?: number;
    captured?: number;
  }>;
};

test("the standard board has 61 cells and 14 marbles per player", () => {
  const board = createInitialBoard();
  assert.equal(CELLS.length, 61);
  assert.equal(Object.values(board).filter((player) => player === "black").length, 14);
  assert.equal(Object.values(board).filter((player) => player === "white").length, 14);
});

test("a single marble can move into each empty neighboring cell", () => {
  const board = boardWith([[{ q: 0, r: 0 }, "black"]]);
  const moves = legalMoves(board, [{ q: 0, r: 0 }], "black");
  assert.equal(moves.length, 6);
  const result = applyMove(board, [{ q: 0, r: 0 }], "black", { black: 0, white: 0 }, moves.find((move) => move.direction === right)!);
  assert.equal(result.board["1,0"], "black");
  assert.equal(result.board["0,0"], undefined);
});

test("a connected line can move broadside", () => {
  const selected = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
  const board = boardWith(selected.map((coord) => [coord, "black"]));
  const move = legalMoves(board, selected, "black").find((candidate) => candidate.direction === downRight)!;
  const result = applyMove(board, selected, "black", { black: 0, white: 0 }, move);
  assert.equal(result.board["0,1"], "black");
  assert.equal(result.board["1,1"], "black");
});

test("a stronger inline group pushes a weaker opposing line", () => {
  const selected = [{ q: -1, r: 0 }, { q: 0, r: 0 }];
  const board = boardWith([
    [selected[0], "black"], [selected[1], "black"], [{ q: 1, r: 0 }, "white"],
  ]);
  const move = legalMoves(board, selected, "black").find((candidate) => candidate.direction === right)!;
  const result = applyMove(board, selected, "black", { black: 0, white: 0 }, move);
  assert.equal(result.board["0,0"], "black");
  assert.equal(result.board["1,0"], "black");
  assert.equal(result.board["2,0"], "white");
});

test("an edge push captures a marble and increments the attacker's score", () => {
  const selected = [{ q: 2, r: 0 }, { q: 3, r: 0 }];
  const board = boardWith([
    [selected[0], "black"], [selected[1], "black"], [{ q: 4, r: 0 }, "white"],
  ]);
  const move = legalMoves(board, selected, "black").find((candidate) => candidate.direction === right)!;
  const result = applyMove(board, selected, "black", { black: 5, white: 0 }, move);
  assert.equal(result.captured, 1);
  assert.equal(result.scores.black, 6);
  assert.equal(getWinner(result.scores), "black");
});

test("equal inline groups cannot push each other", () => {
  const selected = [{ q: -1, r: 0 }, { q: 0, r: 0 }];
  const board = boardWith([
    [selected[0], "black"], [selected[1], "black"],
    [{ q: 1, r: 0 }, "white"], [{ q: 2, r: 0 }, "white"],
  ]);
  assert.equal(legalMoves(board, selected, "black").some((move) => move.direction === right), false);
});

test("the engine can enumerate complete moves for a future AI", () => {
  const moves = getAllLegalMoves(createInitialBoard(), "black");
  assert.ok(moves.length > 0);
  assert.ok(moves.every((move) => move.selected.length >= 1 && move.selected.length <= 3));
});

test("every supported opening contains 14 marbles per player", () => {
  for (const setup of Object.values(SETUPS)) {
    const board = createInitialBoard(setup.id);
    assert.equal(Object.values(board).filter((player) => player === "black").length, 14, setup.name);
    assert.equal(Object.values(board).filter((player) => player === "white").length, 14, setup.name);
  }
});

test("the TypeScript engine satisfies the shared Python conformance fixtures", () => {
  for (const [setupId, expected] of Object.entries(conformance.setups)) {
    const board = createInitialBoard(setupId as keyof typeof SETUPS);
    assert.equal(Object.values(board).filter((player) => player === "black").length, expected.black, setupId);
    assert.equal(Object.values(board).filter((player) => player === "white").length, expected.white, setupId);
  }

  for (const fixture of conformance.positions) {
    const selected = fixture.selected.map((value) => {
      const [q, r] = value.split(",").map(Number);
      return { q, r };
    });
    const moves = legalMoves(fixture.board, selected, fixture.player);
    const directions = moves.map((move) => DIRECTIONS.indexOf(move.direction));
    fixture.legalDirections?.forEach((direction) => assert.ok(directions.includes(direction), fixture.id));
    fixture.illegalDirections?.forEach((direction) => assert.ok(!directions.includes(direction), fixture.id));
    if (fixture.applyDirection !== undefined) {
      const move = moves.find((candidate) => DIRECTIONS.indexOf(candidate.direction) === fixture.applyDirection);
      assert.ok(move, fixture.id);
      assert.equal(applyMove(fixture.board, selected, fixture.player, { black: 0, white: 0 }, move).captured, fixture.captured);
    }
  }
});

test("recorded moves reproduce the same position", () => {
  const board = createInitialBoard();
  const move = getAllLegalMoves(board, "black")[0];
  const result = applyMove(board, move.selected, "black", { black: 0, white: 0 }, move);
  const replay = replayGame("standard", [createMoveRecord(move.selected, move, "black", result.captured)]);
  assert.deepEqual(replay.board, result.board);
  assert.deepEqual(replay.scores, result.scores);
  assert.equal(replay.currentPlayer, "white");
});

test("the computer opponent always returns a legal move", () => {
  const board = createInitialBoard();
  const choice = chooseComputerMove(board, { black: 0, white: 0 }, "black", "medium");
  assert.ok(choice);
  assert.ok(getAllLegalMoves(board, "black").some((move) =>
    move.direction.label === choice.move.direction.label
      && move.selected.map(keyOf).sort().join(";") === choice.move.selected.map(keyOf).sort().join(";"),
  ));
});

test("the computer recognizes an immediate capture", () => {
  const board = boardWith([
    [{ q: 2, r: 0 }, "black"], [{ q: 3, r: 0 }, "black"], [{ q: 4, r: 0 }, "white"],
  ]);
  const choice = chooseComputerMove(board, { black: 0, white: 0 }, "black", "easy");
  assert.ok(choice);
  const result = applyMove(board, choice.move.selected, "black", { black: 0, white: 0 }, choice.move);
  assert.equal(result.captured, 1);
});

test("every training puzzle has a legal capturing solution", () => {
  for (const puzzle of Object.values(PUZZLES)) {
    const capturingMove = getAllLegalMoves(puzzle.board, puzzle.currentPlayer).find((move) =>
      applyMove(puzzle.board, move.selected, puzzle.currentPlayer, puzzle.scores, move).captured > 0,
    );
    assert.ok(capturingMove, puzzle.name);
  }
});

test("shared game records reject setup names inherited from Object.prototype", () => {
  for (const setup of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    // Rejected up front with the proper message, not by a crash later in the replay.
    assert.throws(() => parseGame(JSON.stringify({ version: 1, setup, moves: [] })), /Unsupported Sumito match record/, `${setup} must be rejected`);
  }
});
