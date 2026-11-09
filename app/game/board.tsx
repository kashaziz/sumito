"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import {
  CELLS,
  DIRECTIONS,
  PLAYER_NAMES,
  add,
  isInside,
  keyOf,
  otherPlayer,
  parseCoord,
  same,
  type Board as BoardState,
  type Coord,
  type LegalMove,
  type Player,
} from "../../lib/game/engine";
import { CELL_STEP_X, CELL_STEP_Y, cellPosition, coordFromPoint, directionFromVector, lineFromDrag, ringOf, type MotionPlan } from "../../lib/game/ui";
import { EASE_IN_OUT, EASE_OUT, getMotionScale, vibrate } from "./motion";

export type BoardMotion = { id: number; plan: MotionPlan; player: Player; animated: boolean };
export type BoardShake = { id: number; key: string };

type CellView = { coord: Coord; key: string; style: CSSProperties };
const CELL_VIEWS: CellView[] = CELLS.map((coord) => {
  const { x, y } = cellPosition(coord);
  return { coord, key: keyOf(coord), style: { "--x": `${x}%`, "--y": `${y}%`, "--ring": ringOf(coord) } as CSSProperties };
});
const positionStyle = (coord: Coord) => {
  const { x, y } = cellPosition(coord);
  return { "--x": `${x}%`, "--y": `${y}%` } as CSSProperties;
};

const DRAG_START_PX = 10;
const SWIPE_COMMIT_PX = 24;

type CellProps = {
  cellKey: string;
  style: CSSProperties;
  occupant: Player | undefined;
  playable: boolean;
  selected: boolean;
  blocked: boolean;
  target: boolean;
  targetOrder: number;
  tabbable: boolean;
  register: (key: string, element: HTMLButtonElement | null) => void;
};

const Cell = memo(function Cell({ cellKey, style, occupant, playable, selected, blocked, target, targetOrder, tabbable, register }: CellProps) {
  const className = [
    "cell",
    occupant ? `has-marble ${occupant}` : "",
    playable ? "is-playable" : "",
    selected ? "is-selected" : "",
    blocked ? "is-blocked-selection" : "",
    target ? "is-target" : "",
  ].filter(Boolean).join(" ");
  const label = occupant
    ? `${PLAYER_NAMES[occupant]} marble${playable ? ", available to move" : ""}${selected ? ", selected" : ""}${target ? ", can be pushed" : ""}`
    : target ? "Legal destination" : "Empty space";
  return <button
    type="button"
    className={className}
    data-key={cellKey}
    style={target ? { ...style, "--i": Math.min(targetOrder, 6) } as CSSProperties : style}
    aria-label={label}
    aria-pressed={selected}
    tabIndex={tabbable ? 0 : -1}
    ref={(element) => register(cellKey, element)}
  >
    <span className="cell-well" />
    {occupant && <span className="marble" />}
    {target && !occupant && <span className="move-dot" />}
  </button>;
});

type BoardProps = {
  board: BoardState;
  currentPlayer: Player;
  interactive: boolean;
  reviewing: boolean;
  winner: Player | null;
  selected: Coord[];
  playable: Set<string>;
  moves: LegalMove[];
  moveTargets: Map<string, LegalMove>;
  motion: BoardMotion | null;
  shake: BoardShake | null;
  onTap: (coord: Coord) => void;
  onSelectLine: (line: Coord[]) => void;
  onMove: (move: LegalMove) => void;
  onClear: () => void;
};

type Gesture = {
  pointerId: number;
  start: Coord;
  x: number;
  y: number;
  kind: "select" | "swipe";
  active: boolean;
  line: Coord[] | null;
  move: LegalMove | null;
};

