import { DIRECTIONS, add, isInside, keyOf, same, type Coord, type Direction, type LegalMove } from "./engine.ts";

/** Horizontal and vertical spacing between cell centres, as a percentage of the board width. */
export const CELL_STEP_X = 10.35;
export const CELL_STEP_Y = 8.95;

/** Short arrow glyph for each entry in DIRECTIONS (same order). */
export const DIRECTION_GLYPHS = ["→", "↘", "↙", "←", "↖", "↗"] as const;

/** Cell centre offset from the board centre, in percent of the board size. */
export function cellPosition({ q, r }: Coord) {
  return { x: (q + r / 2) * CELL_STEP_X, y: r * CELL_STEP_Y };
}

/** Screen vector of one step in a direction, in percent of the board size. */
export function directionVector(direction: Coord) {
  return cellPosition(direction);
}

/** Nearest hex cell for a point given in percent offsets from the board centre (cube rounding). */
export function coordFromPoint(xPercent: number, yPercent: number): Coord {
  const rf = yPercent / CELL_STEP_Y;
  const qf = xPercent / CELL_STEP_X - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}

/** Index into DIRECTIONS whose screen direction is closest to the given drag vector. */
export function directionFromVector(dx: number, dy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  DIRECTIONS.forEach((direction, index) => {
    const vector = directionVector(direction);
    const length = Math.hypot(vector.x, vector.y);
    const score = (dx * vector.x + dy * vector.y) / length;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

const RADIUS_LIMIT = 8;

/**
 * Cells of a straight line dragged from `start` towards `current`.
 * Returns up to three cells, or null when `current` is not on one of the six axes.
 */
export function lineFromDrag(start: Coord, current: Coord): Coord[] | null {
  if (same(start, current)) return [start];
  for (const direction of DIRECTIONS) {
    let cursor = start;
    const line = [start];
    for (let step = 1; step <= RADIUS_LIMIT; step += 1) {
      cursor = add(cursor, direction);
      if (step <= 2) line.push(cursor);
      if (same(cursor, current)) return line;
    }
  }
  return null;
}

export type MotionPlan = {
  direction: Direction;
  /** Keys of cells that now hold the moving player's marbles. */
  moved: string[];
  /** Keys of cells that now hold pushed opponent marbles. */
  pushed: string[];
  /** Original cells of opponent marbles pushed off the board. */
  fallen: Coord[];
};

/** Describe what moved where, so the UI can animate from the previous cell. */
export function motionPlan(move: LegalMove): MotionPlan {
  const pushed: string[] = [];
  const fallen: Coord[] = [];
  move.opponents.forEach((coord) => {
    const destination = add(coord, move.direction);
    if (isInside(destination)) pushed.push(keyOf(destination));
    else fallen.push(coord);
  });
  return {
    direction: move.direction,
    moved: move.destinations.map(keyOf),
    pushed,
    fallen,
  };
}

/**
 * Board plate geometry, in percent of the board frame, measured from the centre.
 * The plate is a regular hexagon with vertices left and right. These numbers must match
 * `.board-plate` in app/globals.css (left/right 1.5%, top/bottom 8%).
 */
export const PLATE_HALF_WIDTH = 48.5;
export const PLATE_APOTHEM = 42;
/** Visible hole radius: cell size 10.3% with a 9% inset on each side. */
export const WELL_RADIUS = (10.3 * (1 - 2 * 0.09)) / 2;

/** Shortest distance from a point to the plate edge (negative when outside). */
export function distanceInsidePlate(x: number, y: number) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const topBottom = PLATE_APOTHEM - ay;
  // Slanted edge through (PLATE_HALF_WIDTH, 0) and (PLATE_HALF_WIDTH / 2, PLATE_APOTHEM).
  const slanted = (PLATE_HALF_WIDTH - ax) * Math.sin(Math.PI / 3) - ay * Math.cos(Math.PI / 3);
  return Math.min(topBottom, slanted);
}

/** Ring number from the centre (0 = centre cell, 4 = outer edge). Drives the idle ripple. */
export const ringOf = ({ q, r }: Coord) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
