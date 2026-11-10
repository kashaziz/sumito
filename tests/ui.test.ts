import assert from "node:assert/strict";
import test from "node:test";
import { CELLS, DIRECTIONS, keyOf, legalMoves, type Board } from "../lib/game/engine.ts";
import { normalizeDomain } from "../lib/site.ts";
import { DIRECTION_GLYPHS, PLATE_APOTHEM, PLATE_HALF_WIDTH, WELL_RADIUS, cellPosition, coordFromPoint, directionFromVector, distanceInsidePlate, lineFromDrag, motionPlan } from "../lib/game/ui.ts";

test("every cell centre maps back to the same cell", () => {
  CELLS.forEach((coord) => {
    const { x, y } = cellPosition(coord);
    assert.deepEqual(coordFromPoint(x, y), coord);
    assert.deepEqual(coordFromPoint(x + 3, y - 3), coord, `small offset near ${keyOf(coord)}`);
  });
});

test("a drag vector snaps to the matching hex direction", () => {
  DIRECTIONS.forEach((direction, index) => {
    const { x, y } = cellPosition(direction);
    assert.equal(directionFromVector(x, y), index);
    assert.equal(directionFromVector(x * 40 + y * 4, y * 40 - x * 4), index, "slightly rotated swipe");
  });
  assert.equal(DIRECTION_GLYPHS.length, DIRECTIONS.length);
});

test("drag-select builds straight lines of at most three", () => {
  const start = { q: 0, r: 0 };
  assert.deepEqual(lineFromDrag(start, start), [start]);
  assert.deepEqual(lineFromDrag(start, { q: 1, r: 0 }), [start, { q: 1, r: 0 }]);
  assert.deepEqual(lineFromDrag(start, { q: 0, r: 2 }), [start, { q: 0, r: 1 }, { q: 0, r: 2 }]);
  assert.deepEqual(lineFromDrag(start, { q: 4, r: 0 }), [start, { q: 1, r: 0 }, { q: 2, r: 0 }], "long drags cap at three");
  assert.equal(lineFromDrag(start, { q: 2, r: 1 }), null, "off-axis cells are not a line");
});

test("motion plan separates moved, pushed and fallen marbles", () => {
  const board: Board = { "1,0": "black", "2,0": "black", "3,0": "white", "4,0": "white" };
  const selected = [{ q: 1, r: 0 }, { q: 2, r: 0 }];
  const blocked = legalMoves(board, selected, "black").find((move) => move.direction.label === "right");
  assert.equal(blocked, undefined, "two cannot push two");

  const strong: Board = { "0,0": "black", "1,0": "black", "2,0": "black", "3,0": "white", "4,0": "white" };
  const line = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
  const push = legalMoves(strong, line, "black").find((move) => move.direction.label === "right");
  assert.ok(push);
  const plan = motionPlan(push);
  assert.deepEqual(plan.moved, ["1,0", "2,0", "3,0"]);
  assert.deepEqual(plan.pushed, ["4,0"]);
  assert.deepEqual(plan.fallen, [{ q: 4, r: 0 }]);
});

test("every hole sits fully inside the board plate", () => {
  CELLS.forEach((coord) => {
    const { x, y } = cellPosition(coord);
    const inside = distanceInsidePlate(x, y);
    assert.ok(inside >= WELL_RADIUS + 1, `${keyOf(coord)} is only ${inside.toFixed(2)}% inside; needs ${(WELL_RADIUS + 1).toFixed(2)}%`);
  });
});

test("the plate is a regular hexagon", () => {
  assert.ok(Math.abs(PLATE_APOTHEM - PLATE_HALF_WIDTH * Math.sqrt(3) / 2) < 0.1);
});

test("custom domains are normalised to a bare host name", () => {
  for (const input of ["sumito.example.com", "https://sumito.example.com", "https://sumito.example.com/", " HTTP://Sumito.Example.com/path?x=1 ", "sumito.example.com/"]) {
    assert.equal(normalizeDomain(input), "sumito.example.com", input);
  }
  assert.equal(normalizeDomain(""), undefined);
  assert.equal(normalizeDomain("   "), undefined);
  assert.equal(normalizeDomain(undefined), undefined);
});