export function GameBoard(props: BoardProps) {
  const { board, currentPlayer, interactive, reviewing, winner, selected, playable, moves, moveTargets, motion, shake, onTap, onSelectLine, onMove, onClear } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef(new Map<string, HTMLButtonElement>());
  const runningRef = useRef<Animation[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  // A drag ends with a browser click on the release cell; swallow only that one.
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<LegalMove | null>(null);
  const [dragLine, setDragLine] = useState<string[] | null>(null);
  const [fallDone, setFallDone] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState("0,0");

  const register = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) cellsRef.current.set(key, element);
    else cellsRef.current.delete(key);
  }, []);

  const selectedKeys = useMemo(() => new Set(dragLine ?? selected.map(keyOf)), [dragLine, selected]);
  const blockedSelection = !dragLine && selected.length > 0 && moves.length === 0;
  const targetOrder = useMemo(() => {
    const order = new Map<string, number>();
    [...moveTargets.keys()].forEach((key, index) => order.set(key, index));
    return order;
  }, [moveTargets]);

  const finishRunning = useCallback(() => {
    runningRef.current.forEach((animation) => animation.finish());
    runningRef.current = [];
  }, []);

  // Slide moved and pushed marbles from their previous cell; drop captured marbles off the edge.
  useLayoutEffect(() => {
    const element = boardRef.current;
    if (!motion || !motion.animated || !element) return;
    const scale = getMotionScale();
    if (!scale) return;
    const width = element.clientWidth;
    const stepX = (motion.plan.direction.q + motion.plan.direction.r / 2) * CELL_STEP_X / 100 * width;
    const stepY = motion.plan.direction.r * CELL_STEP_Y / 100 * width;
    const animations: Animation[] = [];
    const slide = (key: string, delay: number) => {
      const marble = cellsRef.current.get(key)?.querySelector(".marble");
      if (!marble) return;
      animations.push(marble.animate(
        [{ transform: `translate(${-stepX}px, ${-stepY}px)` }, { transform: "translate(0, 0)" }],
        { duration: 220 * scale, delay: delay * scale, easing: EASE_OUT, fill: "backwards" },
      ));
    };
    motion.plan.moved.forEach((key) => slide(key, 0));
    motion.plan.pushed.forEach((key) => slide(key, 40));
    const falls = [...element.querySelectorAll<HTMLElement>(`[data-fall="${motion.id}"]`)].map((faller) => faller.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${stepX}px, ${stepY}px) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${stepX * 1.35}px, ${stepY * 1.35 + width * 0.05}px) scale(.55)`, opacity: 0 },
    ], { duration: 420 * scale, delay: 40 * scale, easing: EASE_IN_OUT, fill: "both" }));
    animations.push(...falls);
    runningRef.current = animations;
    if (falls.length) {
      Promise.all(falls.map((animation) => animation.finished)).then(() => {
        setFallDone(motion.id);
        vibrate(15);
        element.animate([{ transform: "translateX(0)" }, { transform: "translateX(2px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }], { duration: 200 * scale });
      }).catch(() => setFallDone(motion.id));
    }
    return () => animations.forEach((animation) => animation.finish());
  }, [motion]);

  // Invalid tap: a short shake replaces a warning sentence.
  useLayoutEffect(() => {
    if (!shake) return;
    const scale = getMotionScale();
    const marble = cellsRef.current.get(shake.key)?.querySelector(".marble");
    if (!scale || !marble) return;
    marble.animate([{ translate: "0" }, { translate: "-4px 0" }, { translate: "4px 0" }, { translate: "0" }], { duration: 180 * scale, easing: "ease" });
  }, [shake]);

  const pointToCoord = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const coord = coordFromPoint(
      (clientX - rect.left - rect.width / 2) / rect.width * 100,
      (clientY - rect.top - rect.height / 2) / rect.height * 100,
    );
    return isInside(coord) ? coord : null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    finishRunning();
    suppressClick.current = false;
    if (!interactive || (event.pointerType === "mouse" && event.button !== 0)) return;
    const cell = (event.target as Element).closest<HTMLElement>("[data-key]");
    if (!cell?.dataset.key) return;
    const coord = parseCoord(cell.dataset.key);
    const isSelected = selected.some((item) => same(item, coord));
    const kind = isSelected && moves.length ? "swipe" : board[cell.dataset.key] === currentPlayer ? "select" : null;
    if (!kind) return;
    gestureRef.current = { pointerId: event.pointerId, start: coord, x: event.clientX, y: event.clientY, kind, active: false, line: null, move: null };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (event.pointerType === "mouse" && !gesture) {
        const key = (event.target as Element).closest<HTMLElement>("[data-key]")?.dataset.key;
        const next = key ? moveTargets.get(key) ?? null : null;
        if (next !== preview) setPreview(next);
      }
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const distance = Math.hypot(dx, dy);
    if (!gesture.active) {
      if (distance < DRAG_START_PX) return;
      gesture.active = true;
      boardRef.current?.setPointerCapture(event.pointerId);
    }
    if (gesture.kind === "swipe") {
      const direction = DIRECTIONS[directionFromVector(dx, dy)];
      const move = distance >= SWIPE_COMMIT_PX ? moves.find((candidate) => same(candidate.direction, direction)) ?? null : null;
      gesture.move = move;
      if (move !== preview) setPreview(move);
      return;
    }
    const coord = pointToCoord(event.clientX, event.clientY);
    const line = coord ? lineFromDrag(gesture.start, coord) : null;
    if (line && line.every((item) => board[keyOf(item)] === currentPlayer)) {
      gesture.line = line;
      const keys = line.map(keyOf);
      if (keys.join("|") !== dragLine?.join("|")) setDragLine(keys);
    }
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture.active) return;
    suppressClick.current = true;
    setPreview(null);
    setDragLine(null);
    if (!commit) return;
    if (gesture.kind === "swipe" && gesture.move) onMove(gesture.move);
    if (gesture.kind === "select" && gesture.line) onSelectLine(gesture.line);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const key = (event.target as Element).closest<HTMLElement>("[data-key]")?.dataset.key;
    if (key) {
      setFocusKey(key);
      onTap(parseCoord(key));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (event.key === "Escape") {
      onClear();
      return;
    }
    const steps: Record<string, Coord[]> = {
      ArrowRight: [DIRECTIONS[0]],
      ArrowLeft: [DIRECTIONS[3]],
      ArrowDown: [DIRECTIONS[1], DIRECTIONS[2]],
      ArrowUp: [DIRECTIONS[5], DIRECTIONS[4]],
    };
    const options = steps[event.key];
    if (!options) return;
    event.preventDefault();
    const from = parseCoord((event.target as HTMLElement).dataset.key ?? focusKey);
    const next = options.map((step) => add(from, step)).find(isInside);
    if (!next) return;
    const key = keyOf(next);
    setFocusKey(key);
    cellsRef.current.get(key)?.focus();
  };

  const showFallers = motion && motion.animated && fallDone !== motion.id && motion.plan.fallen.length > 0;
  const ghostCells = preview ? preview.destinations.filter(isInside) : [];
  const ghostPushed = preview ? preview.opponents.map((coord) => add(coord, preview.direction)).filter(isInside) : [];
  const ghostFalls = preview ? preview.opponents.filter((coord) => !isInside(add(coord, preview.direction))) : [];

  return <div className="board-frame">
    <div className="board-plate" aria-hidden="true" />
    <div
      ref={boardRef}
      className={["board", reviewing ? "is-reviewing" : "", winner && !reviewing ? `is-won won-${winner}` : ""].filter(Boolean).join(" ")}
      role="group"
      aria-label="Hexagonal game board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endGesture(event, true)}
      onPointerCancel={(event) => endGesture(event, false)}
      onPointerLeave={(event) => { if (event.pointerType === "mouse" && !gestureRef.current) setPreview(null); }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={(event) => { const key = (event.target as HTMLElement).dataset.key; if (key && key !== focusKey) setFocusKey(key); }}
    >
      {CELL_VIEWS.map(({ key, style }) => {
        const occupant = board[key];
        const isSelected = !reviewing && selectedKeys.has(key);
        return <Cell
          key={key}
          cellKey={key}
          style={style}
          occupant={occupant}
          playable={!reviewing && playable.has(key)}
          selected={isSelected}
          blocked={isSelected && blockedSelection}
          target={!reviewing && !dragLine && moveTargets.has(key)}
          targetOrder={targetOrder.get(key) ?? 0}
          tabbable={key === focusKey}
          register={register}
        />;
      })}
      {ghostCells.map((coord) => <span className="ghost" style={positionStyle(coord)} key={`g${keyOf(coord)}`} />)}
      {ghostPushed.map((coord) => <span className="ghost is-pushed" style={positionStyle(coord)} key={`p${keyOf(coord)}`} />)}
      {ghostFalls.map((coord) => <span className="ghost is-falling" style={positionStyle(add(coord, preview!.direction))} key={`f${keyOf(coord)}`}>×</span>)}
      {showFallers && motion.plan.fallen.map((coord) => <span
        className={`faller ${otherPlayer(motion.player)}`}
        data-fall={motion.id}
        style={positionStyle(coord)}
        key={`${motion.id}-${keyOf(coord)}`}
      ><span className="marble" /></span>)}
    </div>
  </div>;
}
